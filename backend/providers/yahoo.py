"""Yahoo Finance market data: quotes, candles, fundamentals, news.

Unofficial and delayed: fine for personal research, not licensed for redistribution.
Everything the app knows about prices goes through this module, so swapping in a broker
feed later means reimplementing these functions and nothing else.
"""

import logging
import math
import threading
import time
import urllib.parse
from datetime import UTC, datetime

import feedparser
import pandas as pd
import requests
from cachetools import TTLCache
from requests.adapters import HTTPAdapter, Retry

log = logging.getLogger(__name__)

_session = requests.Session()
_session.headers["User-Agent"] = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
_session.mount("https://", HTTPAdapter(pool_maxsize=8, max_retries=Retry(
    total=2, backoff_factor=0.8, status_forcelist=[500, 502, 503])))

_BASE = "https://query1.finance.yahoo.com"
_MIN_INTERVAL = 0.2
_throttle_lock = threading.Lock()
_last_request = 0.0


def _get(path: str, params: dict, timeout: int = 15) -> dict | None:
    global _last_request
    with _throttle_lock:
        wait = _MIN_INTERVAL - (time.monotonic() - _last_request)
        if wait > 0:
            time.sleep(wait)
        _last_request = time.monotonic()
    try:
        r = _session.get(_BASE + path, params=params, timeout=timeout)
        if r.status_code == 404:
            return None
        r.raise_for_status()
        return r.json()
    except Exception as e:
        log.warning("Yahoo request failed %s: %s", path, e)
        return None


class _Cache:
    """TTLCache is not thread-safe, and check-then-read can race with expiry."""

    def __init__(self, maxsize: int, ttl: float):
        self._c, self._lock = TTLCache(maxsize, ttl), threading.Lock()

    def get(self, key):
        with self._lock:
            return self._c.get(key)

    def put(self, key, value):
        with self._lock:
            self._c[key] = value


_quotes = _Cache(400, 20)
_fast = _Cache(400, 60)       # intraday candles
_slow = _Cache(500, 900)      # daily and hourly candles
_info = _Cache(300, 12 * 3600)
_news = _Cache(200, 600)


def _num(v) -> float | None:
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return f if math.isfinite(f) else None


# ---------------------------------------------------------------- quotes

def parse_spark(item: dict) -> dict | None:
    try:
        resp = item["response"][0]
        meta = resp["meta"]
    except (KeyError, IndexError, TypeError):
        return None
    price = _num(meta.get("regularMarketPrice"))
    # Requested with range=1d, so this is yesterday's close. With a longer range the same
    # field means "close before the window", which is how v1 got every daily change wrong.
    prev = _num(meta.get("previousClose")) or _num(meta.get("chartPreviousClose"))
    if not price or not prev:
        return None
    closes = [c for c in (resp.get("indicators", {}).get("quote") or [{}])[0].get("close") or [] if _num(c) is not None]
    return {
        "ticker": meta.get("symbol"),
        "price": round(price, 2),
        "prev_close": round(prev, 2),
        "change_abs": round(price - prev, 2),
        "change_pct": round((price / prev - 1) * 100, 2),
        "day_high": _num(meta.get("regularMarketDayHigh")),
        "day_low": _num(meta.get("regularMarketDayLow")),
        "high_52w": _num(meta.get("fiftyTwoWeekHigh")),
        "low_52w": _num(meta.get("fiftyTwoWeekLow")),
        "volume": _num(meta.get("regularMarketVolume")) or 0,
        "as_of": int(meta.get("regularMarketTime") or 0),
        "spark": [round(c, 2) for c in closes],
    }


def quotes(tickers: list[str]) -> dict[str, dict]:
    out: dict[str, dict] = {}
    missing = []
    for t in dict.fromkeys(tickers):
        hit = _quotes.get(t)
        if hit:
            out[t] = hit
        else:
            missing.append(t)
    for i in range(0, len(missing), 20):
        chunk = missing[i:i + 20]
        data = _get("/v7/finance/spark", {"symbols": ",".join(chunk), "range": "1d", "interval": "15m"})
        for item in ((data or {}).get("spark") or {}).get("result") or []:
            q = parse_spark(item)
            if q:
                _quotes.put(q["ticker"], q)
                out[q["ticker"]] = q
    return out


def quote(ticker: str) -> dict | None:
    return quotes([ticker]).get(ticker)


# ---------------------------------------------------------------- candles

