"""Scan a market and record new setups.

During the session it runs every few minutes. After the close it runs once more on finished
bars and the results wait for the next open, so there is always something to plan with.
"""

import logging
import threading
from datetime import UTC, datetime

from sqlalchemy import select

from backend import market_hours as mh
from backend import universe
from backend.db import Session, Signal, get_meta, set_meta, utcnow
from backend.engine import indicators, signals
from backend.providers import yahoo

log = logging.getLogger(__name__)
ENGINE = "v2"
_locks = {"india": threading.Lock(), "us": threading.Lock()}


def scanning(market: str) -> bool:
    return _locks[market].locked()


def expiry(market: str, setup_category: str, direction: str, pending: bool, now: datetime) -> datetime:
    """Naive UTC time after which the idea is dead whatever happened."""
    start = mh.local_date(market, now) if not pending else mh.next_open(market, now).astimezone(mh.TZ[market]).date()
    n = signals.CAUTION_SESSIONS if direction == "AVOID" else signals.RULES[setup_category][3]
    day = mh.sessions_after(market, start, n)
    bounds = mh.session_bounds(market, day)
    return (bounds[1] if bounds else now).replace(tzinfo=None)


def index_direction(market: str) -> bool | None:
    df = yahoo.candles(universe.BENCHMARK[market], "5d", "15m")
    x = indicators.compute(df)
    if not x or not x["ema_9"] or not x["ema_21"] or x["rsi"] is None:
        return None
    if x["ema_9"] > x["ema_21"] and x["rsi"] > 50:
        return True
    if x["ema_9"] < x["ema_21"] and x["rsi"] < 50:
        return False
    return None


def evaluate_stock(ticker: str, market: str, open_: bool, index_up: bool | None = None) -> list[signals.Setup]:
    found = []
    daily = yahoo.candles(ticker, "2y", "1d")
    if not daily.empty:
        s = signals.evaluate(ticker, daily, mh.session_fraction(market))
        if s:
            found.append(s)
    if open_ and not daily.empty:
        x = indicators.compute(daily)
        # Only stocks that move enough in a day to pay for a same-day trade.
        if x and x["atr"] and x["atr"] / x["price"] > 0.022:
            bars = yahoo.candles(ticker, "5d", "15m")
            s = signals.evaluate_intraday(ticker, bars, index_up) if not bars.empty else None
            if s:
                found.append(s)
    return found


def record(market: str, setups: list[signals.Setup], open_: bool, now: datetime | None = None) -> int:
    """Store new setups. One live idea per stock and horizon; an opposite one closes the old."""
    aware = now or datetime.now(UTC)
    stamp = aware.astimezone(UTC).replace(tzinfo=None)
    added = 0
    with Session() as db:
        live = list(db.scalars(select(Signal).where(Signal.market == market, Signal.engine == ENGINE, Signal.status == "active")))
        for s in setups:
            same = [x for x in live if x.ticker == s.ticker and (x.category == "intraday") == (s.category == "intraday")]
            if any(x.direction == s.direction for x in same):
                continue
            for old in same:
                _close_reversed(old, s.entry, stamp)
                live.remove(old)
            row = Signal(
                engine=ENGINE, market=market, ticker=s.ticker, name=universe.display_name(s.ticker),
                direction=s.direction, category=s.category, timeframe=s.timeframe,
                entry=s.entry, stop=s.stop, target=s.target,
                evidence_for=[vars(e) for e in s.evidence_for],
                evidence_against=[vars(e) for e in s.evidence_against],
                pending=not open_, created_at=stamp,
                expires_at=expiry(market, s.category, s.direction, not open_, aware), status="active",
            )
            db.add(row)
            live.append(row)
            added += 1
        db.commit()
    return added


def _close_reversed(old: Signal, price: float, at: datetime) -> None:
    if old.direction == "AVOID":
        old.status = "ended"
    elif old.pending and old.fill_price is None:
        old.status = "void"          # never filled, so it never risked anything
    else:
        entry = old.fill_price or old.entry
        s = 1 if old.direction == "BUY" else -1
        old.status, old.exit_price = "reversed", price
        old.r = round(s * (price - entry) / (s * (entry - old.stop)), 3)
    old.exit_at = at


def run(market: str) -> int | None:
    """Returns how many new setups were stored, or None if a scan was already running."""
    if not _locks[market].acquire(blocking=False):
        return None
    try:
        if market == "india":
            universe.refresh_nifty()
        open_ = mh.is_open(market)
        index_up = index_direction(market) if open_ else None
        setups, failed = [], 0
        for st in universe.stocks(market):
            try:
                setups += evaluate_stock(st.ticker, market, open_, index_up)
            except Exception:
                failed += 1
                log.exception("Scan failed for %s", st.ticker)
        added = record(market, setups, open_)
        set_meta(f"last_scan:{market}", utcnow().isoformat() + "Z")
        if not open_ and failed == 0:
            set_meta(f"eod:{market}", mh.last_closed_session(market).isoformat())
        log.info("Scan %s: %d setups, %d new, %d failed", market, len(setups), added, failed)
        return added
    finally:
        _locks[market].release()


def eod_due(market: str) -> bool:
    return not mh.is_open(market) and get_meta(f"eod:{market}") != mh.last_closed_session(market).isoformat()
