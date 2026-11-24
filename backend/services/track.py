"""Follow every published idea to its end and keep score, next to a fair control."""

import json
import logging
import threading
from collections import defaultdict
from datetime import UTC, datetime, timedelta
from pathlib import Path

import numpy as np
import pandas as pd
from sqlalchemy import func, select
from ta.volatility import AverageTrueRange

from backend import market_hours as mh
from backend import universe
from backend.config import ROOT
from backend.db import Session, Signal, get_meta, set_meta, utcnow
from backend.engine import strategies
from backend.engine.outcome import resolve
from backend.engine.signals import RULES, levels
from backend.providers import yahoo
from backend.services import setups as setup_info

log = logging.getLogger(__name__)
BACKUP = ROOT / "backups" / "live-signals_2026-08-03_to_2026-11-23.json"
DONE = ("target", "stop", "expired", "reversed")
_lock = threading.Lock()


def _bars(ticker: str, category: str) -> pd.DataFrame:
    return yahoo.candles(ticker, "60d", "5m") if category == "intraday" else yahoo.candles(ticker, "6mo", "1h")


def update_open() -> int:
    """Resolve every active signal against the price path. Returns how many closed."""
    if not _lock.acquire(blocking=False):
        return 0
    closed = 0
    try:
        with Session() as db:
            rows = list(db.scalars(select(Signal).where(Signal.status == "active")))
            for s in rows:
                now = utcnow()
                if s.direction == "AVOID":
                    if now >= s.expires_at:
                        s.status, s.exit_at = "ended", s.expires_at
                        closed += 1
                    continue
                bars = _bars(s.ticker, s.category)
                if bars.empty:
                    continue
                out = resolve(bars, s.direction, s.entry, s.stop, s.target, s.created_at, s.expires_at, s.pending, now)
                s.checked_at = now
                s.best_r, s.worst_r = out.best_r, out.worst_r
                if not s.pending or out.entry != s.entry or out.status in ("target", "stop", "expired"):
                    s.fill_price = out.entry
                if out.status != "active":
                    s.status, s.exit_price, s.exit_at, s.r = out.status, out.exit_price, out.exit_at, out.r
                    closed += 1
            db.commit()
        return closed
    finally:
        _lock.release()


def update_controls(limit: int = 400) -> int:
    """For each finished BUY, what did the rest of the market do from the same moment?"""
    with Session() as db:
        rows = list(db.scalars(
            select(Signal).where(Signal.status.in_(("target", "stop", "expired")), Signal.direction == "BUY",
                                 Signal.category != "intraday", Signal.control_r.is_(None)).limit(limit)))
        if not rows:
            return 0
        done = 0
        for s in rows:
            rs = []
            for st in universe.stocks(s.market):
                if st.ticker == s.ticker:
                    continue
                r = _control_r(st.ticker, s)
                if r is not None:
                    rs.append(r)
            if len(rs) >= 10:
                s.control_r = round(float(np.mean(rs)), 3)
                done += 1
                if done % 20 == 0:
                    db.commit()       # slow the first time; keep what is done if we are stopped
        db.commit()
        return done


def _control_r(ticker: str, s: Signal) -> float | None:
    hourly = yahoo.candles(ticker, "6mo", "1h")
    daily = yahoo.candles(ticker, "2y", "1d")
    if hourly.empty or len(daily) < 60:
        return None
    before = hourly[hourly.index <= s.created_at]
    past = daily[daily.index < pd.Timestamp(s.created_at).normalize()]
    if before.empty or len(past) < 40:
        return None
    price = float(before["Close"].iloc[-1])
    atr = float(AverageTrueRange(past["High"], past["Low"], past["Close"], 14).average_true_range().iloc[-1])
    stop, target = levels(price, atr, s.category, True)
    if s.engine == "v1":
        # Same rule the v1 signal used, so the comparison is like for like.
        m = {"short_term": (1.0, 0.04), "long_term": (1.5, 0.08)}[s.category]
        risk = min(atr * m[0], price * m[1])
        stop, target = price - risk, price + 2 * risk
    out = resolve(hourly, "BUY", price, stop, target, s.created_at, s.expires_at, s.pending, utcnow())
    return out.r if out.status in ("target", "stop", "expired") else None


