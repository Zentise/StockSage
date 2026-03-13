"""Stock data tools — Direct Yahoo Finance v8 API with rate limiting and caching.

Uses Yahoo Finance chart API directly (no yfinance library) for maximum
reliability. Supports US stocks, Indian stocks (.NS), indices (^NSEI, ^GSPC),
commodities (GC=F), and ETFs.
"""

import time
import logging
import threading
import urllib.parse
import pandas as pd
import requests
from requests.adapters import HTTPAdapter, Retry
from cachetools import TTLCache
from pathlib import Path
from dotenv import load_dotenv

logger = logging.getLogger(__name__)

# Load .env from project root
_env_path = Path(__file__).resolve().parent.parent.parent / ".env"
load_dotenv(dotenv_path=_env_path)

# ---------- Shared HTTP session ----------
_session = requests.Session()
_session.headers.update({
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
})
_adapter = HTTPAdapter(
    pool_connections=1,
    pool_maxsize=5,
    max_retries=Retry(total=2, backoff_factor=1, status_forcelist=[500, 502, 503]),
)
_session.mount("https://", _adapter)
_session.mount("http://", _adapter)

_CHART_URL = "https://query1.finance.yahoo.com/v8/finance/chart/{symbol}"

# ---------- Rate limiter ----------
_lock = threading.Lock()
_last_req = 0.0
_MIN_INTERVAL = 0.3  # 300ms between requests


def _throttle():
    global _last_req
    with _lock:
        now = time.monotonic()
        wait = _MIN_INTERVAL - (now - _last_req)
        if wait > 0:
            time.sleep(wait)
        _last_req = time.monotonic()


# ---------- Caches ----------
_hist_cache: TTLCache = TTLCache(maxsize=500, ttl=3600)   # 1 hour
_price_cache: TTLCache = TTLCache(maxsize=500, ttl=300)   # 5 minutes
_info_cache: TTLCache = TTLCache(maxsize=200, ttl=86400)  # 24 hours
_news_cache: TTLCache = TTLCache(maxsize=100, ttl=1800)   # 30 minutes


# ---------- Yahoo Finance chart API ----------

def _fetch_chart(ticker: str, range_: str = "3mo", interval: str = "1d") -> dict:
    """Fetch chart data from Yahoo Finance v8 API."""
    _throttle()
    symbol = urllib.parse.quote(ticker, safe="")
    url = _CHART_URL.format(symbol=symbol)
    try:
        resp = _session.get(url, params={"range": range_, "interval": interval}, timeout=15)
        if resp.status_code == 404:
            return {}
        resp.raise_for_status()
        data = resp.json()
        result = data.get("chart", {}).get("result")
        if not result:
            return {}
        return result[0]
    except Exception as e:
        logger.warning(f"Chart fetch failed for {ticker}: {e}")
        return {}


def _chart_to_df(chart: dict) -> pd.DataFrame:
    """Convert Yahoo chart response to OHLCV DataFrame."""
    timestamps = chart.get("timestamp", [])
    quotes = chart.get("indicators", {}).get("quote", [{}])[0]
    if not timestamps or not quotes:
        return pd.DataFrame()

    df = pd.DataFrame({
        "Open": quotes.get("open", []),
        "High": quotes.get("high", []),
        "Low": quotes.get("low", []),
        "Close": quotes.get("close", []),
        "Volume": quotes.get("volume", []),
    }, index=pd.to_datetime(timestamps, unit="s", utc=True))
    df.index = df.index.tz_convert(None)  # Remove timezone
    df.index.name = "Date"
    df.dropna(subset=["Close"], inplace=True)
    return df


# ---------- Public API ----------

def get_historical_data(ticker: str, period: str = "3mo", interval: str = "1d") -> pd.DataFrame:
    """Get historical OHLCV data for a single ticker."""
    key = f"hist_{ticker}_{period}_{interval}"
    if key in _hist_cache:
        return _hist_cache[key]

    chart = _fetch_chart(ticker, range_=period, interval=interval)
    df = _chart_to_df(chart)
    if not df.empty:
        _hist_cache[key] = df
    return df


