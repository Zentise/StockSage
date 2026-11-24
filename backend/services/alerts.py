"""Price alerts and journal watching. Runs every minute while a market is open."""

import logging
from datetime import datetime

from sqlalchemy import select

from backend import config, universe
from backend import market_hours as mh
from backend.db import Alert, Position, Session, Signal, utcnow
from backend.providers import yahoo
from backend.services import journal, notify, setups
from backend.universe import market_of

log = logging.getLogger(__name__)


def create(ticker: str, kind: str, level: float, note: str = "") -> Alert:
    a = Alert(market=market_of(ticker), ticker=ticker, kind=kind, level=level, note=note[:200])
    with Session() as db:
        db.add(a)
        db.commit()
    return a


def _fmt(ticker: str, v: float) -> str:
    return f"{'₹' if market_of(ticker) == 'india' else '$'}{v:,.2f}"


def announce(market: str, since: datetime) -> int:
    """Message about setups that appeared in the last scan. Only ones that have beaten random,
    unless the owner opted in to everything: an unproven idea should not buzz a phone."""
    with Session() as db:
        rows = list(db.scalars(select(Signal).where(
            Signal.market == market, Signal.engine == "v2", Signal.direction == "BUY", Signal.status == "active",
            Signal.created_at >= since)))
    rows = [s for s in rows if config.ALERT_UNPROVEN or setups.is_validated(market, s.setup)]
    for s in rows[:6]:
        tag = "validated" if setups.is_validated(market, s.setup) else "unproven"
        notify.send(f"New setup [{s.setup}, {tag}]: {s.name}. Entry {_fmt(s.ticker, s.entry)}, stop {_fmt(s.ticker, s.stop)}, "
                    f"target {_fmt(s.ticker, s.target)}{' (fills at the open)' if s.pending else ''}.")
    return len(rows)


def check() -> int:
    """Fire what has been crossed. Returns how many messages were produced."""
    with Session() as db:
        alerts = list(db.scalars(select(Alert).where(Alert.active.is_(True))))
        positions = list(db.scalars(select(Position).where(Position.status == "open")))
    live = {m for m in ("india", "us") if mh.is_open(m)}
    alerts = [a for a in alerts if a.market in live]
    positions = [p for p in positions if p.market in live]
    if not alerts and not positions:
        return 0
    quotes = yahoo.quotes(sorted({a.ticker for a in alerts} | {p.ticker for p in positions}))
    sent = 0
    for a in alerts:
        px = (quotes.get(a.ticker) or {}).get("price")
        if px is None or not (px >= a.level if a.kind == "above" else px <= a.level):
            continue
        with Session() as db:
            row = db.get(Alert, a.id)
            if not row or not row.active:
                continue
            row.active, row.fired_at, row.fired_price = False, utcnow(), px
            db.commit()
        name = universe.display_name(a.ticker)
        notify.send(f"{name} is {a.kind} {_fmt(a.ticker, a.level)}: now {_fmt(a.ticker, px)}.{(' ' + a.note) if a.note else ''}")
        sent += 1
    # Paper trades close themselves; real ones only get a message, because the owner closes those.
    for p in journal.manage_paper():
        r = journal.r_of(p)
        notify.send(f"Paper trade closed: {p.name} hit its {p.close_reason} at {_fmt(p.ticker, p.exit_price)}"
                    + (f" ({r:+.2f}R)." if r is not None else "."))
        sent += 1
    for p in (x for x in positions if not x.paper and x.alerted is None):
        px = (quotes.get(p.ticker) or {}).get("price")
        hit = "stop" if px is not None and p.stop is not None and px <= p.stop else \
              "target" if px is not None and p.target is not None and px >= p.target else None
        if hit:
            with Session() as db:
                row = db.get(Position, p.id)
                row.alerted = hit
                db.commit()
            level = p.stop if hit == "stop" else p.target
            notify.send(f"{p.name}: price {_fmt(p.ticker, px)} has reached your {hit} {_fmt(p.ticker, level)}. Your trade, your call.")
            sent += 1
    return sent
