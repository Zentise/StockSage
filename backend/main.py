"""StockSage — FastAPI backend with SSE and REST endpoints."""

import os
import sys
import json
import asyncio
import logging
import threading
from datetime import datetime
from contextlib import asynccontextmanager
from pathlib import Path
from zoneinfo import ZoneInfo

# Ensure project root is on sys.path so "backend.xxx" imports resolve
# regardless of which directory uvicorn is launched from.
_project_root = str(Path(__file__).resolve().parent.parent)
if _project_root not in sys.path:
    sys.path.insert(0, _project_root)

from dotenv import load_dotenv

# Load .env from project root
env_path = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(dotenv_path=env_path)

from fastapi import FastAPI, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from sse_starlette.sse import EventSourceResponse

from backend.crew import run_full_scan, run_crew_analysis, build_signal_from_data
from backend.tools.yfinance_tools import get_bulk_prices, get_live_price, get_historical_data, get_stock_info
from backend.tools.indicator_tools import compute_indicators
from backend.tools.sentiment_tools import get_market_news
from backend.data.nse_stocks import ALL_NSE, INDICES as NSE_INDICES, TICKER_NAME_MAP as NSE_NAMES
from backend.data.nyse_stocks import ALL_US, INDICES as US_INDICES, TICKER_NAME_MAP as US_NAMES, COMMODITY_NAME_MAP, COMMODITIES
from backend.market_hours import is_market_open, is_indian_trading_holiday, is_us_trading_holiday

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("stocksage")

# In-memory cache for scan results
_scan_cache: dict[str, list[dict]] = {"india": [], "us": []}
_last_scan_time: dict[str, str] = {"india": "", "us": ""}
_scan_in_progress: dict[str, bool] = {"india": False, "us": False}
_periodic_scan_task: asyncio.Task | None = None

# Daily accuracy tracking: { "india": { "2026-04-02": [ {ticker, signal, entry, target, sl, ...} ] } }
_daily_signals: dict[str, dict[str, list[dict]]] = {"india": {}, "us": {}}


def _market_timezone(market: str) -> ZoneInfo:
    return ZoneInfo("Asia/Kolkata") if market == "india" else ZoneInfo("America/New_York")


def _filter_non_tradable_categories(signals: list[dict], market: str) -> list[dict]:
    # Never show intraday ideas when the market is closed (weekends/holidays/off-hours).
    if is_market_open(market):
        return signals
    return [s for s in signals if s.get("category") != "intraday"]


def _run_scan_for_market(market: str) -> list[dict]:
    _scan_in_progress[market] = True
    try:
        signals = run_full_scan(market)
        filtered_signals = _filter_non_tradable_categories(signals, market)
        # Merge with previous recommendations: new signals override old ones by ticker
        existing = {s.get("ticker"): s for s in _scan_cache.get(market, [])}
        for sig in filtered_signals:
            existing[sig.get("ticker")] = sig
        merged = list(existing.values())
        # Sort: BUY first, then SELL, then AVOID, then by confidence desc
        signal_priority = {"BUY": 0, "SELL": 1, "AVOID": 2}
        merged.sort(key=lambda s: (signal_priority.get(s.get("signal"), 3), -s.get("confidence", 0)))
        _scan_cache[market] = merged
        _last_scan_time[market] = datetime.now(_market_timezone(market)).strftime("%Y-%m-%d %H:%M:%S")
        # Snapshot signals for daily accuracy tracking
        today = datetime.now(_market_timezone(market)).strftime("%Y-%m-%d")
        if today not in _daily_signals[market]:
            _daily_signals[market][today] = {}
        # Store unique by ticker (first recommendation of the day wins)
        for sig in filtered_signals:
            t = sig.get("ticker")
            if t and t not in _daily_signals[market][today]:
                _daily_signals[market][today][t] = {
                    "ticker": t,
                    "name": sig.get("name", t),
                    "signal": sig.get("signal"),
                    "entry": sig.get("entry", 0),
                    "target": sig.get("target", 0),
                    "sl": sig.get("sl", 0),
                    "category": sig.get("category", ""),
                    "confidence": sig.get("confidence", 0),
                    "recommended_at": _last_scan_time[market],
                }
        return merged
    finally:
        _scan_in_progress[market] = False


