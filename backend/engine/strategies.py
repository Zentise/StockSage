"""Pluggable daily-bar strategies.

Every strategy is a function from a table of features to a True/False column: "does this bar
qualify?". Because it is computed once over the whole history, the replay and the live scan
use the very same code, and a test proves no value ever depends on a later bar.

A strategy only decides *when* to enter. Stop and target come from the shared rule in
`signals.levels`, so a random stock bought on the same day under that rule is a fair control.

Strategies are judged by `python -m backend.replay`, not by how they look on a chart.
"""

from collections.abc import Callable
from dataclasses import dataclass

import pandas as pd
from ta.momentum import RSIIndicator
from ta.trend import EMAIndicator
from ta.volatility import AverageTrueRange

from backend.engine import signals as sg

MIN_BARS = 230          # the 200-day average needs this much history


@dataclass(frozen=True)
class Strategy:
    key: str
    label: str
    blurb: str
    mask: Callable[[pd.DataFrame], pd.Series]
    why: Callable[[pd.Series], list[sg.Evidence]]


def features(df: pd.DataFrame) -> pd.DataFrame:
    c, h, low, v = df["Close"], df["High"], df["Low"], df["Volume"]
    f = pd.DataFrame(index=df.index)
    f["close"], f["open"] = c, df["Open"]
    f["ema50"] = EMAIndicator(c, 50).ema_indicator()
    f["ema200"] = EMAIndicator(c, 200).ema_indicator()
    f["sma200"] = c.rolling(200).mean()
    f["rsi14"] = RSIIndicator(c, 14).rsi()
    f["rsi2"] = RSIIndicator(c, 2).rsi()
    f["atr"] = AverageTrueRange(h, low, c, 14).average_true_range()
    f["hi55"] = h.rolling(55).max().shift(1)                  # the 55 bars before this one
    f["vol_ratio"] = v / v.rolling(20).mean().shift(1)
    return f


# ---- the three candidates -------------------------------------------------------------

def _pullback(f: pd.DataFrame) -> pd.Series:
    """A stock in a long uptrend that has dipped and just turned up."""
    return (f.ema50 > f.ema200) & (f.close > f.ema200) & (f.rsi14 < 40) & (f.close > f.open)


def _pullback_why(r: pd.Series) -> list[sg.Evidence]:
    return [sg.Evidence("In a long uptrend: 50-day average above the 200-day", 2),
            sg.Evidence(f"Pulled back: RSI is only {r.rsi14:.0f}", 3),
            sg.Evidence("Turned up: today closed above its open", 1)]


def _breakout(f: pd.DataFrame) -> pd.Series:
    """A close above everything of the last 55 sessions, on heavy volume, above the 200-day."""
    return (f.close > f.hi55) & (f.vol_ratio >= 1.5) & (f.close > f.ema200)


def _breakout_why(r: pd.Series) -> list[sg.Evidence]:
    return [sg.Evidence("Closed above its 55-day high", 3),
            sg.Evidence(f"Volume {r.vol_ratio:.1f}x normal", 2),
            sg.Evidence("Above its 200-day average", 1)]


def _rsi2(f: pd.DataFrame) -> pd.Series:
    """Very short-term oversold inside a long-term uptrend (the classic 2-day RSI dip)."""
    return (f.close > f.sma200) & (f.rsi2 < 10)


def _rsi2_why(r: pd.Series) -> list[sg.Evidence]:
    return [sg.Evidence("Above its 200-day average: long-term uptrend", 2),
            sg.Evidence(f"Sold off hard in two days: 2-day RSI is {r.rsi2:.0f}", 3)]


REGISTRY: dict[str, Strategy] = {s.key: s for s in (
    Strategy("pullback", "Pullback in an uptrend",
             "Buys a dip in a stock whose 50-day average is above its 200-day, on the first up day.", _pullback, _pullback_why),
    Strategy("breakout", "55-day breakout",
             "Buys a close above the highest high of the last 55 sessions, on 1.5x normal volume, above the 200-day.", _breakout, _breakout_why),
    Strategy("rsi2", "Two-day dip",
             "Buys when the 2-day RSI is below 10 while the price is above its 200-day average.", _rsi2, _rsi2_why),
)}
BASELINE = "confluence"
LABELS = {BASELINE: "Confluence (the original engine)"} | {k: s.label for k, s in REGISTRY.items()}


def masks(df: pd.DataFrame) -> dict[str, pd.Series]:
    """Which bars qualify, for each strategy. NaN comparisons are False, so short history is quiet."""
    if len(df) < MIN_BARS:
        return {}
    f = features(df)
    return {k: s.mask(f).fillna(False) for k, s in REGISTRY.items()}


def evaluate(ticker: str, daily: pd.DataFrame) -> list[sg.Setup]:
    """Setups whose condition holds on the last finished bar of `daily`."""
    if len(daily) < MIN_BARS:
        return []
    f = features(daily)
    last = f.iloc[-1]
    if not last.atr or pd.isna(last.atr) or not last.close:
        return []
    x = sg._facts(daily, 1.0)
    bear = sg.collect(x)[1] if x else []
    bear.sort(key=lambda e: -e.weight)
    out = []
    for s in REGISTRY.values():
        if not bool(s.mask(f).fillna(False).iloc[-1]):
            continue
        stop, target = sg.levels(float(last.close), float(last.atr), "short_term", True)
        out.append(sg.Setup(ticker, "BUY", "short_term", sg.RULES["short_term"][4], round(float(last.close), 2),
                            stop, target, s.why(last), list(bear), setup=s.key))
    return out
