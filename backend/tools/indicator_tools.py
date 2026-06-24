"""Technical indicator calculation tools using ta library."""

from datetime import datetime
import pytz
import pandas as pd
import numpy as np
import ta
from ta.trend import EMAIndicator, MACD, SMAIndicator
from ta.momentum import RSIIndicator, StochRSIIndicator
from ta.volatility import AverageTrueRange, BollingerBands
from ta.volume import VolumeWeightedAveragePrice
import logging

logger = logging.getLogger(__name__)


def compute_indicators(df: pd.DataFrame) -> dict:
    """Compute a full set of technical indicators on OHLCV DataFrame."""
    if df.empty or len(df) < 20:
        return {}

    close = df["Close"].squeeze()
    high = df["High"].squeeze()
    low = df["Low"].squeeze()
    volume = df["Volume"].squeeze()

    result = {}

    try:
        # EMAs
        result["ema_9"] = round(float(EMAIndicator(close, window=9).ema_indicator().iloc[-1]), 2)
        result["ema_21"] = round(float(EMAIndicator(close, window=21).ema_indicator().iloc[-1]), 2)
        if len(df) >= 50:
            result["ema_50"] = round(float(EMAIndicator(close, window=50).ema_indicator().iloc[-1]), 2)
        if len(df) >= 200:
            result["ema_200"] = round(float(EMAIndicator(close, window=200).ema_indicator().iloc[-1]), 2)

        # RSI
        rsi = RSIIndicator(close, window=14).rsi()
        result["rsi"] = round(float(rsi.iloc[-1]), 2)

        # MACD
        macd_obj = MACD(close)
        result["macd"] = round(float(macd_obj.macd().iloc[-1]), 4)
        result["macd_signal"] = round(float(macd_obj.macd_signal().iloc[-1]), 4)
        result["macd_histogram"] = round(float(macd_obj.macd_diff().iloc[-1]), 4)

        # Bollinger Bands
        bb = BollingerBands(close)
        result["bb_upper"] = round(float(bb.bollinger_hband().iloc[-1]), 2)
        result["bb_middle"] = round(float(bb.bollinger_mavg().iloc[-1]), 2)
        result["bb_lower"] = round(float(bb.bollinger_lband().iloc[-1]), 2)

        # ATR
        atr = AverageTrueRange(high, low, close, window=14)
        result["atr"] = round(float(atr.average_true_range().iloc[-1]), 2)

        # VWAP (intraday-like, based on available data)
        try:
            vwap = VolumeWeightedAveragePrice(high, low, close, volume)
            result["vwap"] = round(float(vwap.volume_weighted_average_price().iloc[-1]), 2)
        except Exception:
            result["vwap"] = round(float(close.iloc[-1]), 2)

        # Volume stats
        result["volume"] = float(volume.iloc[-1]) if not volume.empty else 0
        result["avg_volume"] = round(float(volume.tail(20).mean()), 0) if len(volume) >= 20 else result["volume"]
        result["volume_ratio"] = round(result["volume"] / result["avg_volume"], 2) if result["avg_volume"] > 0 else 1.0
        result["high_volume"] = result["volume_ratio"] >= 1.2

        # Current price
        result["current_price"] = round(float(close.iloc[-1]), 2)
        result["prev_close"] = round(float(close.iloc[-2]), 2) if len(close) > 1 else result["current_price"]

        # 52-week high/low from available data
        result["high_52w"] = round(float(high.max()), 2)
        result["low_52w"] = round(float(low.min()), 2)

        # Support / Resistance (simple pivot-based)
        recent_high = float(high.tail(20).max())
        recent_low = float(low.tail(20).min())
        pivot = (recent_high + recent_low + result["current_price"]) / 3
        result["support_1"] = round(2 * pivot - recent_high, 2)
        result["resistance_1"] = round(2 * pivot - recent_low, 2)
        result["pivot"] = round(pivot, 2)

    except Exception as e:
        logger.warning(f"Indicator computation error: {e}")

    return result


