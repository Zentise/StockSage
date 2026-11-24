"""Replay the engine and every strategy over history and compare each with random stocks.

    python -m backend.replay india us

For each past day a strategy sees only bars up to that day. Trades fill at the next open and
run under the same outcome rules as live signals. The control buys every other stock on the
same day with the same stop/target rule, so a rising market cannot pass for skill.

A strategy is only called *validated* when it clears a deliberately strict bar (see `validated`),
because several candidates are tried and the best of several always looks better than it is.

Known flattery: it uses today's index members, so past losers that were dropped are missing.
"""

import json
import os
import sys
from collections import defaultdict
from concurrent.futures import ProcessPoolExecutor
from datetime import date, timedelta
from pathlib import Path

import numpy as np
import pandas as pd

from backend import universe
from backend.engine import strategies as st
from backend.engine.outcome import resolve
from backend.engine.signals import RULES, evaluate, levels
from backend.providers import yahoo

OUT = Path(__file__).parent / "data" / "replay.json"
WARMUP = 260
COST_R_PCT = {"india": 0.0025, "us": 0.0005}   # round trip incl. slippage, as a share of price
MIN_TRADES = 100


def _trade(df: pd.DataFrame, i: int, price: float, atr: float, cat: str):
    hold = RULES[cat][3]
    if i + 1 + hold >= len(df):
        return None            # not enough future: drop it rather than guess
    stop, target = levels(price, atr, cat, True)
    created = df.index[i] + timedelta(hours=8)
    out = resolve(df.iloc[i + 1: i + 2 + hold], "BUY", price, stop, target, created.to_pydatetime(),
                  df.index[i + 1 + hold].to_pydatetime(), pending=True)
    if out.r is None:
        return None
    return out.r, out.status, out.exit_at, out.entry / (out.entry - stop)


def _signals(args):
    """{strategy key: [(ticker, i, date, category, r, status, exit_at, leverage), ...]} for one stock."""
    ticker, df = args
    atr = st.features(df).atr
    found: dict[str, list] = defaultdict(list)
    for key, mask in st.masks(df).items():
        busy = df.index[0]
        for i in np.flatnonzero(mask.to_numpy()):
            if i < WARMUP or df.index[i] <= busy or not np.isfinite(atr.iloc[i]):
                continue
            t = _trade(df, int(i), float(df["Close"].iloc[i]), float(atr.iloc[i]), "short_term")
            if t:
                found[key].append((ticker, int(i), df.index[i], "short_term", *t))
                busy = pd.Timestamp(t[2])
    busy = df.index[0]
    for i in range(WARMUP, len(df) - 1):
        if df.index[i] <= busy:
            continue
        s = evaluate(ticker, df.iloc[i - WARMUP: i + 1])
        if not s or s.direction != "BUY":
            continue
        t = _trade(df, i, s.entry, (s.entry - s.stop) / RULES[s.category][0], s.category)
        if t:
            found[st.BASELINE].append((ticker, i, df.index[i], s.category, *t))
            busy = pd.Timestamp(t[2])
    return found


def _boot(values: list[float], groups: list[str], seed: int = 5) -> tuple[float, float]:
    """95% range by resampling whole months: trades in one month share the same market."""
    by = defaultdict(list)
    for v, g in zip(values, groups, strict=True):
        by[g].append(v)
    g = [np.array(v) for v in by.values()]
    rng = np.random.default_rng(seed)
    boot = [np.concatenate([g[k] for k in rng.integers(0, len(g), len(g))]).mean() for _ in range(3000)]
    return float(np.percentile(boot, 2.5)), float(np.percentile(boot, 97.5))


