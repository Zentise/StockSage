"""StockSage API."""

import asyncio
import contextlib
import json
import logging
import time
from collections import defaultdict, deque
from contextlib import asynccontextmanager
from datetime import timedelta
from typing import Annotated

from fastapi import Depends, FastAPI, Header, HTTPException, Path, Query, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from sqlalchemy import select, text
from starlette.concurrency import run_in_threadpool

from backend import auth, config, db, replay, universe
from backend import market_hours as mh
from backend import schemas as sc
from backend.db import Session, Signal, utcnow
from backend.engine import indicators, odds, signals
from backend.providers import yahoo
from backend.services import ai, alerts, brief, journal, notes, notify, scan, setups, track

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logging.getLogger("httpx").setLevel(logging.WARNING)  # httpx logs full URLs at INFO, secrets included
log = logging.getLogger("stocksage")

MarketQ = Annotated[sc.Market, Query()]
Ticker = Annotated[str, Path(pattern=r"^[A-Z0-9^&.=\-]{1,20}$")]


# ------------------------------------------------------------ background work

def _tick() -> bool:
    """One round of work. Returns True while any market is open."""
    any_open = False
    for m in ("india", "us"):
        open_ = mh.is_open(m)
        any_open |= open_
        if open_ or scan.eod_due(m):
            began = utcnow()
            if scan.run(m):
                try:
                    alerts.announce(m, began)
                except Exception:
                    log.exception("Setup announcement failed")
    track.update_open()
    track.update_controls()
    return any_open


async def _alert_loop():
    """Every minute: price alerts, paper trades, and the morning brief when it is time."""
    while True:
        try:
            if any(mh.is_open(m) for m in ("india", "us")):
                await run_in_threadpool(alerts.check)
            for m in ("india", "us"):
                await run_in_threadpool(brief.send_if_due, m)
        except Exception:
            log.exception("Alert round failed")
        await asyncio.sleep(60)


async def _loop():
    if n := await run_in_threadpool(track.import_v1):
        log.info("Imported %d v1 signals", n)
    while True:
        any_open = False
        try:
            any_open = await run_in_threadpool(_tick)
        except Exception:
            log.exception("Background tick failed")
        await asyncio.sleep(config.SCAN_INTERVAL if any_open else config.OFF_HOURS_INTERVAL)


@asynccontextmanager
async def lifespan(_: FastAPI):
    db.init()
    tasks = [asyncio.create_task(f()) for f in (_loop, _broadcast, _alert_loop)] if config.BACKGROUND else []
    yield
    for t in tasks:
        t.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await t


app = FastAPI(title="StockSage API", version="2.0.0", lifespan=lifespan)
app.add_middleware(GZipMiddleware, minimum_size=1000)
app.add_middleware(CORSMiddleware, allow_origins=config.ALLOWED_ORIGINS, allow_methods=["GET", "POST", "DELETE"], allow_headers=["*"])


# ------------------------------------------------------------ rate limiting

_hits: dict[tuple[str, str], deque] = defaultdict(deque)


def limit(name: str, count: int, seconds: int):
    def check(request: Request):
        fwd = request.headers.get("x-forwarded-for", "").split(",")[0].strip()
        ip = fwd or (request.client.host if request.client else "?")
        if len(_hits) > 5000:
            _hits.clear()
        q, now = _hits[(name, ip)], time.monotonic()
        while q and now - q[0] > seconds:
            q.popleft()
        if len(q) >= count:
            raise HTTPException(429, f"Too many requests. Try again in {int(seconds - (now - q[0])) + 1}s.")
        q.append(now)
    return Depends(check)


# ------------------------------------------------------------ system

@app.api_route("/health", methods=["GET", "HEAD"], include_in_schema=False)
def health():
    return {"status": "ok", "version": app.version}


@app.get("/ready", include_in_schema=False)
def ready():
    with Session() as s:
        s.execute(text("select 1"))
    return {"status": "ready"}