def detect_ema_crossover(df: pd.DataFrame, fast: int = 9, slow: int = 21) -> str:
    """Detect EMA crossover signal: 'bullish_crossover', 'bearish_crossover', or 'none'."""
    if df.empty or len(df) < slow + 2:
        return "none"

    close = df["Close"].squeeze()
    ema_fast = EMAIndicator(close, window=fast).ema_indicator()
    ema_slow = EMAIndicator(close, window=slow).ema_indicator()

    prev_diff = float(ema_fast.iloc[-2]) - float(ema_slow.iloc[-2])
    curr_diff = float(ema_fast.iloc[-1]) - float(ema_slow.iloc[-1])

    if prev_diff <= 0 and curr_diff > 0:
        return "bullish_crossover"
    elif prev_diff >= 0 and curr_diff < 0:
        return "bearish_crossover"
    return "none"


def detect_candlestick_patterns(df: pd.DataFrame) -> list[str]:
    """Detect basic candlestick patterns on the last few candles."""
    if df.empty or len(df) < 3:
        return []

    patterns = []
    o = df["Open"].squeeze()
    h = df["High"].squeeze()
    l = df["Low"].squeeze()
    c = df["Close"].squeeze()

    last_o, last_h, last_l, last_c = float(o.iloc[-1]), float(h.iloc[-1]), float(l.iloc[-1]), float(c.iloc[-1])
    prev_o, prev_c = float(o.iloc[-2]), float(c.iloc[-2])
    body = abs(last_c - last_o)
    upper_shadow = last_h - max(last_o, last_c)
    lower_shadow = min(last_o, last_c) - last_l
    total_range = last_h - last_l if last_h != last_l else 0.01

    # Doji
    if body / total_range < 0.1:
        patterns.append("doji")

    # Hammer (bullish reversal)
    if lower_shadow > 2 * body and upper_shadow < body * 0.5 and last_c > last_o:
        patterns.append("hammer")

    # Bullish Engulfing
    if prev_c < prev_o and last_c > last_o and last_c > prev_o and last_o < prev_c:
        patterns.append("bullish_engulfing")

    # Bearish Engulfing
    if prev_c > prev_o and last_c < last_o and last_c < prev_o and last_o > prev_c:
        patterns.append("bearish_engulfing")

    return patterns


def compute_entry_sl_target(indicators: dict, signal: str, category: str = "intraday") -> dict:
    """Calculate entry, stop-loss, and target based on category timeframe."""
    price = indicators.get("current_price", 0)
    atr = indicators.get("atr", price * 0.02)

    # ATR multipliers per category — intraday must be tight
    multipliers = {
        "intraday":    {"sl": 0.3, "target": 0.6},
        "fno":         {"sl": 0.5, "target": 1.0},
        "short_term":  {"sl": 1.0, "target": 2.0},
        "long_term":   {"sl": 1.5, "target": 3.0},
        "commodities": {"sl": 0.5, "target": 1.0},
    }

    m = multipliers.get(category, multipliers["short_term"])

    if signal == "BUY":
        entry  = price
        sl     = round(price - atr * m["sl"], 2)
        target = round(price + atr * m["target"], 2)
    else:  # SELL
        entry  = price
        sl     = round(price + atr * m["sl"], 2)
        target = round(price - atr * m["target"], 2)

    rr = round(abs(target - entry) / abs(sl - entry), 1) if abs(sl - entry) > 0 else 0

    return {"entry": entry, "sl": sl, "target": target, "rr_ratio": str(rr)}


