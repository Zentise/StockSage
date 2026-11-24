import pytest

from backend import db, universe
from backend.engine import odds
from backend.providers import yahoo
from backend.services import notes

# ---------------------------------------------------------------- market data


def spark(**meta):
    return {"response": [{"meta": {"symbol": "^GSPC", "regularMarketTime": 1, **meta},
                          "indicators": {"quote": [{"close": [1.0, None, 2.0]}]}}]}


def test_daily_change_uses_previous_close():
    """v1 compared with the close before a 5-day window and showed -2.4% on a +4.7% day."""
    q = yahoo.parse_spark(spark(regularMarketPrice=7236.44, previousClose=6910.39, chartPreviousClose=7416.59))
    assert q["change_pct"] == 4.72 and q["spark"] == [1.0, 2.0]


def test_quote_without_price_is_dropped():
    assert yahoo.parse_spark(spark(previousClose=10)) is None
    assert yahoo.parse_spark({}) is None


def test_chart_drops_holiday_placeholders_and_nulls():
    r = {"meta": {"instrumentType": "EQUITY"}, "timestamp": [86400, 172800, 259200], "indicators": {"quote": [{
        "open": [10, 10, None], "high": [11, 10, 1], "low": [9, 10, 1], "close": [10.5, 10, 1], "volume": [None, 0, 5]}]}}
    df = yahoo.parse_chart(r, "1d")
    assert len(df) == 1 and df["Volume"].iloc[0] == 0


def test_nifty_snapshot_is_complete():
    s = universe.stocks("india")
    assert len(s) == 50 and len({x.ticker for x in s}) == 50
    assert not {"TATAMOTORS.NS", "LTIM.NS"} & {x.ticker for x in s}


def test_bad_download_never_replaces_the_list():
    with pytest.raises(ValueError):
        universe.parse_nifty("<html>Access denied</html>")


# ---------------------------------------------------------------- AI fact check

FACTS = {"quote": {"price": 164.93, "change_pct": 30.42}, "fundamentals": {"roe": 0.08759, "market_cap": 18282369253376},
         "recent_headlines": [{"title": "CEO returns after 12 days"}]}


def test_invented_numbers_are_removed():
    out = notes.clean({"summary": "Up 30.4% to 164.93. Analysts expect 210.50 by March.",
                       "bull": ["ROE is 8.8%", "Revenue grew 44%"], "bear": ["P/E of 61 is rich"]}, FACTS)
    assert out["summary"] == "Up 30.4% to 164.93."
    assert out["bull"] == ["ROE is 8.8%"] and out["bear"] == []
    assert out["removed"] == 3


def test_natural_rounding_is_allowed():
    ok = notes.allowed_numbers(FACTS)
    assert notes.grounded("worth about 18.28 trillion, up 30%", ok)
    assert notes.grounded("the CEO returned after 12 days, above the 21-day average", ok)


def test_thousands_separators():
    assert notes.grounded("Nifty at 25,349.65", notes.allowed_numbers({"p": 25349.65}))


def test_missing_key_fails_loudly():
    db.init()
    with pytest.raises(notes.NoteError, match="GROQ_API_KEY"):
        notes.build("TCS.NS", FACTS)


# ---------------------------------------------------------------- odds


def test_probabilities_add_up(make_bars):
    o = odds.simulate(make_bars(), 1000, 950, 1100, 10)
    assert o["p_target"] + o["p_stop"] + o["p_neither"] == pytest.approx(1, abs=0.001)
    assert len(o["density"]) == 10 and len(o["density"][0]) == len(o["prices"])


def test_drift_is_removed(make_bars):
    """A stock that only ever rose must not make a long look like free money."""
    o = odds.simulate(make_bars(drift=0.004), 1000, 970, 1030, 20)
    assert abs(o["p_target"] - o["p_stop"]) < 0.15


def test_short_is_mirrored(make_bars):
    o = odds.simulate(make_bars(), 1000, 1050, 900, 10)
    assert o["p_target"] < o["p_stop"]


@pytest.mark.parametrize("target", [1020, 1050, 1150])
def test_no_free_lunch_at_any_ratio(make_bars, target):
    assert abs(odds.simulate(make_bars(seed=4), 1000, 960, target, 30)["avg_r"]) < 0.25