def _startup_scan():
    """Background scan on startup to pre-populate data."""
    for m in ("india", "us"):
        try:
            # Skip scan entirely when market is closed
            is_holiday = is_indian_trading_holiday() if m == "india" else is_us_trading_holiday()
            is_weekend = datetime.now(_market_timezone(m)).weekday() >= 5
            market_open = is_market_open(m)
            if is_holiday or is_weekend or not market_open:
                reason = "weekend" if is_weekend else ("holiday" if is_holiday else "market closed")
                logger.info(f"Startup scan [{m}] skipped — {reason}")
                continue

            logger.info(f"Startup scan [{m}] starting...")
            signals = _run_scan_for_market(m)
            if signals:
                logger.info(f"Startup scan [{m}]: {len(signals)} signals")
            else:
                logger.info(f"Startup scan [{m}]: no signals found")
        except Exception as e:
            logger.error(f"Startup scan [{m}] failed: {e}")


async def _periodic_scan_loop():
    interval_seconds = int(os.getenv("STOCKSAGE_SCAN_INTERVAL_SECONDS", "300"))
    # Longer sleep when both markets are closed (nights/weekends/holidays) to
    # avoid hammering yfinance for data that won't have changed.
    off_hours_interval = int(os.getenv("STOCKSAGE_OFF_HOURS_INTERVAL_SECONDS", "1800"))
    await asyncio.sleep(15)  # let startup settle first
    while True:
        any_market_open = False
        for market in ("india", "us"):
            if _scan_in_progress.get(market):
                continue
            # Skip scans entirely when market is closed
            is_holiday = is_indian_trading_holiday() if market == "india" else is_us_trading_holiday()
            is_weekend = datetime.now(_market_timezone(market)).weekday() >= 5
            market_currently_open = is_market_open(market)
            if is_holiday or is_weekend or not market_currently_open:
                reason = "weekend" if is_weekend else ("holiday" if is_holiday else "market closed")
                logger.debug(f"Periodic scan [{market}] skipped — {reason}")
                continue
            # Scan if market is open or cache is empty (first run / stale).
            if market_currently_open or not _scan_cache.get(market):
                any_market_open = any_market_open or market_currently_open
                try:
                    logger.info(f"Periodic scan [{market}] starting...")
                    loop = asyncio.get_running_loop()
                    await loop.run_in_executor(None, _run_scan_for_market, market)
                    logger.info(f"Periodic scan [{market}] complete")
                except Exception as e:
                    logger.error(f"Periodic scan [{market}] failed: {e}")
            else:
                logger.debug(f"Periodic scan [{market}] skipped — market closed, cache populated")

        sleep_for = interval_seconds if any_market_open else off_hours_interval
        await asyncio.sleep(sleep_for)


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _periodic_scan_task
    logger.info("StockSage starting up...")
    threading.Thread(target=_startup_scan, daemon=True).start()
    _periodic_scan_task = asyncio.create_task(_periodic_scan_loop())
    yield
    if _periodic_scan_task:
        _periodic_scan_task.cancel()
        try:
            await _periodic_scan_task
        except asyncio.CancelledError:
            pass
    logger.info("StockSage shut down.")


