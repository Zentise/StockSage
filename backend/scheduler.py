"""Background scheduler — runs market scans on schedule."""

import logging
import threading
from datetime import datetime
from zoneinfo import ZoneInfo
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from backend.crew import run_full_scan

logger = logging.getLogger(__name__)

# In-memory cache for last scan results
_scan_cache: dict[str, list[dict]] = {"india": [], "us": []}
_last_scan_time: dict[str, str] = {"india": "", "us": ""}
_market_open: dict[str, bool] = {"india": False, "us": False}
_scan_lock = threading.Lock()


def is_indian_market_open() -> bool:
    now = datetime.now(ZoneInfo("Asia/Kolkata"))
    if now.weekday() >= 5:  # Saturday/Sunday
        return False
    market_open = now.replace(hour=9, minute=15, second=0, microsecond=0)
    market_close = now.replace(hour=15, minute=15, second=0, microsecond=0)
    return market_open <= now <= market_close


def is_us_market_open() -> bool:
    now = datetime.now(ZoneInfo("America/New_York"))
    if now.weekday() >= 5:
        return False
    market_open = now.replace(hour=9, minute=30, second=0, microsecond=0)
    market_close = now.replace(hour=16, minute=0, second=0, microsecond=0)
    return market_open <= now <= market_close


def run_scan_job():
    """Synchronous scan job called by APScheduler."""
    if not _scan_lock.acquire(blocking=False):
        logger.info("Scan already in progress, skipping")
        return
    try:
        for market in ["india", "us"]:
            is_open = is_indian_market_open() if market == "india" else is_us_market_open()
            _market_open[market] = is_open

            if not is_open:
                logger.info(f"{market.upper()} market is closed, skipping scan")
                continue

            try:
                logger.info(f"Running scheduled scan for {market}")
                signals = run_full_scan(market)
                if signals:
                    _scan_cache[market] = signals
                    tz = ZoneInfo("Asia/Kolkata") if market == "india" else ZoneInfo("America/New_York")
                    _last_scan_time[market] = datetime.now(tz).strftime("%Y-%m-%d %H:%M:%S")
                    logger.info(f"Cached {len(signals)} signals for {market}")
            except Exception as e:
                logger.error(f"Scan job failed for {market}: {e}")
    finally:
        _scan_lock.release()
def get_cached_suggestions(market: str = "india") -> dict:
    is_open = is_indian_market_open() if market == "india" else is_us_market_open()
    return {
        "market": market,
        "market_open": is_open,
        "last_scan": _last_scan_time.get(market, ""),
        "suggestions": _scan_cache.get(market, []),
    }


def update_cache(market: str, signals: list[dict]):
    _scan_cache[market] = signals
    tz = ZoneInfo("Asia/Kolkata") if market == "india" else ZoneInfo("America/New_York")
    _last_scan_time[market] = datetime.now(tz).strftime("%Y-%m-%d %H:%M:%S")


def create_scheduler() -> AsyncIOScheduler:
    scheduler = AsyncIOScheduler()
    scheduler.add_job(run_scan_job, "interval", minutes=5, id="market_scan", replace_existing=True)
    return scheduler
