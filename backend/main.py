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

from fastapi import Depends, FastAPI, HTTPException, Path, Query, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from sqlalchemy import select, text
from starlette.concurrency import run_in_threadpool

from backend import config, db, replay, universe
from backend import market_hours as mh
from backend import schemas as sc
from backend.db import Session, Signal, utcnow
from backend.engine import indicators, odds, signals
from backend.providers import yahoo
from backend.services import notes, scan, track

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
            scan.run(m)
    track.update_open()
    track.update_controls()
    return any_open


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
    tasks = [asyncio.create_task(_loop()), asyncio.create_task(_broadcast())] if config.BACKGROUND else []
    yield
    for t in tasks:
        t.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await t


app = FastAPI(title="StockSage API", version="2.0.0", lifespan=lifespan)
app.add_middleware(GZipMiddleware, minimum_size=1000)
app.add_middleware(CORSMiddleware, allow_origins=config.ALLOWED_ORIGINS, allow_methods=["GET", "POST"], allow_headers=["*"])


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
    }


@app.get("/search", response_model=list[sc.SearchItem])
def search_universe():
    return [sc.SearchItem(ticker=s.ticker, name=s.name, sector=s.sector, market=m)
            for m in ("india", "us") for s in universe.stocks(m)]


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


@app.post("/stock/{ticker}/note", response_model=sc.NoteOut, dependencies=[limit("note", 6, 300)])
def post_note(ticker: Ticker):
    stock = get_stock(ticker)
    sig = stock["signal"]
    facts = {
        "ticker": ticker, "name": stock["name"], "sector": stock["sector"],
        "market_open": mh.is_open(stock["market"]),
        "quote": {k: v for k, v in (stock["quote"] or {}).items() if k not in ("spark", "as_of")},
        "technicals": stock["technicals"], "bullish_evidence": stock["bullish"], "bearish_evidence": stock["bearish"],
        "fundamentals": {k: v for k, v in yahoo.fundamentals(ticker).items() if k != "summary"},
        "recent_headlines": [{"title": n["title"], "source": n["source"], "published": n["published"]}
                             for n in yahoo.stock_news(stock["name"], stock["market"])],
        "current_setup": {"direction": sig.direction, "entry": sig.entry, "stop": sig.stop, "target": sig.target} if sig else None,
    }
    try:
        return notes.build(ticker, facts)
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
