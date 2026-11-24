import pytest

from backend.engine import indicators, signals

BEARISH = ("below", "falling", "down", "Bearish", "Overbought")
BULLISH = ("above", "rising", "up", "Bullish", "Hammer", "Oversold")


def scenario(make_bars, seed):
    return make_bars(seed=seed, drift=[-0.004, 0, 0.004][seed % 3])


@pytest.mark.parametrize("seed", range(120))
def test_every_setup_is_coherent(make_bars, seed):
    s = signals.evaluate("X", scenario(make_bars, seed))
    if s is None:
        return
    wrong = BEARISH if s.direction == "BUY" else BULLISH
    for e in s.evidence_for:
        assert not any(w in e.text for w in wrong), f"{s.direction} justified by {e.text!r}"
    assert sum(e.weight for e in s.evidence_for) > sum(e.weight for e in s.evidence_against)
    if s.direction == "AVOID":
        assert s.stop is None and s.target is None
    else:
        assert s.stop < s.entry < s.target
        assert (s.target - s.entry) / (s.entry - s.stop) == pytest.approx(signals.REWARD, abs=0.02)


def test_the_scenarios_produce_both_kinds(make_bars):
    kinds = {s.direction for seed in range(120) if (s := signals.evaluate("X", scenario(make_bars, seed)))}
    assert kinds == {"BUY", "AVOID"}


def test_tie_is_not_a_signal(make_bars):
    x = indicators.compute(make_bars())
    x |= {"ema_cross": None, "pattern": None, "volume_ratio": 1.0, "rsi": 50, "bar_up": True,
          "price": 100, "resistance": 110, "support": 90,
          "ema_9": 101, "ema_21": 100, "macd_hist": -1, "vwma": 100}
    bull, bear = signals.collect(x)
    assert sum(e.weight for e in bull) == sum(e.weight for e in bear)
    assert signals._decide("X", x, None) is None


def test_intraday_stop_is_outside_noise():
    stop, _ = signals.levels(1000, atr=0.5, category="intraday", up=True)
    assert (1000 - stop) / 1000 >= 0.006      # v1 put it at 0.15%


def test_stop_is_capped():
    stop, _ = signals.levels(1000, atr=200, category="short_term", up=True)
    assert stop == pytest.approx(940)


def test_partial_session_volume_is_scaled(make_bars):
    df = make_bars()
    df.loc[df.index[-1], "Volume"] = df["Volume"].iloc[-21:-1].mean() * 0.25
    assert indicators.compute(df, 0.25)["volume_ratio"] == pytest.approx(1.0, abs=0.01)


def test_too_little_history_gives_nothing(make_bars):
    assert indicators.compute(make_bars(n=20)) == {}
    assert signals.evaluate("X", make_bars(n=20)) is None
