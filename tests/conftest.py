import os
import tempfile

# Must happen before any backend import: never touch the real database, network loop or AI key.
os.environ["DATABASE_URL"] = "sqlite:///" + os.path.join(tempfile.mkdtemp(), "test.db").replace("\\", "/")
os.environ["STOCKSAGE_BACKGROUND"] = "0"
os.environ["GROQ_API_KEY"] = ""

import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402
import pytest  # noqa: E402


@pytest.fixture
def make_bars():
    def build(n=300, drift=0.0, vol=0.012, seed=1, start="2025-01-01", freq="1D"):
        rng = np.random.default_rng(seed)
        close = 1000 * np.exp(np.cumsum(rng.normal(drift, vol, n)))
        open_ = np.concatenate([[1000], close[:-1]]) * np.exp(rng.normal(0, vol / 4, n))
        high = np.maximum(open_, close) * (1 + abs(rng.normal(0, vol / 2, n)))
        low = np.minimum(open_, close) * (1 - abs(rng.normal(0, vol / 2, n)))
        return pd.DataFrame({"Open": open_, "High": high, "Low": low, "Close": close,
                             "Volume": rng.integers(500_000, 2_000_000, n).astype(float)},
                            index=pd.date_range(start, periods=n, freq=freq))
    return build
