from datetime import datetime, timedelta

import pandas as pd
import pytest

from backend.engine.outcome import resolve

T0 = datetime(2026, 11, 2, 4, 0)
END = T0 + timedelta(days=5)


def bars(*rows):
    return pd.DataFrame([dict(zip(("Open", "High", "Low", "Close"), r)) for r in rows],
                        index=[T0 + timedelta(hours=i) for i in range(len(rows))])


def run(b, d="BUY", entry=100, stop=95, target=110, **k):
    return resolve(b, d, entry, stop, target, T0, END, **k)


def test_target():
    o = run(bars((100, 102, 99, 101), (101, 111, 100, 110)))
    assert (o.status, o.exit_price, o.r) == ("target", 110, 2.0)


def test_stop_then_recovery_is_still_a_stop():
    """v1's accuracy page called this 'On Track' because price later came back above entry."""
    o = run(bars((100, 101, 94, 96), (96, 109, 96, 108)))
    assert (o.status, o.r) == ("stop", -1.0)


def test_both_in_one_bar_counts_as_stop():
    assert run(bars((100, 112, 94, 105))).status == "stop"


def test_gap_through_stop_costs_more_than_one_r():
    o = run(bars((100, 101, 99, 100), (90, 91, 89, 90)))
    assert (o.status, o.exit_price, o.r) == ("stop", 90, -2.0)


def test_short_side():
    o = run(bars((100, 101, 89, 90)), "SELL", 100, 105, 90)
    assert (o.status, o.r) == ("target", 2.0)


def test_pending_fills_at_open():
    o = run(bars((102, 111, 101, 110)), pending=True)
    assert o.entry == 102 and o.r == pytest.approx((110 - 102) / 7, abs=0.001)


@pytest.mark.parametrize("o", [94, 111])
def test_pending_void_when_open_is_past_a_level(o):
    assert run(bars((o, o + 1, o - 1, o)), pending=True).status == "void"


def test_expires_after_grace_only():
    b = bars((100, 101, 99, 100.5))
    assert run(b, now=END + timedelta(minutes=5)).status == "active"
    o = run(b, now=END + timedelta(hours=1))
    assert (o.status, o.r) == ("expired", 0.1)


def test_bars_before_creation_are_ignored():
    b = bars((100, 120, 80, 100), (100, 101, 99, 100))
    b.index = [T0 - timedelta(hours=1), T0]
    assert run(b).status == "active"