@app.get("/status", response_model=sc.Status)
def get_status(market: MarketQ = "india"):
    return mh.status(market) | {
        "last_scan": db.get_meta(f"last_scan:{market}"),
        "scanning": scan.scanning(market),
        "ai_enabled": bool(config.GROQ_API_KEY),
        "owner_required": auth.required(),
    }


@app.get("/auth", response_model=sc.AuthOut)
def get_auth(x_owner_token: Annotated[str | None, Header()] = None):
    """Does this browser hold the owner's key? Used to show or hide the private pages."""
    return {"required": auth.required(), "ok": auth.check(x_owner_token)}


@app.get("/settings", response_model=sc.SettingsOut, dependencies=[auth.Owner])
def get_settings():
    return {"owner_required": auth.required(), "telegram": notify.configured(), "ai_enabled": bool(config.GROQ_API_KEY),
            "india_universe": config.INDIA_UNIVERSE, "alert_unproven": config.ALERT_UNPROVEN}


@app.get("/setups", response_model=list[sc.SetupInfo])
def get_setups(market: MarketQ = "india"):
    return setups.catalog(market)


@app.get("/search", response_model=list[sc.SearchItem])
def search_universe():
    return [sc.SearchItem(ticker=s.ticker, name=s.name, sector=s.sector, market=m)
            for m in ("india", "us") for s in universe.scan_stocks(m)]


# ------------------------------------------------------------ market

def _quote(q: dict | None) -> sc.Quote | None:
    return sc.Quote(**_named(q)) if q else None


def _named(q: dict | None) -> dict | None:
    return q | {"name": universe.display_name(q["ticker"])} if q else None


@app.get("/market", response_model=sc.MarketOut)
def get_market(market: MarketQ = "india"):
    members = universe.stocks(market)
    idx = universe.INDICES[market]
    q = yahoo.quotes(list(idx) + [s.ticker for s in members])
    stocks, sectors = [], defaultdict(list)
    for s in members:
        x = q.get(s.ticker)
        if not x:
            continue
        stocks.append(sc.Constituent(ticker=s.ticker, name=s.name, sector=s.sector, price=x["price"],
                                     change_pct=x["change_pct"], spark=x["spark"], turnover=x["price"] * x["volume"]))
        sectors[s.sector].append(x["change_pct"])
    if not stocks:
        raise HTTPException(503, "Market data is unavailable right now.")
    return sc.MarketOut(
        market=market, as_of=max(x["as_of"] for x in q.values()),
        indices=[sc.Quote(**_named(q[t])) for t in idx if t in q], stocks=stocks,
        sectors=sorted((sc.Sector(name=k, change_pct=round(sum(v) / len(v), 2), advancing=sum(c > 0 for c in v), total=len(v))
                        for k, v in sectors.items()), key=lambda s: -s.change_pct),
        advancing=sum(s.change_pct > 0 for s in stocks), declining=sum(s.change_pct < 0 for s in stocks),
        missing=[s.ticker for s in members if s.ticker not in q],
    )


@app.get("/news", response_model=sc.NewsOut)
def get_news(market: MarketQ = "india"):
    return {"items": yahoo.market_news(market)}


# ------------------------------------------------------------ signals

@app.get("/signals", response_model=sc.SignalsOut)
def get_signals(market: MarketQ = "india"):
    with Session() as s:
        active = list(s.scalars(select(Signal).where(
            Signal.market == market, Signal.engine == scan.ENGINE, Signal.status == "active",
            Signal.expires_at > utcnow()).order_by(Signal.created_at.desc())))
        recent = list(s.scalars(select(Signal).where(
            Signal.market == market, Signal.engine == scan.ENGINE, Signal.direction != "AVOID",
            Signal.status.in_(track.DONE), Signal.exit_at > utcnow() - timedelta(days=7)
        ).order_by(Signal.exit_at.desc()).limit(20)))
    q = yahoo.quotes([x.ticker for x in active])
    order = {"BUY": 0, "SELL": 1, "AVOID": 2}

    def net(x):
        return sum(e["weight"] for e in x.evidence_for) - sum(e["weight"] for e in x.evidence_against)

    active.sort(key=lambda x: (order[x.direction], -net(x)))
    return {
        "market": market,
        "active": [sc.LiveSignal.model_validate(x).model_copy(update={"quote": _quote(q.get(x.ticker))}) for x in active],
        "recent": recent,
    }