def get_live_price(ticker: str) -> dict:
    """Get latest price and daily change for a ticker."""
    key = f"price_{ticker}"
    if key in _price_cache:
        return _price_cache[key]

    # Use chart meta for accurate live price
    chart = _fetch_chart(ticker, range_="5d", interval="1d")
    if not chart:
        return {"ticker": ticker, "price": 0, "change_pct": 0, "change_abs": 0, "prev_close": 0}

    meta = chart.get("meta", {})
    price = meta.get("regularMarketPrice", 0)
    prev = meta.get("chartPreviousClose", price)
    if not price:
        # Fallback to last close from data
        df = _chart_to_df(chart)
        if df.empty:
            return {"ticker": ticker, "price": 0, "change_pct": 0, "change_abs": 0, "prev_close": 0}
        price = float(df["Close"].iloc[-1])
        prev = float(df["Close"].iloc[-2]) if len(df) > 1 else price

    change = round(price - prev, 2)
    pct = round((change / prev) * 100, 2) if prev else 0.0

    result = {
        "ticker": ticker,
        "price": round(price, 2),
        "change_pct": pct,
        "change_abs": change,
        "prev_close": round(prev, 2),
    }
    _price_cache[key] = result
    return result


def get_bulk_prices(tickers: list[str]) -> list[dict]:
    """Get prices for multiple tickers (sequential with caching)."""
    return [get_live_price(t) for t in tickers]


def bulk_download(tickers: list[str], period: str = "3mo") -> dict[str, pd.DataFrame]:
    """Download historical data for many tickers.

    Each ticker requires a separate API call, but results are cached for 1 hour.
    """
    result: dict[str, pd.DataFrame] = {}

    for t in tickers:
        key = f"hist_{t}_{period}_1d"
        if key in _hist_cache:
            result[t] = _hist_cache[key]
        else:
            df = get_historical_data(t, period=period, interval="1d")
            if not df.empty and len(df) >= 20:
                result[t] = df

    return result


def get_stock_info(ticker: str) -> dict:
    """Get fundamental info from chart metadata and quoteSummary."""
    key = f"info_{ticker}"
    if key in _info_cache:
        return _info_cache[key]

    chart = _fetch_chart(ticker, range_="1y", interval="1d")
    if not chart:
        return {"ticker": ticker, "name": ticker}

    meta = chart.get("meta", {})
    df = _chart_to_df(chart)

    hi52 = float(df["High"].max()) if not df.empty else None
    lo52 = float(df["Low"].min()) if not df.empty else None
    avg_vol = int(df["Volume"].mean()) if not df.empty and "Volume" in df else None

    result = {
        "ticker": ticker,
        "name": meta.get("shortName", meta.get("longName", ticker)),
        "sector": "N/A",
        "industry": "N/A",
        "pe_ratio": None,
        "forward_pe": None,
        "eps": None,
        "market_cap": None,
        "52w_high": hi52,
        "52w_low": lo52,
        "avg_volume": avg_vol,
        "dividend_yield": None,
        "debt_to_equity": None,
        "revenue_growth": None,
        "profit_margin": None,
        "beta": None,
    }
    _info_cache[key] = result
    return result


def get_stock_news(ticker: str) -> list[dict]:
    """Get recent news for a stock (placeholder - news comes from NewsAPI)."""
    return []


def get_volume_data(ticker: str, days: int = 20, df: pd.DataFrame | None = None) -> dict:
    """Get volume analysis: current vs average."""
    if df is None:
        df = get_historical_data(ticker, period=f"{days + 5}d", interval="1d")
    if df.empty or len(df) < 5:
        return {"ticker": ticker, "current_volume": 0, "avg_volume": 0, "volume_ratio": 0}

    current_vol = float(df["Volume"].iloc[-1])
    avg_vol = float(df["Volume"].iloc[:-1].mean())
    ratio = round(current_vol / avg_vol, 2) if avg_vol > 0 else 0

    return {
        "ticker": ticker,
        "current_volume": int(current_vol),
        "avg_volume": int(avg_vol),
        "volume_ratio": ratio,
    }
