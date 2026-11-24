"""Which symbols we follow. Nifty 50 comes from NSE's own file so it cannot go stale."""

import csv
import io
import logging
import threading
import time
from dataclasses import dataclass
from pathlib import Path

import requests

log = logging.getLogger(__name__)
_SNAPSHOT = Path(__file__).parent / "data" / "nifty50.csv"
_NSE_URL = "https://nsearchives.nseindia.com/content/indices/ind_nifty50list.csv"
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


def parse_nifty(text: str) -> list[Stock]:
    rows = []
    for r in csv.DictReader(io.StringIO(text.lstrip("﻿"))):
        symbol = (r.get("Symbol") or "").strip()
        if not symbol or symbol.startswith("DUMMY"):  # NSE lists placeholders during demergers
            continue
        industry = (r.get("Industry") or "").strip()
        rows.append(Stock(f"{symbol}.NS", _short(r["Company Name"]), _SECTOR.get(industry, industry)))
    # An HTML error page or a truncated download must never replace a good list.
    if not 45 <= len(rows) <= 55:
        raise ValueError(f"unexpected Nifty 50 size: {len(rows)}")
    return rows


_lock = threading.Lock()
_nifty: list[Stock] = parse_nifty(_SNAPSHOT.read_text(encoding="utf-8-sig"))
_checked = 0.0


def refresh_nifty(force: bool = False) -> bool:
    """Pull the current list from NSE at most weekly. Keeps the last good list on failure."""
    global _nifty, _checked
    if not force and time.time() - _checked < _REFRESH_SECONDS:
        return False
    _checked = time.time()
    try:
        resp = requests.get(_NSE_URL, timeout=15, headers={"User-Agent": "Mozilla/5.0"})
        resp.raise_for_status()
        fresh = parse_nifty(resp.text)
    except Exception as e:
        log.warning("Nifty 50 refresh failed, keeping current list: %s", e)
        return False
    with _lock:
        _nifty = fresh
    return True


def stocks(market: str) -> list[Stock]:
    if market == "india":
        with _lock:
            return list(_nifty)
    return [Stock(*s) for s in _US]


def lookup(ticker: str) -> Stock | None:
    for m in ("india", "us"):
        for s in stocks(m):
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