@app.post("/scan", response_model=sc.ScanOut, dependencies=[limit("scan", 2, 300)])
async def post_scan(market: MarketQ = "india"):
    if scan.scanning(market):
        return {"started": False, "message": "A scan is already running."}
    asyncio.get_running_loop().run_in_executor(None, scan.run, market)
    return {"started": True, "message": "Scan started."}


@app.get("/record", response_model=sc.RecordOut)
def get_record(market: MarketQ = "india", engine: Annotated[str, Query(pattern="^v[12]$")] = "v2"):
    return track.record(market, engine)


@app.get("/replay", response_model=sc.ReplayOut)
def get_replay(market: MarketQ = "india"):
    data = json.loads(replay.OUT.read_text()) if replay.OUT.exists() else {}
    if market not in data:
        raise HTTPException(404, "No replay has been run for this market.")
    return data[market]


# ------------------------------------------------------------ single stock

_TF = {"1D": ("1d", "5m"), "1W": ("5d", "15m"), "1M": ("1mo", "1h"), "6M": ("6mo", "1d"), "2Y": ("2y", "1d")}


@app.get("/stock/{ticker}", response_model=sc.StockOut, dependencies=[limit("stock", 60, 60)])
def get_stock(ticker: Ticker):
    market = universe.market_of(ticker)
    daily = yahoo.candles(ticker, "2y", "1d")
    quote = yahoo.quote(ticker)
    if daily.empty and not quote:
        raise HTTPException(404, f"No data for {ticker}.")
    x = indicators.compute(daily, mh.session_fraction(market))
    bull, bear, stop, target = [], [], None, None
    if x:
        x["bar_up"] = bool(daily["Close"].iloc[-1] >= daily["Open"].iloc[-1])
        bull, bear = signals.collect(x)
        if x["atr"]:
            stop, target = signals.levels(x["price"], x["atr"], "short_term", True)
    with Session() as s:
        rows = list(s.scalars(select(Signal).where(Signal.ticker == ticker).order_by(Signal.created_at.desc()).limit(30)))
    info = universe.lookup(ticker)
    return {
        "ticker": ticker, "name": universe.display_name(ticker), "market": market,
        "sector": info.sector if info else None, "quote": _named(quote), "technicals": x or {},
        "bullish": [vars(e) for e in bull], "bearish": [vars(e) for e in bear],
        "suggested_stop": stop, "suggested_target": target,
        "signal": next((r for r in rows if r.engine == scan.ENGINE and r.status == "active" and r.expires_at > utcnow()), None),
        "history": [r for r in rows if r.status in track.DONE][:15],
    }


@app.get("/stock/{ticker}/candles", response_model=sc.CandlesOut, dependencies=[limit("candles", 90, 60)])
def get_candles(ticker: Ticker, tf: Annotated[str, Query(pattern="^(1D|1W|1M|6M|2Y)$")] = "6M"):
    period, interval = _TF[tf]
    df = yahoo.candles(ticker, period, interval)
    if df.empty:
        raise HTTPException(404, f"No chart data for {ticker}.")
    return {
        "ticker": ticker, "timeframe": tf, "intraday": interval != "1d",
        "candles": [sc.Candle(time=int(ts.timestamp()), open=o, high=h, low=lo, close=c, volume=v)
                    for ts, o, h, lo, c, v in zip(df.index, df["Open"], df["High"], df["Low"], df["Close"], df["Volume"])],
    }


@app.get("/stock/{ticker}/fundamentals", response_model=sc.Fundamentals, dependencies=[limit("fund", 30, 60)])
def get_fundamentals(ticker: Ticker):
    return yahoo.fundamentals(ticker)


@app.get("/stock/{ticker}/news", response_model=sc.NewsOut, dependencies=[limit("news", 60, 60)])
def get_stock_news(ticker: Ticker):
    return {"items": yahoo.stock_news(universe.display_name(ticker), universe.market_of(ticker))}


