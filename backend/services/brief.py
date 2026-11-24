"""The morning brief: what the owner needs before the open, built only from data we hold.

No AI here on purpose. It has to be right and has to arrive even when the free AI quota is gone.
"""

from datetime import datetime, time

from sqlalchemy import select

from backend import market_hours as mh
from backend import universe
from backend.db import Alert, Session, Signal, get_meta, set_meta, utcnow
from backend.providers import yahoo
from backend.services import journal, notify, setups, track

SEND_AT = {"india": time(8, 45), "us": time(8, 30)}   # local, before the open


def build(market: str) -> dict:
    members = universe.stocks(market)
    idx = universe.INDICES[market]
    q = yahoo.quotes(list(idx) + [s.ticker for s in members])
    stocks = [(s, q[s.ticker]) for s in members if s.ticker in q]
    movers = sorted(stocks, key=lambda t: t[1]["change_pct"])
    row = lambda t: {"ticker": t[0].ticker, "name": t[0].name, "price": t[1]["price"], "change_pct": t[1]["change_pct"]}  # noqa: E731
    with Session() as db:
        active = list(db.scalars(select(Signal).where(
            Signal.market == market, Signal.engine == "v2", Signal.status == "active", Signal.direction == "BUY",
            Signal.expires_at > utcnow()).order_by(Signal.created_at.desc())))
        alerts = list(db.scalars(select(Alert).where(Alert.market == market, Alert.active.is_(True))))
    port = journal.portfolio()
    rec = track.record(market, "v2")["overall"]
    st = mh.status(market)
    return {
        "market": market, "date": mh.local_date(market).isoformat(), "status": st["reason"], "opens_at": st["opens_at"],
        "indices": [{"ticker": t, "name": n, "price": q[t]["price"], "change_pct": q[t]["change_pct"]} for t, n in idx.items() if t in q],
        "advancing": sum(x[1]["change_pct"] > 0 for x in stocks), "declining": sum(x[1]["change_pct"] < 0 for x in stocks),
        "gainers": [row(t) for t in reversed(movers[-3:])], "losers": [row(t) for t in movers[:3]],
        "setups": [{"ticker": s.ticker, "name": s.name, "setup": s.setup, "entry": s.entry, "stop": s.stop, "target": s.target,
                    "validated": setups.is_validated(market, s.setup), "pending": s.pending} for s in active][:12],
        "positions": [{k: p[k] for k in ("ticker", "name", "qty", "entry", "stop", "target", "price", "pnl", "r", "paper")} for p in port["open"]],
        "alerts": [{"ticker": a.ticker, "kind": a.kind, "level": a.level} for a in alerts],
        "record": {"n": rec["n"], "paired_n": rec["paired_n"], "edge_r": rec["edge_r"], "edge_low": rec["edge_low"], "edge_high": rec["edge_high"]},
        "headlines": yahoo.market_news(market)[:5],
    }


def text(b: dict) -> str:
    cur = "₹" if b["market"] == "india" else "$"
    out = [f"StockSage morning brief, {b['date']} ({b['status']})", ""]
    out += [f"{i['name']}: {i['price']:,.0f} ({i['change_pct']:+.2f}%)" for i in b["indices"][:3]]
    out += [f"Breadth: {b['advancing']} up, {b['declining']} down", ""]
    if b["setups"]:
        out.append("Setups waiting:")
        for s in b["setups"][:6]:
            tag = "validated" if s["validated"] else "unproven"
            out.append(f"- {s['name']} [{s['setup']}, {tag}] entry {cur}{s['entry']:,.2f}, stop {cur}{s['stop']:,.2f}, target {cur}{s['target']:,.2f}")
    else:
        out.append("No new setups.")
    if b["positions"]:
        out += ["", "Your open trades:"]
        out += [f"- {p['name']}: {cur}{p['pnl']:+,.0f}" + (f" ({p['r']:+.2f}R)" if p["r"] is not None else "") for p in b["positions"] if p["pnl"] is not None]
    r = b["record"]
    out += ["", "Reminder: " + (f"over {r['paired_n']} finished setups the engine is {r['edge_r']:+.2f}R against random stocks "
                               f"(range {r['edge_low']:+.2f} to {r['edge_high']:+.2f}). Not advice." if r["edge_low"] is not None
                               else "the engine's record is still too short to judge. Not advice.")]
    return "\n".join(out)


def due(market: str, now: datetime | None = None) -> bool:
    """Once per trading day, from the send time until the bell."""
    aware = (now or datetime.now(mh.UTC)).astimezone(mh.TZ[market])
    day = aware.date()
    return (mh.is_session(market, day) and aware.time() >= SEND_AT[market] and not mh.is_open(market, now)
            and (mh.session_bounds(market, day) or (aware, aware))[0] > aware and get_meta(f"brief:{market}") != day.isoformat())


def send_if_due(market: str) -> bool:
    if not notify.configured() or not due(market):
        return False
    ok = notify.send(text(build(market)))
    if ok:
        set_meta(f"brief:{market}", mh.local_date(market).isoformat())
    return ok