app = FastAPI(title="StockSage API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- WebSocket: Live price streaming ---

# Tickers to stream per market (indices + a few top movers)
_WS_TICKERS = {
    "india": list(NSE_INDICES.values()) + ["RELIANCE.NS", "TCS.NS", "HDFCBANK.NS", "INFY.NS", "ICICIBANK.NS"],
    "us": list(US_INDICES.values()) + ["AAPL", "MSFT", "NVDA", "AMZN", "GOOGL"],
}
_WS_NAMES = {
    **{v: k for k, v in NSE_INDICES.items()},
    **{v: k for k, v in US_INDICES.items()},
    **NSE_NAMES,
    **US_NAMES,
}


@app.websocket("/ws/prices")
async def ws_prices(websocket: WebSocket):
    await websocket.accept()
    loop = asyncio.get_running_loop()
    try:
        while True:
            # Check if client sent a market preference
            market = "india"
            try:
                msg = await asyncio.wait_for(websocket.receive_text(), timeout=0.1)
                if msg in ("india", "us"):
                    market = msg
            except (asyncio.TimeoutError, WebSocketDisconnect):
                pass

            tickers = _WS_TICKERS.get(market, _WS_TICKERS["india"])
            prices = await loop.run_in_executor(None, get_bulk_prices, tickers)

            payload = []
            for p in prices:
                t = p.get("ticker", "")
                payload.append({
                    "ticker": t,
                    "name": _WS_NAMES.get(t, t),
                    "price": p.get("price", 0),
                    "change_pct": p.get("change_pct", 0),
                })

            await websocket.send_json({"prices": payload})
            await asyncio.sleep(10)  # push every 10 seconds
    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.debug(f"WebSocket closed: {e}")


# --- REST Endpoints ---

@app.api_route("/health", methods=["GET", "HEAD"])
async def health():
    return {"status": "ok", "service": "StockSage"}


@app.get("/suggestions")
async def get_suggestions(market: str = Query("india", regex="^(india|us)$"), category: str = Query("all")):
    """Return cached stock suggestions. Use /scan to refresh."""
    market_is_open = is_market_open(market)
    is_holiday = is_indian_trading_holiday() if market == "india" else is_us_trading_holiday()
    is_weekend = datetime.now(_market_timezone(market)).weekday() >= 5
    market_closed = is_holiday or is_weekend or not market_is_open

    # Never show recommendations when market is closed (holidays / weekends)
    if market_closed:
        reason = "Weekend" if is_weekend else ("Holiday" if is_holiday else "Market Closed")
        return {
            "market": market,
            "market_open": False,
            "is_holiday": is_holiday,
            "is_weekend": is_weekend,
            "closed_reason": reason,
            "last_scan": _last_scan_time.get(market, ""),
            "scanning": False,
            "category": category,
            "suggestions": [],
        }

    suggestions = _filter_non_tradable_categories(_scan_cache.get(market, []), market)

    if category != "all":
        suggestions = [s for s in suggestions if s.get("category") == category]

    return {
        "market": market,
        "market_open": market_is_open,
        "is_holiday": is_holiday,
        "is_weekend": False,
        "closed_reason": None,
        "last_scan": _last_scan_time.get(market, ""),
        "scanning": _scan_in_progress.get(market, False),
        "category": category,
        "suggestions": suggestions,
    }


@app.get("/analyze/{ticker}")
async def analyze_stock(ticker: str, market: str = Query("india", regex="^(india|us)$")):
    """Full analysis for a single stock."""
    loop = asyncio.get_event_loop()

    # Get signal data
    signal = await loop.run_in_executor(None, build_signal_from_data, ticker, market)
    if not signal:
        return {"error": "Could not analyze stock", "ticker": ticker}

    # Get stock info
    stock_info = await loop.run_in_executor(None, get_stock_info, ticker)

    # Get historical data for chart
    df = await loop.run_in_executor(None, get_historical_data, ticker, "3mo", "1d")
    chart_data = []
    if not df.empty:
        for idx, row in df.iterrows():
            chart_data.append({
                "time": idx.strftime("%Y-%m-%d"),
                "open": round(float(row["Open"]), 2),
                "high": round(float(row["High"]), 2),
                "low": round(float(row["Low"]), 2),
                "close": round(float(row["Close"]), 2),
                "volume": int(row["Volume"]),
            })

    indicators = signal.pop("indicators", {})
    signal.pop("sentiment_score", None)

    return {
        "signal": signal,
        "info": stock_info,
        "indicators": indicators,
        "chart_data": chart_data,
    }


@app.get("/news")
async def get_news(market: str = Query("india", regex="^(india|us)$")):
    """Get latest market news."""
    news = await get_market_news(market)
    return {"market": market, "news": news}


@app.get("/indices")
async def get_indices(market: str = Query("india", regex="^(india|us)$")):
    """Get market index prices."""
    indices = NSE_INDICES if market == "india" else US_INDICES
    loop = asyncio.get_event_loop()
    tickers = list(indices.values())
    names = list(indices.keys())
    prices = await loop.run_in_executor(None, get_bulk_prices, tickers)
    results = []
    for name, price_data in zip(names, prices):
        price_data["name"] = name
        results.append(price_data)
    return {"market": market, "indices": results}


@app.get("/chart/{ticker}")
async def get_chart_data(ticker: str, period: str = "3mo", interval: str = "1d", market: str = "india"):
    """Get OHLCV chart data."""
    import re
    import calendar
    loop = asyncio.get_event_loop()
    df = await loop.run_in_executor(None, get_historical_data, ticker, period, interval)
    if df.empty:
        return {"ticker": ticker, "data": []}

    # Detect intraday intervals (e.g. 1m, 5m, 15m, 1h)
    is_intraday = bool(re.match(r'^\d+[mh]$', interval))

    # For intraday, convert timestamps to market-local time then treat as UTC
    # so lightweight-charts displays the correct local market time
    if is_intraday:
        tz = ZoneInfo("Asia/Kolkata") if (market == "india" or ticker.endswith(".NS") or ticker.endswith(".BO")) else ZoneInfo("America/New_York")

    data = []
    for idx, row in df.iterrows():
        if is_intraday:
            # idx is timezone-naive (stripped by _chart_to_df) but represents UTC
            # Convert back to UTC, then to local market time, then extract as unix
            utc_dt = idx.replace(tzinfo=ZoneInfo("UTC"))
            local_dt = utc_dt.astimezone(tz)
            # Treat local time components as-if UTC for lightweight-charts display
            fake_utc = local_dt.replace(tzinfo=ZoneInfo("UTC"))
            time_val = int(calendar.timegm(fake_utc.timetuple()))
        else:
            time_val = idx.strftime("%Y-%m-%d")
        data.append({
            "time": time_val,
            "open": round(float(row["Open"]), 2),
            "high": round(float(row["High"]), 2),
            "low": round(float(row["Low"]), 2),
            "close": round(float(row["Close"]), 2),
            "volume": int(row["Volume"]),
        })

    return {"ticker": ticker, "data": data}


@app.get("/scan")
async def trigger_scan(market: str = Query("india", regex="^(india|us)$")):
    """Manually trigger a market scan."""
    is_holiday = is_indian_trading_holiday() if market == "india" else is_us_trading_holiday()
    is_weekend = datetime.now(_market_timezone(market)).weekday() >= 5
    market_open = is_market_open(market)
    market_closed = is_holiday or is_weekend or not market_open

    if market_closed:
        reason = "Weekend" if is_weekend else ("Holiday" if is_holiday else "Market Closed")
        return {"market": market, "count": 0, "scanning": False,
                "closed_reason": reason, "suggestions": []}

    if _scan_in_progress.get(market):
        return {"market": market, "count": len(_scan_cache.get(market, [])),
                "scanning": True, "suggestions": _scan_cache.get(market, [])}

    loop = asyncio.get_event_loop()
    try:
        signals = await loop.run_in_executor(None, _run_scan_for_market, market)
        return {"market": market, "count": len(signals), "suggestions": signals}
    finally:
        _scan_in_progress[market] = False


@app.get("/accuracy")
async def get_accuracy(market: str = Query("india", regex="^(india|us)$"), date: str = Query(None)):
    """Get daily recommendation accuracy by comparing entry prices to current prices."""
    if date is None:
        date = datetime.now(_market_timezone(market)).strftime("%Y-%m-%d")

    day_signals = _daily_signals.get(market, {}).get(date, {})
    if not day_signals:
        return {"market": market, "date": date, "signals": [], "summary": {"total": 0, "accurate": 0, "accuracy_pct": 0}}

    loop = asyncio.get_event_loop()
    results = []
    accurate = 0

    for ticker, rec in day_signals.items():
        try:
            live = await loop.run_in_executor(None, get_live_price, ticker)
            current_price = live.get("price", 0)
            entry = rec.get("entry", 0)
            target = rec.get("target", 0)
            sl = rec.get("sl", 0)
            signal = rec.get("signal", "")

            if not current_price or not entry:
                status = "unknown"
            elif signal == "BUY":
                if current_price >= target:
                    status = "target_hit"
                    accurate += 1
                elif current_price <= sl:
                    status = "sl_hit"
                else:
                    # Moving towards target?
                    status = "on_track" if current_price >= entry else "against"
                    if status == "on_track":
                        accurate += 1
            elif signal == "SELL":
                if current_price <= target:
                    status = "target_hit"
                    accurate += 1
                elif current_price >= sl:
                    status = "sl_hit"
                else:
                    status = "on_track" if current_price <= entry else "against"
                    if status == "on_track":
                        accurate += 1
            else:
                status = "neutral"

            change_from_entry = round(((current_price - entry) / entry) * 100, 2) if entry else 0

            results.append({
                **rec,
                "current_price": current_price,
                "change_from_entry": change_from_entry,
                "status": status,
            })
        except Exception:
            results.append({**rec, "current_price": 0, "change_from_entry": 0, "status": "error"})

    total = len(results)
    accuracy_pct = round((accurate / total) * 100, 1) if total > 0 else 0

    return {
        "market": market,
        "date": date,
        "signals": results,
        "summary": {
            "total": total,
            "accurate": accurate,
            "accuracy_pct": accuracy_pct,
        },
    }


# --- SSE: Stream analysis ---

@app.get("/stream/analyze/{ticker}")
async def stream_analysis(ticker: str, market: str = Query("india")):
    """SSE endpoint that streams agent analysis steps."""
    async def event_generator():
        yield {"event": "status", "data": json.dumps({"step": "Starting analysis", "ticker": ticker})}
        await asyncio.sleep(0.5)

        yield {"event": "status", "data": json.dumps({"step": "Fetching historical data..."})}
        loop = asyncio.get_event_loop()
        df = await loop.run_in_executor(None, get_historical_data, ticker, "3mo", "1d")
        await asyncio.sleep(0.3)

        yield {"event": "status", "data": json.dumps({"step": "Computing technical indicators..."})}

        if df.empty:
            yield {"event": "error", "data": json.dumps({"error": "No data available"})}
            return

        indicators = await loop.run_in_executor(None, compute_indicators, df)
        yield {"event": "indicators", "data": json.dumps(indicators)}
        await asyncio.sleep(0.3)

        yield {"event": "status", "data": json.dumps({"step": "Running sentiment analysis..."})}
        await asyncio.sleep(0.3)

        yield {"event": "status", "data": json.dumps({"step": "Generating signal..."})}
        signal = await loop.run_in_executor(None, build_signal_from_data, ticker, market)
        await asyncio.sleep(0.3)

        if signal:
            signal["reasoning"] = f"{signal['signal']} signal based on {signal['strategy']}."
            signal.pop("indicators", None)
            signal.pop("sentiment_score", None)
            yield {"event": "signal", "data": json.dumps(signal)}

        # Try LLM reasoning
        yield {"event": "status", "data": json.dumps({"step": "Getting AI reasoning..."})}
        try:
            full_signal = await loop.run_in_executor(None, run_crew_analysis, ticker, market)
            if full_signal:
                yield {"event": "signal", "data": json.dumps(full_signal)}
        except Exception as e:
            yield {"event": "status", "data": json.dumps({"step": f"AI reasoning skipped: {e}"})}

        yield {"event": "complete", "data": json.dumps({"status": "done"})}

    return EventSourceResponse(event_generator())


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.main:app", host="0.0.0.0", port=8000, reload=True)