def _facts(ticker: str) -> dict:
    """Everything an AI may know about a stock. If it is not in here, it may not be said."""
    stock = get_stock(ticker)
    sig = stock["signal"]
    return {
        "ticker": ticker, "name": stock["name"], "sector": stock["sector"],
        "market_open": mh.is_open(stock["market"]),
        "quote": {k: v for k, v in (stock["quote"] or {}).items() if k not in ("spark", "as_of")},
        "technicals": stock["technicals"], "bullish_evidence": stock["bullish"], "bearish_evidence": stock["bearish"],
        "fundamentals": {k: v for k, v in yahoo.fundamentals(ticker).items() if k != "summary"},
        "recent_headlines": [{"title": n["title"], "source": n["source"], "published": n["published"]}
                             for n in yahoo.stock_news(stock["name"], stock["market"])],
        "current_setup": {"direction": sig.direction, "setup": sig.setup, "entry": sig.entry, "stop": sig.stop, "target": sig.target} if sig else None,
        "engine_track_record": _track_record(stock["market"]),
    }


def _track_record(market: str) -> list[dict]:
    """What each kind of setup has earned in the replay, without the year-by-year detail."""
    return [{"setup": c["label"], "beat_random_beyond_luck": c["validated"],
             "replay": {k: v for k, v in (c["replay"] or {}).items() if k not in ("by_year", "label")} or None} for c in setups.catalog(market)]


@app.post("/stock/{ticker}/note", response_model=sc.NoteOut, dependencies=[limit("note", 6, 300)])
def post_note(ticker: Ticker):
    facts = _facts(ticker)
    try:
        return notes.build(ticker, facts)
    except notes.NoteError as e:
        raise HTTPException(503, str(e)) from e


@app.post("/stock/{ticker}/debate", response_model=sc.DebateOut, dependencies=[auth.Owner, limit("debate", 4, 300)])
def post_debate(ticker: Ticker):
    try:
        return ai.debate(ticker, _facts(ticker))
    except notes.NoteError as e:
        raise HTTPException(503, str(e)) from e


@app.post("/chat", response_model=sc.ChatOut, dependencies=[auth.Owner, limit("chat", 20, 300)])
def post_chat(body: sc.ChatIn):
    facts = _facts(body.ticker) if body.ticker else {"market_today": brief.build(body.market), "engine_track_record": _track_record(body.market)}
    try:
        return ai.chat(facts, [m.model_dump() for m in body.messages])
    except notes.NoteError as e:
        raise HTTPException(503, str(e)) from e


@app.get("/stock/{ticker}/odds", response_model=sc.OddsOut, dependencies=[limit("odds", 60, 60)])
def get_odds(ticker: Ticker,
             entry: Annotated[float, Query(gt=0)], stop: Annotated[float, Query(gt=0)], target: Annotated[float, Query(gt=0)],
             days: Annotated[int, Query(ge=2, le=60)] = 10):
    if not (stop < entry < target or target < entry < stop):
        raise HTTPException(422, "Entry must sit between stop and target.")
    daily = yahoo.candles(ticker, "2y", "1d")
    if len(daily) < 120:
        raise HTTPException(404, "Not enough price history to simulate.")
    return odds.simulate(daily, entry, stop, target, days)


# ------------------------------------------------------------ owner: journal, alerts, brief

@app.get("/portfolio", response_model=sc.PortfolioOut, dependencies=[auth.Owner])
def get_portfolio(paper: bool | None = None):
    return journal.portfolio(paper) | {"mistakes": list(journal.MISTAKES)}


@app.post("/positions", response_model=sc.PositionOut, dependencies=[auth.Owner, limit("positions", 60, 60)])
def post_position(body: sc.PositionIn):
    return journal.view(journal.open_position(body.model_dump()))


@app.post("/positions/{pid}/close", response_model=sc.PositionOut, dependencies=[auth.Owner])
def post_close(pid: int, body: sc.CloseIn):
    if body.mistake and body.mistake not in journal.MISTAKES:
        raise HTTPException(422, "Unknown mistake tag.")
    p = journal.close_position(pid, body.price, body.reason, body.lesson, body.mistake)
    if not p:
        raise HTTPException(404, "No open trade with that id.")
    return journal.view(p)


