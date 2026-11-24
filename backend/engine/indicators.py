"""Technical facts computed from OHLCV. No opinions here."""

import math

import pandas as pd
from ta.momentum import RSIIndicator
from ta.trend import MACD, EMAIndicator
from ta.volatility import AverageTrueRange, BollingerBands

MIN_BARS = 40


def _last(series: pd.Series) -> float | None:
    v = float(series.iloc[-1])
    return v if math.isfinite(v) else None


def compute(df: pd.DataFrame, volume_fraction: float = 1.0) -> dict:
    """`volume_fraction` is how much of the session has traded, so a bar that is still
    forming is compared with the same share of a normal day."""
    if len(df) < MIN_BARS:
        return {}
    c, h, low, v = df["Close"], df["High"], df["Low"], df["Volume"]
    macd, bb = MACD(c), BollingerBands(c)
    ema9, ema21 = EMAIndicator(c, 9).ema_indicator(), EMAIndicator(c, 21).ema_indicator()
    typical = (h + low + c) / 3
    vol14 = v.rolling(14).sum()
    vwma = (typical * v).rolling(14).sum() / vol14.where(vol14 > 0)
    avg_vol = float(v.iloc[-21:-1].mean())
    spread = ema9 - ema21
    out = {
        "price": _last(c),
        "ema_9": _last(ema9),
        "ema_21": _last(ema21),
        "ema_50": _last(EMAIndicator(c, 50).ema_indicator()) if len(df) >= 60 else None,
        "ema_200": _last(EMAIndicator(c, 200).ema_indicator()) if len(df) >= 220 else None,
        "ema_cross": "up" if spread.iloc[-2] <= 0 < spread.iloc[-1] else "down" if spread.iloc[-2] >= 0 > spread.iloc[-1] else None,
        "rsi": _last(RSIIndicator(c, 14).rsi()),
        "macd": _last(macd.macd()),
        "macd_hist": _last(macd.macd_diff()),
        "bb_upper": _last(bb.bollinger_hband()),
        "bb_lower": _last(bb.bollinger_lband()),
        "atr": _last(AverageTrueRange(h, low, c, 14).average_true_range()),
        "vwma": _last(vwma),
        "volume_ratio": round(float(v.iloc[-1]) / (avg_vol * volume_fraction), 2) if avg_vol > 0 else None,
        # Swing levels exclude the current bar, otherwise price is always "at" its own high.
        "resistance": float(h.iloc[-21:-1].max()),
        "support": float(low.iloc[-21:-1].min()),
        "pattern": candle_pattern(df),
        "return_20d": float(c.iloc[-1] / c.iloc[-21] - 1) * 100,
    }
    return {k: round(x, 4) if isinstance(x, float) else x for k, x in out.items()}


def candle_pattern(df: pd.DataFrame) -> str | None:
    o, h, low, c = (float(df[k].iloc[-1]) for k in ("Open", "High", "Low", "Close"))
    po, pc = float(df["Open"].iloc[-2]), float(df["Close"].iloc[-2])
    body, upper, lower = abs(c - o), h - max(o, c), min(o, c) - low
    if pc < po and c > o and c > po and o < pc:
        return "bullish_engulfing"
    if pc > po and c < o and c < po and o > pc:
        return "bearish_engulfing"
    if c > o and body > 0 and lower > 2 * body and upper < body * 0.5:
        return "hammer"
    return None