def multi_confirmation_check(indicators: dict, signal: str, category: str = "intraday") -> dict:
    """Require multiple indicator confirmations before approving a signal.

    Returns confirmation score and whether signal passes the minimum threshold
    of 3 out of 4 core checks. A fifth volume check contributes to score only.
    """
    confirmations = []
    reasons = []

    ema_9 = indicators.get("ema_9", 0)
    ema_21 = indicators.get("ema_21", 0)
    rsi = indicators.get("rsi", 50)
    macd_hist = indicators.get("macd_histogram", 0)
    current_price = indicators.get("current_price", 0)
    vwap = indicators.get("vwap", current_price)
    volume = indicators.get("volume", 0)
    avg_volume = indicators.get("avg_volume", volume)

    if signal == "BUY":
        # Check 1: EMA trend
        if ema_9 > ema_21:
            confirmations.append(True)
            reasons.append("EMA9 > EMA21 (bullish trend)")
        else:
            confirmations.append(False)
            reasons.append("EMA9 < EMA21 (no bullish trend)")

        # Check 2: RSI has room to run, not overbought
        if 45 <= rsi <= 68:
            confirmations.append(True)
            reasons.append(f"RSI {rsi} in healthy buy zone")
        else:
            confirmations.append(False)
            reasons.append(f"RSI {rsi} outside buy zone (need 45-68)")

        # Check 3: Price above VWAP
        if current_price > vwap:
            confirmations.append(True)
            reasons.append("Price above VWAP (institutional bullish bias)")
        else:
            confirmations.append(False)
            reasons.append("Price below VWAP (institutional bearish bias)")

        # Check 4: MACD momentum
        if macd_hist > 0:
            confirmations.append(True)
            reasons.append("MACD histogram positive (bullish momentum)")
        else:
            confirmations.append(False)
            reasons.append("MACD histogram negative (no momentum)")

    elif signal == "SELL":
        if ema_9 < ema_21:
            confirmations.append(True)
            reasons.append("EMA9 < EMA21 (bearish trend)")
        else:
            confirmations.append(False)
            reasons.append("EMA9 > EMA21 (no bearish trend)")

        if 32 <= rsi <= 55:
            confirmations.append(True)
            reasons.append(f"RSI {rsi} in healthy sell zone")
        else:
            confirmations.append(False)
            reasons.append(f"RSI {rsi} outside sell zone (need 32-55)")

        if current_price < vwap:
            confirmations.append(True)
            reasons.append("Price below VWAP (institutional bearish bias)")
        else:
            confirmations.append(False)
            reasons.append("Price above VWAP (institutional bullish bias)")

        if macd_hist < 0:
            confirmations.append(True)
            reasons.append("MACD histogram negative (bearish momentum)")
        else:
            confirmations.append(False)
            reasons.append("MACD histogram positive (no bearish momentum)")

    else:
        # AVOID or unknown signal — skip confirmation, treat as passing
        return {"passes": True, "confirmation_score": 50, "confirmed": 0, "total": 0, "reasons": []}

    # Check 5: Volume conviction (bonus — not part of core 4)
    if avg_volume > 0 and volume >= avg_volume * 1.2:
        confirmations.append(True)
        reasons.append("Volume 20%+ above average (strong conviction)")
    else:
        confirmations.append(False)
        reasons.append("Volume below average (weak conviction)")

    confirmed_count = sum(confirmations)
    total_checks = len(confirmations)
    confirmation_score = round((confirmed_count / total_checks) * 100)

    # Minimum 3 of 4 core checks required (volume is bonus, not in threshold)
    core_confirmed = sum(confirmations[:4])
    passes = core_confirmed >= 3

    return {
        "passes": passes,
        "confirmation_score": confirmation_score,
        "confirmed": confirmed_count,
        "total": total_checks,
        "reasons": reasons,
    }


def get_signal_timestamp(market: str = "india") -> dict:
    """Returns formatted timestamp for when the signal was generated."""
    tz = pytz.timezone("Asia/Kolkata") if market == "india" else pytz.timezone("America/New_York")
    now = datetime.now(tz)
    return {
        "generated_at": now.strftime("%d %b %Y, %I:%M %p"),
        "timezone": "IST" if market == "india" else "EST",
        "timestamp_epoch": int(now.timestamp())
    }