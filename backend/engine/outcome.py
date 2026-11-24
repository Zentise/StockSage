"""Decide how a trade ended by walking the actual price path, bar by bar."""

from dataclasses import dataclass
from datetime import datetime, timedelta

import pandas as pd

GRACE = timedelta(minutes=30)  # free data lags; don't call it over before the last bars arrive


@dataclass
class Outcome:
    status: str            # active | target | stop | expired | void
    entry: float
    exit_price: float | None = None
    exit_at: datetime | None = None
    r: float | None = None
    best_r: float = 0.0    # furthest it went in our favour
    worst_r: float = 0.0   # furthest against


def resolve(
    bars: pd.DataFrame,
    direction: str,
    entry: float,
    stop: float,
    target: float,
    created: datetime,
    expires: datetime,
    pending: bool = False,
    now: datetime | None = None,
) -> Outcome:
    """`bars` and datetimes are naive UTC. Bars are labelled by their start time.

    * Pending setups (made while the market was shut) fill at the first later open, and are
      void if that open has already passed the stop or target.
    * A bar that touches both levels counts as a stop: without tick data, assume the worse.
    * A gap through a level exits at the open, not at the level.
    """
    s = 1 if direction == "BUY" else -1
    path = bars[(bars.index >= created) & (bars.index < expires)]
    over = now is not None and now >= expires + GRACE
    if pending:
        if path.empty:
            return Outcome("void" if over else "active", entry)
        o = float(path["Open"].iloc[0])
        if s * (o - stop) <= 0 or s * (o - target) >= 0:
            return Outcome("void", entry, exit_at=path.index[0].to_pydatetime())
        entry = o
    risk = s * (entry - stop)
    if risk <= 0:
        return Outcome("void", entry)
    best = worst = 0.0
    for ts, o, h, low in zip(path.index, path["Open"], path["High"], path["Low"]):
        adverse, favour = (low, h) if s > 0 else (h, low)
        hit_stop = s * (adverse - stop) <= 0
        hit_target = s * (favour - target) >= 0
        if hit_stop or hit_target:
            level = stop if hit_stop else target
            gapped = s * (o - level) < 0 if hit_stop else s * (o - level) > 0
            px = float(o) if gapped else level
            r = s * (px - entry) / risk
            return Outcome("stop" if hit_stop else "target", entry, round(px, 2), ts.to_pydatetime(),
                           round(r, 3), round(max(best, r), 3), round(min(worst, r), 3))
        best = max(best, s * (favour - entry) / risk)
        worst = min(worst, s * (adverse - entry) / risk)
    if len(path) and (over or bars.index[-1] >= expires):
        px = float(path["Close"].iloc[-1])
        return Outcome("expired", entry, round(px, 2), path.index[-1].to_pydatetime(),
                       round(s * (px - entry) / risk, 3), round(best, 3), round(worst, 3))
    return Outcome("active", entry, best_r=round(best, 3), worst_r=round(worst, 3))