@app.post("/positions/{pid}", response_model=sc.PositionOut, dependencies=[auth.Owner])
def post_position_patch(pid: int, body: sc.PositionPatch):
    if body.mistake and body.mistake not in journal.MISTAKES:
        raise HTTPException(422, "Unknown mistake tag.")
    with Session() as s:
        p = s.get(db.Position, pid)
        if not p:
            raise HTTPException(404, "No trade with that id.")
        for k, v in body.model_dump(exclude_unset=True).items():
            if v is not None:
                setattr(p, k, v)
        if p.stop is not None and p.stop >= p.entry:
            raise HTTPException(422, "The stop must be below the entry.")
        s.commit()
        return journal.view(p)


@app.delete("/positions/{pid}", dependencies=[auth.Owner])
def delete_position(pid: int):
    with Session() as s:
        p = s.get(db.Position, pid)
        if not p:
            raise HTTPException(404, "No trade with that id.")
        s.delete(p)
        s.commit()
    return {"deleted": pid}


@app.get("/alerts", response_model=list[sc.AlertOut], dependencies=[auth.Owner])
def get_alerts():
    with Session() as s:
        return list(s.scalars(select(db.Alert).order_by(db.Alert.active.desc(), db.Alert.created_at.desc()).limit(100)))


@app.post("/alerts", response_model=sc.AlertOut, dependencies=[auth.Owner, limit("alerts", 30, 60)])
def post_alert(body: sc.AlertIn):
    return alerts.create(body.ticker, body.kind, body.level, body.note)


@app.delete("/alerts/{aid}", dependencies=[auth.Owner])
def delete_alert(aid: int):
    with Session() as s:
        a = s.get(db.Alert, aid)
        if not a:
            raise HTTPException(404, "No alert with that id.")
        s.delete(a)
        s.commit()
    return {"deleted": aid}


@app.get("/brief", response_model=sc.BriefOut, dependencies=[auth.Owner, limit("brief", 20, 60)])
def get_brief(market: MarketQ = "india"):
    return brief.build(market) | {"telegram": notify.configured()}


@app.post("/brief/send", dependencies=[auth.Owner, limit("send", 3, 300)])
def post_brief_send(market: MarketQ = "india"):
    if not notify.configured():
        raise HTTPException(503, "Telegram is not set up. Add TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID.")
    if not notify.send(brief.text(brief.build(market))):
        raise HTTPException(502, "Telegram did not accept the message. Check the bot token and chat id.")
    return {"sent": True}


# ------------------------------------------------------------ live prices

_clients: dict[WebSocket, str] = {}


def _price_tickers(market: str) -> list[str]:
    return list(universe.INDICES[market]) + [s.ticker for s in universe.stocks(market)]


def _payload(market: str) -> dict:
    q = yahoo.quotes(_price_tickers(market))
    return {"market": market, "prices": {t: {"price": x["price"], "change_pct": x["change_pct"]} for t, x in q.items()}}


async def _broadcast():
    """One price fetch per market, shared by every connected client."""
    while True:
        for m in set(_clients.values()):
            try:
                data = await run_in_threadpool(_payload, m)
            except Exception:
                log.exception("Price update failed")
                continue
            for ws, want in list(_clients.items()):
                if want != m:
                    continue
                try:
                    await ws.send_json(data)
                except Exception:
                    _clients.pop(ws, None)
        await asyncio.sleep(15 if any(mh.is_open(m) for m in ("india", "us")) else 120)


@app.websocket("/ws/prices")
async def ws_prices(ws: WebSocket, market: sc.Market = "india"):
    await ws.accept()
    try:
        await ws.send_json(await run_in_threadpool(_payload, market))
        _clients[ws] = market
        while True:
            await ws.receive_text()     # nothing is expected; this returns when the client leaves
    except WebSocketDisconnect:
        pass
    finally:
        _clients.pop(ws, None)
