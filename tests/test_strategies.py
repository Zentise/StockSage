import numpy as np
import pandas as pd

from backend import replay
from backend.engine import strategies as st


def test_short_history_is_silent(make_bars):
    assert st.masks(make_bars(n=100)) == {}
    assert st.evaluate("X.NS", make_bars(n=100)) == []


def test_no_strategy_ever_looks_ahead(make_bars):
    """The value on a day must not change when later days are added: otherwise the replay cheats."""
    df = make_bars(n=420, seed=4, vol=0.02)
    full = st.masks(df)
    for cut in (260, 300, 350, 400):
        part = st.masks(df.iloc[:cut])
        for key, series in part.items():
            assert (series.to_numpy() == full[key].iloc[:cut].to_numpy()).all(), (key, cut)


def test_strategies_fire_sometimes_on_noisy_data(make_bars):
    fired = {k: 0 for k in st.REGISTRY}
    for seed in range(12):
        for k, m in st.masks(make_bars(n=600, seed=seed, vol=0.02, drift=0.0004)).items():
            fired[k] += int(m.sum())
    assert all(v > 0 for v in fired.values()), fired


def test_evaluate_gives_buy_setups_with_honest_levels(make_bars):
    found = []
    for seed in range(40):
        df = make_bars(n=420, seed=seed, vol=0.02, drift=0.0005)
        found += [(df, s) for s in st.evaluate("X.NS", df)]
        if len(found) >= 3:
            break
    assert found
    for _, s in found:
        assert s.direction == "BUY" and s.stop < s.entry < s.target
        assert s.setup in st.REGISTRY and s.evidence_for
        assert all(e.weight > 0 for e in s.evidence_for)
        # The sides must not contradict: nothing bearish listed as a reason for.
        assert not any("below" in e.text.lower() and "average" in e.text.lower() for e in s.evidence_for)


def _summary(edge_low, first=0.1, second=0.1, n=300, net=0.1):
    return {"n": n, "edge_low": edge_low, "edge_first_half": first, "edge_second_half": second, "avg_r_net": net}


def test_validation_bar_is_strict():
    assert replay.validated(_summary(0.02))
    assert not replay.validated(_summary(-0.01))                 # could be luck
    assert not replay.validated(_summary(0.02, first=-0.05))     # worked in only one half
    assert not replay.validated(_summary(0.02, n=60))            # too few trades
    assert not replay.validated(_summary(0.02, net=-0.01))       # costs eat it
    assert not replay.validated({})


def test_summarize_reports_edge_against_control():
    rows = [{"date": f"2024-{m:02d}-10", "r": 0.2, "control": 0.1, "net": 0.15, "status": "target"} for m in range(1, 13) for _ in range(5)]
    s = replay.summarize(rows)
    assert s["n"] == 60 and abs(s["edge_r"] - 0.1) < 1e-9 and s["edge_low"] <= s["edge_r"] <= s["edge_high"]
    assert s["edge_first_half"] > 0 and s["edge_second_half"] > 0
    assert isinstance(np.float64(s["edge_r"]), float) and not isinstance(s["n"], pd.Series)
