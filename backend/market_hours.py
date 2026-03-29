"""Market session helpers with holiday awareness."""

import os
from datetime import date, datetime
from zoneinfo import ZoneInfo

import holidays


def _parse_custom_holidays(env_name: str) -> set[date]:
    raw = os.getenv(env_name, "").strip()
    parsed: set[date] = set()
    if not raw:
        return parsed

    for item in raw.split(","):
        item = item.strip()
        if not item:
            continue
        try:
            parsed.add(date.fromisoformat(item))
        except ValueError:
            # Ignore malformed entries so one bad date does not break startup.
            continue
    return parsed


# NSE exchange-specific trading holidays NOT covered by the national holidays library.
# The `holidays` library for India only covers ~3 national holidays (Republic Day,
# Independence Day, Gandhi Jayanti). NSE observes ~15 additional exchange holidays.
# Update this list each year when NSE publishes its official holiday schedule.
_NSE_EXCHANGE_HOLIDAYS: set[date] = {
    # 2025
    date(2025, 2, 26),   # Maha Shivratri
    date(2025, 3, 14),   # Holi
    date(2025, 4, 10),   # Ram Navami
    date(2025, 4, 14),   # Dr. Ambedkar Jayanti / Mahavir Jayanti
    date(2025, 4, 18),   # Good Friday
    date(2025, 5, 1),    # Maharashtra Day
    date(2025, 10, 20),  # Diwali – Laxmi Pujan
    date(2025, 10, 21),  # Diwali – Balipratipada
    date(2025, 11, 5),   # Gurunanak Jayanti
    # 2026
    date(2026, 2, 17),   # Maha Shivratri
    date(2026, 3, 4),    # Holi
    date(2026, 3, 27),   # Gudi Padwa / Ugadi (observed Friday; actual date falls on weekend)
    date(2026, 4, 3),    # Good Friday
    date(2026, 4, 6),    # Ram Navami
    date(2026, 4, 14),   # Dr. Ambedkar Jayanti / Mahavir Jayanti
    date(2026, 5, 1),    # Maharashtra Day
    date(2026, 10, 20),  # Diwali – Laxmi Pujan (approx; update when NSE confirms)
    date(2026, 10, 21),  # Diwali – Balipratipada (approx)
    date(2026, 11, 19),  # Gurunanak Jayanti (approx)
}


def is_indian_trading_holiday(day: date | None = None) -> bool:
    day = day or datetime.now(ZoneInfo("Asia/Kolkata")).date()
    if day.weekday() >= 5:
        return True

    # Exchange-specific holidays (Holi, Diwali, Mahashivratri, etc.)
    if day in _NSE_EXCHANGE_HOLIDAYS:
        return True

    # User-configured extra holidays (STOCKSAGE_NSE_HOLIDAYS=YYYY-MM-DD,...)
    custom_holidays = _parse_custom_holidays("STOCKSAGE_NSE_HOLIDAYS")
    if day in custom_holidays:
        return True

    india_holidays = holidays.country_holidays("IN", years=[day.year])
    return day in india_holidays


def is_indian_market_open(now: datetime | None = None) -> bool:
    now = now or datetime.now(ZoneInfo("Asia/Kolkata"))
    if is_indian_trading_holiday(now.date()):
        return False
    market_open = now.replace(hour=9, minute=15, second=0, microsecond=0)
    market_close = now.replace(hour=15, minute=30, second=0, microsecond=0)
    return market_open <= now <= market_close


def is_us_market_open(now: datetime | None = None) -> bool:
    now = now or datetime.now(ZoneInfo("America/New_York"))
    if now.weekday() >= 5:
        return False
    us_holidays = holidays.country_holidays("US", years=[now.year])
    if now.date() in us_holidays:
        return False
    market_open = now.replace(hour=9, minute=30, second=0, microsecond=0)
    market_close = now.replace(hour=16, minute=0, second=0, microsecond=0)
    return market_open <= now <= market_close


def is_market_open(market: str) -> bool:
    return is_indian_market_open() if market == "india" else is_us_market_open()
