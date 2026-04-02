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
    # 2026 — Official NSE holiday list
    date(2026, 1, 15),   # Municipal Corporation Election – Maharashtra
    date(2026, 1, 26),   # Republic Day
    date(2026, 3, 3),    # Holi
    date(2026, 3, 26),   # Shri Ram Navami
    date(2026, 3, 31),   # Shri Mahavir Jayanti
    date(2026, 4, 3),    # Good Friday
    date(2026, 4, 14),   # Dr. Baba Saheb Ambedkar Jayanti
    date(2026, 5, 1),    # Maharashtra Day
    date(2026, 5, 28),   # Bakri Id
    date(2026, 6, 26),   # Muharram
    date(2026, 9, 14),   # Ganesh Chaturthi
    date(2026, 10, 2),   # Mahatma Gandhi Jayanti
    date(2026, 10, 20),  # Dussehra
    date(2026, 11, 10),  # Diwali – Balipratipada
    date(2026, 11, 24),  # Prakash Gurpurb Sri Guru Nanak Dev
    date(2026, 12, 25),  # Christmas
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


# NYSE exchange-specific trading holidays.
# The `holidays` library covers some US federal holidays but may not match
# the exact NYSE observed-date rules (e.g. Friday before / Monday after).
# Update this list each year when NYSE publishes its official holiday schedule.
_NYSE_HOLIDAYS: set[date] = {
    # 2026
    date(2026, 1, 1),    # New Year's Day
    date(2026, 1, 19),   # Martin Luther King, Jr. Day
    date(2026, 2, 16),   # Washington's Birthday
    date(2026, 4, 3),    # Good Friday
    date(2026, 5, 25),   # Memorial Day
    date(2026, 6, 19),   # Juneteenth National Independence Day
    date(2026, 7, 3),    # Independence Day (observed)
    date(2026, 9, 7),    # Labor Day
    date(2026, 11, 26),  # Thanksgiving Day
    date(2026, 12, 25),  # Christmas Day
    # 2027
    date(2027, 1, 1),    # New Year's Day
    date(2027, 1, 18),   # Martin Luther King, Jr. Day
    date(2027, 2, 15),   # Washington's Birthday
    date(2027, 3, 26),   # Good Friday
    date(2027, 5, 31),   # Memorial Day
    date(2027, 6, 18),   # Juneteenth (observed)
    date(2027, 7, 5),    # Independence Day (observed)
    date(2027, 9, 6),    # Labor Day
    date(2027, 11, 25),  # Thanksgiving Day
    date(2027, 12, 24),  # Christmas Day (observed)
    # 2028
    date(2028, 1, 17),   # Martin Luther King, Jr. Day
    date(2028, 2, 21),   # Washington's Birthday
    date(2028, 4, 14),   # Good Friday
    date(2028, 5, 29),   # Memorial Day
    date(2028, 6, 19),   # Juneteenth National Independence Day
    date(2028, 7, 4),    # Independence Day
    date(2028, 9, 4),    # Labor Day
    date(2028, 11, 23),  # Thanksgiving Day
    date(2028, 12, 25),  # Christmas Day
}


def is_us_trading_holiday(day: date | None = None) -> bool:
    day = day or datetime.now(ZoneInfo("America/New_York")).date()
    if day.weekday() >= 5:
        return True

    # NYSE exchange-specific holidays
    if day in _NYSE_HOLIDAYS:
        return True

    # User-configured extra holidays (STOCKSAGE_NYSE_HOLIDAYS=YYYY-MM-DD,...)
    custom_holidays = _parse_custom_holidays("STOCKSAGE_NYSE_HOLIDAYS")
    if day in custom_holidays:
        return True

    return False


def is_us_market_open(now: datetime | None = None) -> bool:
    now = now or datetime.now(ZoneInfo("America/New_York"))
    if is_us_trading_holiday(now.date()):
        return False
    market_open = now.replace(hour=9, minute=30, second=0, microsecond=0)
    market_close = now.replace(hour=16, minute=0, second=0, microsecond=0)
    return market_open <= now <= market_close


def is_market_open(market: str) -> bool:
    return is_indian_market_open() if market == "india" else is_us_market_open()
