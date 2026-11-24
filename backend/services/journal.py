"""The owner's own trades: paper or real. Every trade is judged in R, like the engine's.

R is profit divided by what the trade risked (entry minus stop). A journal that only shows
rupees hides whether the *decisions* were any good; R shows it.
"""

from collections import defaultdict
from datetime import datetime, timedelta

import numpy as np
from sqlalchemy import select

from backend import universe
from backend.db import Position, Session, utcnow
from backend.engine.outcome import resolve
from backend.providers import yahoo

MISTAKES = ("moved stop", "no plan", "chased", "oversized", "exited early", "held too long", "revenge trade", "none")


def r_of(p: Position, price: float | None = None) -> float | None:
    px = p.exit_price if price is None else price
    if px is None or p.stop is None or p.entry <= p.stop:
        return None
    return round((px - p.entry) / (p.entry - p.stop), 3)


def view(p: Position, price: float | None = None) -> dict:
    live = p.exit_price if p.status == "closed" else price
    return {
        "id": p.id, "market": p.market, "ticker": p.ticker, "name": p.name, "paper": p.paper, "qty": p.qty, "entry": p.entry,
        "stop": p.stop, "target": p.target, "opened_at": p.opened_at, "setup": p.setup, "why": p.why, "status": p.status,
        "exit_price": p.exit_price, "closed_at": p.closed_at, "close_reason": p.close_reason, "lesson": p.lesson,
        "mistake": p.mistake, "price": live,
        "pnl": None if live is None else round((live - p.entry) * p.qty, 2),
        "pnl_pct": None if live is None else round((live / p.entry - 1) * 100, 2),
        "r": None if live is None else r_of(p, live),
        "risk": None if p.stop is None else round(max(p.entry - p.stop, 0) * p.qty, 2),
    }


def _stats(rows: list[Position]) -> dict:
    rs = [r for p in rows if (r := r_of(p)) is not None]
    wins, losses = [r for r in rs if r > 0], [r for r in rs if r <= 0]
    return {
        "n": len(rows), "with_r": len(rs),
        "win_rate": round(len(wins) / len(rs), 3) if rs else None,
        "avg_r": round(float(np.mean(rs)), 3) if rs else None,
        "total_r": round(float(np.sum(rs)), 2) if rs else None,
        "avg_win_r": round(float(np.mean(wins)), 3) if wins else None,
        "avg_loss_r": round(float(np.mean(losses)), 3) if losses else None,
    }


def portfolio(paper: bool | None = None) -> dict:
    with Session() as db:
        q = select(Position).order_by(Position.opened_at.desc())
        if paper is not None:
            q = q.where(Position.paper == paper)
        rows = list(db.scalars(q))
    open_, closed = [p for p in rows if p.status == "open"], [p for p in rows if p.status == "closed"]
    quotes = yahoo.quotes(sorted({p.ticker for p in open_})) if open_ else {}
    closed.sort(key=lambda p: p.closed_at or p.opened_at)
    curve, total = [], 0.0
    for p in closed:
        if (r := r_of(p)) is not None:
            total += r
            curve.append({"at": (p.closed_at or p.opened_at).date().isoformat(), "ticker": p.ticker, "r": r, "total": round(total, 2)})
    by_mistake, by_setup = defaultdict(list), defaultdict(list)
    for p in closed:
        by_mistake[p.mistake or "none"].append(p)
        by_setup[p.setup or "own idea"].append(p)
    views = [view(p, quotes.get(p.ticker, {}).get("price")) for p in open_]
    return {
        "open": views, "closed": [view(p) for p in reversed(closed)][:200],
        "open_risk": round(sum(v["risk"] or 0 for v in views), 2),
        "open_pnl": round(sum(v["pnl"] or 0 for v in views), 2),
        "stats": _stats(closed), "curve": curve,
        "by_mistake": {k: _stats(v) for k, v in sorted(by_mistake.items())},
        "by_setup": {k: _stats(v) for k, v in sorted(by_setup.items())},
    }


def open_position(data: dict) -> Position:
    market = universe.market_of(data["ticker"])
    p = Position(market=market, ticker=data["ticker"], name=universe.display_name(data["ticker"]), paper=data["paper"],
                 qty=data["qty"], entry=data["entry"], stop=data.get("stop"), target=data.get("target"),
                 why=data.get("why", ""), signal_id=data.get("signal_id"), setup=data.get("setup"), opened_at=utcnow())
    with Session() as db:
        db.add(p)
        db.commit()
    return p


def close_position(pid: int, price: float, reason: str, lesson: str = "", mistake: str | None = None,
                   at: datetime | None = None) -> Position | None:
    with Session() as db:
        p = db.get(Position, pid)
        if not p or p.status != "open":
            return None
        p.status, p.exit_price, p.close_reason, p.closed_at = "closed", price, reason, at or utcnow()
        if lesson:
            p.lesson = lesson
        if mistake:
            p.mistake = mistake
        db.commit()
        return p


def manage_paper() -> list[Position]:
    """Close paper trades the way the engine closes its own: walk the real price path, stop wins ties."""
    done = []
    with Session() as db:
        rows = list(db.scalars(select(Position).where(Position.status == "open", Position.paper.is_(True))))
    for p in rows:
        if p.stop is None or p.target is None:
            continue
        bars = yahoo.candles(p.ticker, "60d", "5m")
        if bars.empty:
            continue
        out = resolve(bars, "BUY", p.entry, p.stop, p.target, p.opened_at, utcnow() + timedelta(days=3650), False, utcnow())
        if out.status in ("stop", "target") and out.exit_price is not None:
            if c := close_position(p.id, out.exit_price, out.status, at=out.exit_at):
                done.append(c)
    return done
