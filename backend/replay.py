"""Replay the live engine over history and compare it with random stocks.

    python -m backend.replay india

For each past day the engine sees only bars up to that day. Trades fill at the next open and
run under the same outcome rules as live signals. The control buys every other stock on the
same day with the same stop/target rule, so a rising market cannot pass for skill.

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
from backend.engine.outcome import resolve
from backend.engine.signals import RULES, evaluate, levels
from backend.providers import yahoo

OUT = Path(__file__).parent / "data" / "replay.json"
WARMUP = 260
COST_R_PCT = {"india": 0.0025, "us": 0.0005}   # round trip incl. slippage, as a share of price


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


def _atr(df: pd.DataFrame) -> pd.Series:
    prev = df["Close"].shift(1)
    tr = pd.concat([df["High"] - df["Low"], (df["High"] - prev).abs(), (df["Low"] - prev).abs()], axis=1).max(axis=1)
    return tr.rolling(14).mean()


def _signals(args):
    ticker, df = args
    found, busy = [], df.index[0]
    for i in range(WARMUP, len(df) - 1):
        if df.index[i] <= busy:
            continue
        s = evaluate(ticker, df.iloc[i - WARMUP: i + 1])
        if not s or s.direction != "BUY":
            continue
        t = _trade(df, i, s.entry, (s.entry - s.stop) / RULES[s.category][0], s.category)
        if t:
            found.append((ticker, i, df.index[i], s.category, *t))
            busy = pd.Timestamp(t[2])
    return found


def summarize(rows: list[dict]) -> dict:
    if not rows:
        return {"n": 0}
    r, c = np.array([x["r"] for x in rows]), np.array([x["control"] for x in rows])
    groups = defaultdict(list)
    for x in rows:
        groups[x["date"][:7]].append(x["r"] - x["control"])
    g = [np.array(v) for v in groups.values()]
    rng = np.random.default_rng(5)
    boot = [np.concatenate([g[k] for k in rng.integers(0, len(g), len(g))]).mean() for _ in range(3000)]
    return {
        "n": len(rows), "target": sum(x["status"] == "target" for x in rows), "stop": sum(x["status"] == "stop" for x in rows),
        "avg_r": round(float(r.mean()), 3), "avg_r_net": round(float(np.mean([x["net"] for x in rows])), 3),
        "control_r": round(float(c.mean()), 3), "edge_r": round(float((r - c).mean()), 3),
        "edge_low": round(float(np.percentile(boot, 2.5)), 3), "edge_high": round(float(np.percentile(boot, 97.5)), 3),
    }


def run(market: str) -> dict:
    data = {s.ticker: df for s in universe.stocks(market) if len(df := yahoo.candles(s.ticker, "5y", "1d")) > WARMUP + 80}
    print(f"{len(data)} stocks")
    atr = {t: _atr(df) for t, df in data.items()}
    pos = {t: {d.date(): i for i, d in enumerate(df.index)} for t, df in data.items()}
    with ProcessPoolExecutor(max(1, (os.cpu_count() or 2) - 2)) as ex:
        trades = [t for chunk in ex.map(_signals, data.items()) for t in chunk]
    print(f"{len(trades)} trades")
    cache, rows = {}, []
    for ticker, _, when, cat, r, status, _, leverage in trades:
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
        others = [v for t, v in cache[key].items() if t != ticker]
        if len(others) >= 10:
            rows.append({"date": str(when.date()), "cat": cat, "r": r, "status": status,
                         "net": r - COST_R_PCT[market] * leverage, "control": float(np.mean(others))})
    return {
        "market": market, "ran": date.today().isoformat(), "stocks": len(data),
        "start": min(x["date"] for x in rows), "end": max(x["date"] for x in rows),
        "overall": summarize(rows),
        "by_category": {c: summarize([x for x in rows if x["cat"] == c]) for c in ("short_term", "long_term")},
        "by_year": {y: summarize([x for x in rows if x["date"].startswith(y)]) for y in sorted({x["date"][:4] for x in rows})},
    }


if __name__ == "__main__":
    existing = json.loads(OUT.read_text()) if OUT.exists() else {}
    for m in sys.argv[1:] or ["india"]:
        existing[m] = run(m)
        print(json.dumps(existing[m], indent=1))
    OUT.write_text(json.dumps(existing, indent=1))