def summarize(rows: list[dict]) -> dict:
    if not rows:
        return {"n": 0}
    r, c = np.array([x["r"] for x in rows]), np.array([x["control"] for x in rows])
    diff = [x["r"] - x["control"] for x in rows]
    low, high = _boot(diff, [x["date"][:7] for x in rows])
    ordered = sorted(rows, key=lambda x: x["date"])
    half = len(ordered) // 2
    first = float(np.mean([x["r"] - x["control"] for x in ordered[:half]])) if half else None
    second = float(np.mean([x["r"] - x["control"] for x in ordered[half:]])) if half else None
    return {
        "n": len(rows), "target": sum(x["status"] == "target" for x in rows), "stop": sum(x["status"] == "stop" for x in rows),
        "avg_r": round(float(r.mean()), 3), "avg_r_net": round(float(np.mean([x["net"] for x in rows])), 3),
        "control_r": round(float(c.mean()), 3), "edge_r": round(float((r - c).mean()), 3),
        "edge_low": round(low, 3), "edge_high": round(high, 3),
        "edge_first_half": None if first is None else round(first, 3),
        "edge_second_half": None if second is None else round(second, 3),
    }


def validated(s: dict) -> bool:
    """Strict on purpose: enough trades, better than random beyond luck, better in both halves
    of the period, and still profitable after costs. Failing any one means 'not proven'."""
    return bool(
        s.get("n", 0) >= MIN_TRADES and (s.get("edge_low") or -1) > 0
        and (s.get("edge_first_half") or -1) > 0 and (s.get("edge_second_half") or -1) > 0
        and (s.get("avg_r_net") or -1) > 0
    )


def run(market: str) -> dict:
    data = {s.ticker: df for s in universe.stocks(market) if len(df := yahoo.candles(s.ticker, "5y", "1d")) > WARMUP + 80}
    print(f"{len(data)} stocks", flush=True)
    atr = {t: st.features(df).atr for t, df in data.items()}
    pos = {t: {d.date(): i for i, d in enumerate(df.index)} for t, df in data.items()}
    with ProcessPoolExecutor(max(1, (os.cpu_count() or 2) - 2)) as ex:
        per_stock = list(ex.map(_signals, data.items()))
    trades: dict[str, list] = defaultdict(list)
    for found in per_stock:
        for key, items in found.items():
            trades[key] += items
    print({k: len(v) for k, v in trades.items()}, flush=True)
    cache: dict = {}

    def control(when, cat, ticker):
        key = (when.date(), cat)
        if key not in cache:
            res = {}
            for t, df in data.items():
                i = pos[t].get(when.date())
                if i is not None and i >= 20 and np.isfinite(atr[t].iloc[i]):
                    x = _trade(df, i, float(df["Close"].iloc[i]), float(atr[t].iloc[i]), cat)
                    if x:
                        res[t] = x[0]
            cache[key] = res
        return [v for t, v in cache[key].items() if t != ticker]

    rows_by: dict[str, list[dict]] = {}
    for key, items in trades.items():
        rows = []
        for ticker, _, when, cat, r, status, _, leverage in items:
            others = control(when, cat, ticker)
            if len(others) >= 10:
                rows.append({"date": str(when.date()), "cat": cat, "r": r, "status": status,
                             "net": r - COST_R_PCT[market] * leverage, "control": float(np.mean(others))})
        rows_by[key] = rows
    base = rows_by.get(st.BASELINE, [])
    every = [x for rows in rows_by.values() for x in rows]
    setups = {}
    for key, rows in rows_by.items():
        if not rows:
            continue
        summary = summarize(rows)
        setups[key] = summary | {
            "label": st.LABELS[key], "validated": validated(summary),
            "by_year": {y: summarize([x for x in rows if x["date"].startswith(y)]) for y in sorted({x["date"][:4] for x in rows})},
        }
    return {
        "market": market, "ran": date.today().isoformat(), "stocks": len(data),
        "start": min(x["date"] for x in every), "end": max(x["date"] for x in every),
        "overall": summarize(base),
        "by_category": {c: summarize([x for x in base if x["cat"] == c]) for c in ("short_term", "long_term")},
        "by_year": {y: summarize([x for x in base if x["date"].startswith(y)]) for y in sorted({x["date"][:4] for x in base})},
        "by_setup": setups,
    }


if __name__ == "__main__":
    existing = json.loads(OUT.read_text()) if OUT.exists() else {}
    for m in sys.argv[1:] or ["india"]:
        existing[m] = run(m)
        print(json.dumps({k: v for k, v in existing[m].items() if k != "by_year"}, indent=1), flush=True)
    OUT.write_text(json.dumps(existing, indent=1))
