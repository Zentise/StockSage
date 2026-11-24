from datetime import UTC, date, datetime

import pytest

from backend import market_hours as mh


@pytest.mark.parametrize("day", [date(2026, 3, 20), date(2026, 5, 27), date(2026, 6, 25), date(2026, 8, 25), date(2026, 9, 4)])
def test_days_v1_wrongly_closed_are_sessions(day):
    assert mh.is_session("india", day)


@pytest.mark.parametrize("day", [date(2026, 1, 15), date(2026, 11, 10), date(2026, 11, 24), date(2026, 12, 25), date(2026, 11, 22)])
def test_real_nse_holidays_are_closed(day):
    assert not mh.is_session("india", day)


def test_us_half_day_after_thanksgiving():
    assert mh.is_open("us", datetime(2026, 11, 27, 17, 59, tzinfo=UTC))       # 12:59 New York
    assert not mh.is_open("us", datetime(2026, 11, 27, 18, 1, tzinfo=UTC))    # 13:01, closed early


def test_nse_hours():
    assert not mh.is_open("india", datetime(2026, 11, 23, 3, 44, tzinfo=UTC))
    assert mh.is_open("india", datetime(2026, 11, 23, 3, 45, tzinfo=UTC))
    assert not mh.is_open("india", datetime(2026, 11, 23, 10, 0, tzinfo=UTC))


def test_holiday_status_points_at_next_session():
    s = mh.status("india", datetime(2026, 11, 24, 6, 0, tzinfo=UTC))
    assert s["reason"] == "Exchange holiday" and s["session_date"] == "2026-11-23"
    assert s["opens_at"].startswith("2026-11-25T03:45")


def test_beyond_calendar_falls_back_and_says_so():
    s = mh.status("india", datetime(2031, 6, 4, 6, 0, tzinfo=UTC))  # a Wednesday
    assert s["open"] and s["calendar_ok"] is False


def test_sessions_after_skips_weekend_and_holiday():
    assert mh.sessions_after("india", date(2026, 11, 20), 2) == date(2026, 11, 25)