def import_v1(path: Path = BACKUP) -> int:
    """Load the signals v1 published live. Runs once per database."""
    if get_meta("v1_imported") or not path.exists():
        return 0
    data = json.loads(path.read_text(encoding="utf-8"))
    rows = []
    for day in data["days"]:
        market = day["market"]
        for x in day["signals"]:
            local = datetime.fromisoformat(x["recommended_at"]).replace(tzinfo=mh.TZ[market])
            created = local.astimezone(UTC).replace(tzinfo=None)
            avoid = x["signal"] == "AVOID"
            n = 5 if avoid else RULES[x["category"]][3]
            bounds = mh.session_bounds(market, mh.sessions_after(market, local.date(), n))
            rows.append(Signal(
                engine="v1", market=market, ticker=x["ticker"], name=x["name"], direction=x["signal"],
                category=x["category"], timeframe="", entry=x["entry"],
                stop=None if avoid else x["sl"], target=None if avoid else x["target"],
                evidence_for=[], evidence_against=[], pending=False, created_at=created,
                expires_at=(bounds[1].replace(tzinfo=None) if bounds else created + timedelta(days=1)),
                status="active", fill_price=x["entry"],
            ))
    with Session() as db:
        db.add_all(rows)
        db.commit()
    set_meta("v1_imported", str(len(rows)))
    return len(rows)


def _dedupe(rows: list[Signal]) -> list[Signal]:
    """v1 re-published the same idea daily; count it once while the first is still running."""
    busy: dict[tuple, datetime] = {}
    out = []
    for s in sorted(rows, key=lambda x: x.created_at):
        k = (s.ticker, s.direction, s.category)
        if busy.get(k, datetime.min) >= s.created_at:
            continue
        out.append(s)
        busy[k] = s.exit_at or datetime.max
    return out


def _ci(values: list[float], weeks: list[str], seed: int = 3) -> tuple[float, float] | None:
    """95% range by resampling whole weeks: trades in one week share the same market."""
    groups = defaultdict(list)
    for v, w in zip(values, weeks):
        groups[w].append(v)
    if len(groups) < 4:
        return None
    g = [np.array(x) for x in groups.values()]
    rng = np.random.default_rng(seed)
    means = [np.concatenate([g[i] for i in rng.integers(0, len(g), len(g))]).mean() for _ in range(1500)]
    return round(float(np.percentile(means, 2.5)), 3), round(float(np.percentile(means, 97.5)), 3)


def _bucket(rows: list[Signal]) -> dict:
    n = len(rows)
    paired = [s for s in rows if s.control_r is not None and s.r is not None]
    week = [s.created_at.strftime("%G-%V") for s in paired]
    edge = [s.r - s.control_r for s in paired]
    ci = _ci(edge, week) if paired else None
    return {
        "n": n,
        "target": sum(s.status == "target" for s in rows),
        "stop": sum(s.status == "stop" for s in rows),
        "other": sum(s.status in ("expired", "reversed") for s in rows),
        "avg_r": round(float(np.mean([s.r for s in rows])), 3) if n else None,
        "paired_n": len(paired),
        "paired_r": round(float(np.mean([s.r for s in paired])), 3) if paired else None,
        "control_r": round(float(np.mean([s.control_r for s in paired])), 3) if paired else None,
        "edge_r": round(float(np.mean(edge)), 3) if paired else None,
        "edge_low": ci[0] if ci else None,
        "edge_high": ci[1] if ci else None,
    }


def record(market: str, engine: str) -> dict:
    with Session() as db:
        raw = list(db.scalars(select(Signal).where(
            Signal.market == market, Signal.engine == engine, Signal.direction != "AVOID",
            Signal.status.in_(DONE + ("active",)))))
        voids = db.scalar(select(func.count()).select_from(Signal).where(
            Signal.market == market, Signal.engine == engine, Signal.status == "void")) or 0
    rows = _dedupe(raw)

    def finished(items: list[Signal]) -> list[Signal]:
        return sorted((s for s in items if s.status in DONE and s.r is not None), key=lambda s: s.exit_at or s.created_at)

    closed = finished(rows)
    # Only trades that have a control: two lines over different trades would not be comparable.
    curve, total, ctrl = [], 0.0, 0.0
    for s in (x for x in closed if x.control_r is not None):
        total += s.r
        ctrl += s.control_r
        curve.append({"at": (s.exit_at or s.created_at).date().isoformat(), "ticker": s.ticker, "r": s.r,
                      "total": round(total, 2), "control": round(ctrl, 2)})
    by_setup = {}
    for key in sorted({s.setup for s in raw}):
        mine = [s for s in raw if s.setup == key]
        info = setup_info.summary(market, key)
        by_setup[key] = {
            "label": strategies.LABELS.get(key, key), "active": sum(s.status == "active" for s in _dedupe(mine)),
            "validated": setup_info.is_validated(market, key), "replay": info, "live": _bucket(finished(_dedupe(mine))),
        }
    return {
        "market": market, "engine": engine,
        "since": min((s.created_at for s in rows), default=None),
        "active": sum(s.status == "active" for s in rows), "void": voids,
        "overall": _bucket(closed),
        "by_category": {c: _bucket([s for s in closed if s.category == c]) for c in RULES if any(s.category == c for s in closed)},
        "by_setup": by_setup,
        "curve": curve,
        "trades": list(reversed(closed))[:200],
    }
