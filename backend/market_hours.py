"""Trading sessions from real exchange calendars (holidays, half days), not hand-kept lists.

BSE's calendar (XBOM) stands in for NSE: they share trading holidays, and it matched every
NSE session of 2026 when this was written. Calendars only know published years, so past
their last date we fall back to weekdays and report `calendar_ok = False`.
"""

from datetime import UTC, date, datetime, time, timedelta
from functools import lru_cache
from zoneinfo import ZoneInfo

import exchange_calendars as xc
import pandas as pd

from backend.config import EXTRA_HOLIDAYS

UTC = UTC
TZ = {"india": ZoneInfo("Asia/Kolkata"), "us": ZoneInfo("America/New_York")}
_CODE = {"india": "XBOM", "us": "XNYS"}
_HOURS = {"india": (time(9, 15), time(15, 30)), "us": (time(9, 30), time(16, 0))}


@lru_cache(maxsize=2)
def _calendar(market: str):
    return xc.get_calendar(_CODE[market], start="2023-01-02")


@lru_cache(maxsize=2)
def _extra(market: str) -> frozenset[date]:
    out = set()
    for item in EXTRA_HOLIDAYS[market].split(","):
        try:
            out.add(date.fromisoformat(item.strip()))
        except ValueError:
            continue
    return frozenset(out)


def covered(market: str, day: date) -> bool:
    return day <= _calendar(market).last_session.date()


def session_bounds(market: str, day: date) -> tuple[datetime, datetime] | None:
    """Open and close in UTC for that day, or None when the exchange is shut."""
    if day in _extra(market):
        return None
    if covered(market, day):
        cal = _calendar(market)
        ts = pd.Timestamp(day)
        if ts < cal.first_session or not cal.is_session(ts):
            return None
        return (
            cal.session_open(ts).to_pydatetime().astimezone(UTC),
            cal.session_close(ts).to_pydatetime().astimezone(UTC),
        )
    if day.weekday() >= 5:
        return None
    o, c = _HOURS[market]
    tz = TZ[market]
    return datetime.combine(day, o, tz).astimezone(UTC), datetime.combine(day, c, tz).astimezone(UTC)


def is_session(market: str, day: date) -> bool:
    return session_bounds(market, day) is not None


def local_date(market: str, now: datetime | None = None) -> date:
    return (now or datetime.now(UTC)).astimezone(TZ[market]).date()


def is_open(market: str, now: datetime | None = None) -> bool:
    now = now or datetime.now(UTC)
    b = session_bounds(market, local_date(market, now))
    return bool(b and b[0] <= now < b[1])


def last_session(market: str, now: datetime | None = None) -> date:
    """Most recent session that has at least opened."""
    now = now or datetime.now(UTC)
    d = local_date(market, now)
    for _ in range(15):
        b = session_bounds(market, d)
        if b and b[0] <= now:
            return d
        d -= timedelta(days=1)
    return d


def last_closed_session(market: str, now: datetime | None = None) -> date:
    now = now or datetime.now(UTC)
    d = local_date(market, now)
    for _ in range(15):
        b = session_bounds(market, d)
        if b and b[1] <= now:
            return d
        d -= timedelta(days=1)
    return d


def next_open(market: str, now: datetime | None = None) -> datetime:
    now = now or datetime.now(UTC)
    d = local_date(market, now)
    for _ in range(15):
        b = session_bounds(market, d)
        if b and b[0] > now:
            return b[0]
        d += timedelta(days=1)
    return now


def sessions_after(market: str, day: date, n: int) -> date:
    """The n-th session strictly after `day`."""
    d, left = day, n
    while left > 0:
        d += timedelta(days=1)
        if is_session(market, d):
            left -= 1
    return d


def session_fraction(market: str, now: datetime | None = None) -> float:
    """How much of today's session has elapsed (1.0 when closed)."""
    now = now or datetime.now(UTC)
    b = session_bounds(market, local_date(market, now))
    if not b or not b[0] <= now < b[1]:
        return 1.0
    return max(0.02, (now - b[0]) / (b[1] - b[0]))


def status(market: str, now: datetime | None = None) -> dict:
    now = now or datetime.now(UTC)
    today = local_date(market, now)
    b = session_bounds(market, today)
    open_ = bool(b and b[0] <= now < b[1])
    if open_:
        reason = "Open"
    elif today.weekday() >= 5:
        reason = "Weekend"
    elif not b:
        reason = "Exchange holiday"
    elif now < b[0]:
        reason = "Opens later today"
    else:
        reason = "Closed for the day"
    return {
        "market": market,
        "open": open_,
        "reason": reason,
        "session_date": last_session(market, now).isoformat(),
        "opens_at": next_open(market, now).isoformat(),
        "closes_at": b[1].isoformat() if open_ else None,
        "calendar_ok": covered(market, today + timedelta(days=14)),
    }
