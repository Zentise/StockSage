"""Which symbols we follow. Nifty 50 comes from NSE's own file so it cannot go stale."""

import csv
import io
import logging
import threading
import time
from dataclasses import dataclass
from pathlib import Path

import requests

from backend import config

log = logging.getLogger(__name__)
_DATA = Path(__file__).parent / "data"
_NSE_URL = "https://nsearchives.nseindia.com/content/indices/ind_nifty{n}list.csv"
_REFRESH_SECONDS = 7 * 24 * 3600


@dataclass(frozen=True)
class Stock:
    ticker: str
    name: str
    sector: str


INDICES = {
    "india": {"^NSEI": "NIFTY 50", "^BSESN": "SENSEX", "^NSEBANK": "BANK NIFTY", "^INDIAVIX": "INDIA VIX"},
    "us": {"^GSPC": "S&P 500", "^IXIC": "NASDAQ", "^DJI": "DOW JONES", "^VIX": "VIX"},
}
BENCHMARK = {"india": "^NSEI", "us": "^GSPC"}

# NSE's industry names are long; these are the labels the UI groups by.
_SECTOR = {
    "Automobile and Auto Components": "Auto",
    "Capital Goods": "Industrials",
    "Construction": "Industrials",
    "Construction Materials": "Materials",
    "Metals & Mining": "Materials",
    "Consumer Durables": "Consumer",
    "Consumer Services": "Consumer",
    "Fast Moving Consumer Goods": "FMCG",
    "Financial Services": "Financials",
    "Healthcare": "Healthcare",
    "Information Technology": "IT",
    "Oil Gas & Consumable Fuels": "Energy",
    "Power": "Energy",
    "Services": "Services",
    "Telecommunication": "Telecom",
}

_US = [
    ("AAPL", "Apple", "Tech"), ("MSFT", "Microsoft", "Tech"), ("NVDA", "NVIDIA", "Tech"),
    ("AVGO", "Broadcom", "Tech"), ("ADBE", "Adobe", "Tech"), ("CRM", "Salesforce", "Tech"),
    ("GOOGL", "Alphabet", "Communication"), ("META", "Meta Platforms", "Communication"),
    ("NFLX", "Netflix", "Communication"), ("AMZN", "Amazon", "Consumer"), ("TSLA", "Tesla", "Consumer"),
    ("HD", "Home Depot", "Consumer"), ("COST", "Costco", "Staples"), ("WMT", "Walmart", "Staples"),
    ("PG", "Procter & Gamble", "Staples"), ("KO", "Coca-Cola", "Staples"), ("PEP", "PepsiCo", "Staples"),
    ("BRK-B", "Berkshire Hathaway", "Financials"), ("JPM", "JPMorgan Chase", "Financials"),
    ("V", "Visa", "Financials"), ("MA", "Mastercard", "Financials"), ("BAC", "Bank of America", "Financials"),
    ("UNH", "UnitedHealth", "Healthcare"), ("LLY", "Eli Lilly", "Healthcare"),
    ("JNJ", "Johnson & Johnson", "Healthcare"), ("MRK", "Merck", "Healthcare"),
    ("ABBV", "AbbVie", "Healthcare"), ("TMO", "Thermo Fisher", "Healthcare"),
    ("XOM", "ExxonMobil", "Energy"), ("CVX", "Chevron", "Energy"),
]


def _short(name: str) -> str:
    return name.replace(" Ltd.", "").replace(" Limited", "").strip()


def parse_nifty(text: str, size: int = 50) -> list[Stock]:
    rows = []
    for r in csv.DictReader(io.StringIO(text.lstrip("﻿"))):
        symbol = (r.get("Symbol") or "").strip()
        if not symbol or symbol.startswith("DUMMY"):  # NSE lists placeholders during demergers
            continue
        industry = (r.get("Industry") or "").strip()
        rows.append(Stock(f"{symbol}.NS", _short(r["Company Name"]), _SECTOR.get(industry, industry)))
    # An HTML error page or a truncated download must never replace a good list.
    if not size * 0.9 <= len(rows) <= size * 1.1:
        raise ValueError(f"unexpected Nifty {size} size: {len(rows)}")
    return rows


_lock = threading.Lock()


def _snapshot(n: int) -> list[Stock]:
    return parse_nifty((_DATA / f"nifty{n}.csv").read_text(encoding="utf-8-sig"), n)


_nifty: list[Stock] = _snapshot(50)
# What the scan covers: the Nifty 50 by default, or a wider index when asked for (see config).
_wide: list[Stock] = _nifty if config.INDIA_UNIVERSE == 50 else _snapshot(config.INDIA_UNIVERSE)
_checked = 0.0


def refresh_nifty(force: bool = False) -> bool:
    """Pull the current lists from NSE at most weekly. Keeps the last good list on failure."""
    global _nifty, _wide, _checked
    if not force and time.time() - _checked < _REFRESH_SECONDS:
        return False
    _checked = time.time()
    sizes = [50] if config.INDIA_UNIVERSE == 50 else [50, config.INDIA_UNIVERSE]
    fresh = {}
    try:
        for n in sizes:
            resp = requests.get(_NSE_URL.format(n=n), timeout=15, headers={"User-Agent": "Mozilla/5.0"})
            resp.raise_for_status()
            fresh[n] = parse_nifty(resp.text, n)
    except Exception as e:
        log.warning("Index refresh failed, keeping current lists: %s", e)
        return False
    with _lock:
        _nifty = fresh[50]
        _wide = _nifty if config.INDIA_UNIVERSE == 50 else fresh[config.INDIA_UNIVERSE]
    return True


def stocks(market: str) -> list[Stock]:
    """The names shown on the desk and used as the random control: Nifty 50 and 30 US giants."""
    if market == "india":
        with _lock:
            return list(_nifty)
    return [Stock(*s) for s in _US]


def scan_stocks(market: str) -> list[Stock]:
    """Everything the scan looks at. Wider than the desk when STOCKSAGE_INDIA_UNIVERSE is set."""
    if market == "india":
        with _lock:
            return list(_wide)
    return stocks(market)


def lookup(ticker: str) -> Stock | None:
    for m in ("india", "us"):
        for s in scan_stocks(m):
            if s.ticker == ticker:
                return s
    return None


def display_name(ticker: str) -> str:
    s = lookup(ticker)
    if s:
        return s.name
    for m in INDICES.values():
        if ticker in m:
            return m[ticker]
    return ticker


def market_of(ticker: str) -> str:
    return "india" if ticker.endswith((".NS", ".BO")) or ticker in INDICES["india"] else "us"
