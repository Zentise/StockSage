"""Replay a trade thousands of times from the stock's own daily behaviour.

Block bootstrap of real bars (open gap, high, low, close relative to the previous close),
with the average drift removed: the question is "how often does noise alone take me to the
target or the stop", not "assume last year's trend continues".
"""

import numpy as np
import pandas as pd

PATHS = 4000
BLOCK = 5
BINS = 48


def simulate(daily: pd.DataFrame, entry: float, stop: float, target: float, days: int,
             seed: int = 7, paths: int = PATHS) -> dict:
    df = daily.iloc[-253:]
    prev = df["Close"].shift(1)
    ratios = np.log(np.column_stack([df[k] / prev for k in ("Open", "High", "Low", "Close")])[1:])
    ratios = ratios - ratios[:, 3].mean()
    n = len(ratios)
    rng = np.random.default_rng(seed)
    blocks = int(np.ceil(days / BLOCK))
    starts = rng.integers(0, n - BLOCK + 1, size=(paths, blocks))
    idx = (starts[:, :, None] + np.arange(BLOCK)).reshape(paths, -1)[:, :days]
    steps = ratios[idx]                                    # paths x days x OHLC
    base = np.concatenate([np.zeros((paths, 1)), np.cumsum(steps[:, :, 3], axis=1)[:, :-1]], axis=1)
    o, h, low, close = (entry * np.exp(base + steps[:, :, k]) for k in range(4))

    s = 1 if target > entry else -1
    risk = s * (entry - stop)
    adverse, favour = (low, h) if s > 0 else (h, low)
    hit_s, hit_t = s * (adverse - stop) <= 0, s * (favour - target) >= 0
    first_s = np.where(hit_s.any(1), hit_s.argmax(1), days)
    first_t = np.where(hit_t.any(1), hit_t.argmax(1), days)
    stopped = (first_s <= first_t) & (first_s < days)      # tie goes to the stop
    won = (first_t < first_s) & (first_t < days)
    neither = ~(stopped | won)
    rows = np.arange(paths)
    exit_px = np.where(neither, close[:, -1], 0.0)
    fs, ft = np.minimum(first_s, days - 1), np.minimum(first_t, days - 1)
    gap_s = s * (o[rows, fs] - stop) < 0
    gap_t = s * (o[rows, ft] - target) > 0
    exit_px = np.where(stopped, np.where(gap_s, o[rows, fs], stop), exit_px)
    exit_px = np.where(won, np.where(gap_t, o[rows, ft], target), exit_px)
    r = s * (exit_px - entry) / risk

    # Density of closing prices per day: the 3D surface in the planner.
    lo, hi = np.percentile(close, [0.5, 99.5])
    lo, hi = min(lo, stop, target) * 0.995, max(hi, stop, target) * 1.005
    edges = np.linspace(lo, hi, BINS + 1)
    density = np.stack([np.histogram(close[:, d], edges)[0] for d in range(days)]) / paths
    return {
        "paths": paths, "days": days, "history_bars": int(n),
        "p_target": round(float(won.mean()), 4),
        "p_stop": round(float(stopped.mean()), 4),
        "p_neither": round(float(neither.mean()), 4),
        "avg_r": round(float(r.mean()), 3),
        "median_days_to_exit": int(np.median(np.minimum(np.minimum(first_s, first_t) + 1, days))),
        "prices": [round(float(x), 2) for x in (edges[:-1] + edges[1:]) / 2],
        "density": [[round(float(v), 4) for v in row] for row in density],
        "bands": [[round(float(v), 2) for v in np.percentile(close[:, d], [5, 25, 50, 75, 95])] for d in range(days)],
    }