def parse_chart(result: dict, interval: str) -> pd.DataFrame:
    ts = result.get("timestamp") or []
    q = (result.get("indicators", {}).get("quote") or [{}])[0]
    if not ts or not q:
        return pd.DataFrame()
    df = pd.DataFrame(
        {k.capitalize(): q.get(k, []) for k in ("open", "high", "low", "close", "volume")},
        index=pd.to_datetime(ts, unit="s", utc=True).tz_localize(None),
    )
    df = df.dropna(subset=["Open", "High", "Low", "Close"])
    df["Volume"] = df["Volume"].fillna(0)
    if interval == "1d" and not str(result.get("meta", {}).get("instrumentType", "")).startswith("INDEX"):
        # Yahoo emits flat zero-volume rows for exchange holidays; they are not sessions.
        df = df[~((df["Volume"] == 0) & (df["High"] == df["Low"]))]
    return df[~df.index.duplicated(keep="last")]


def candles(ticker: str, period: str = "6mo", interval: str = "1d") -> pd.DataFrame:
    """OHLCV indexed by UTC bar start (timezone-naive). Empty frame when unavailable."""
    cache = _fast if interval.endswith("m") else _slow
    key = (ticker, period, interval)
    hit = cache.get(key)
    if hit is not None:
        return hit
    data = _get(f"/v8/finance/chart/{urllib.parse.quote(ticker, safe='')}", {"range": period, "interval": interval})
    result = ((data or {}).get("chart") or {}).get("result")
    df = parse_chart(result[0], interval) if result else pd.DataFrame()
    if not df.empty:
        cache.put(key, df)
    return df


# ---------------------------------------------------------------- fundamentals

_FIELDS = {
    "market_cap": "marketCap", "pe": "trailingPE", "forward_pe": "forwardPE", "pb": "priceToBook",
    "eps": "trailingEps", "roe": "returnOnEquity", "profit_margin": "profitMargins",
    "debt_to_equity": "debtToEquity", "revenue_growth": "revenueGrowth",
    "earnings_growth": "earningsGrowth", "dividend_yield": "dividendYield", "beta": "beta",
    "insider_holding": "heldPercentInsiders",
}


def fundamentals(ticker: str) -> dict:
    """Missing values stay None: the UI says so, and the AI note is told so."""
    hit = _info.get(ticker)
    if hit is not None:
        return hit
    out = {k: None for k in _FIELDS} | {"sector": None, "industry": None, "summary": None, "earnings_date": None}
    try:
        import yfinance as yf  # heavy import, only needed here

        t = yf.Ticker(ticker)
        info = t.info or {}
        for k, src in _FIELDS.items():
            out[k] = _num(info.get(src))
        out["sector"], out["industry"] = info.get("sector"), info.get("industry")
        out["summary"] = (info.get("longBusinessSummary") or "")[:600] or None
        try:
            dates = (t.calendar or {}).get("Earnings Date") or []
            if dates:
                out["earnings_date"] = str(dates[0])
        except Exception as e:
            log.info("No earnings date for %s: %s", ticker, e)
        if info:
            _info.put(ticker, out)
    except Exception as e:
        log.warning("Fundamentals unavailable for %s: %s", ticker, e)
    return out


# ---------------------------------------------------------------- news

def _google_news(query: str, region: str, limit: int) -> list[dict]:
    loc = {"india": ("en-IN", "IN", "IN:en"), "us": ("en-US", "US", "US:en")}[region]
    try:
        r = _session.get("https://news.google.com/rss/search", timeout=12,
                         params={"q": query, "hl": loc[0], "gl": loc[1], "ceid": loc[2]})
        r.raise_for_status()
        feed = feedparser.parse(r.content)
    except Exception as e:
        log.warning("News failed for %r: %s", query, e)
        return []
    out = []
    for e in feed.entries[: limit * 2]:
        source = (e.get("source") or {}).get("title", "")
        title = e.get("title", "")
        if source and title.endswith(f" - {source}"):
            title = title[: -len(source) - 3]
        pub = e.get("published_parsed")
        out.append({
            "title": title.strip(), "source": source, "url": e.get("link", ""),
            "published": datetime(*pub[:6], tzinfo=UTC).isoformat() if pub else None,
        })
    out.sort(key=lambda n: n["published"] or "", reverse=True)
    seen, unique = set(), []
    for n in out:
        k = n["title"].lower()[:60]
        if k not in seen:
            seen.add(k)
            unique.append(n)
    return unique[:limit]


def stock_news(name: str, market: str, limit: int = 8) -> list[dict]:
    key = ("stock", name, market)
    hit = _news.get(key)
    if hit is None:
        hit = _google_news(f'"{name}" (stock OR shares) when:7d', market, limit)
        if hit:
            _news.put(key, hit)
    return hit


def market_news(market: str, limit: int = 12) -> list[dict]:
    key = ("market", market)
    hit = _news.get(key)
    if hit is None:
        q = "(Nifty OR Sensex) stock market when:1d" if market == "india" else '(S&P 500 OR Nasdaq) stock market when:1d'
        hit = _google_news(q, market, limit)
        if hit:
            _news.put(key, hit)
    return hit
