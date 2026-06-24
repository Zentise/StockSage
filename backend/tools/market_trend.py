"""Broad market trend detection — filters individual signals against market direction."""

import logging
from backend.tools.yfinance_tools import get_historical_data
from backend.tools.indicator_tools import compute_indicators

logger = logging.getLogger(__name__)


def get_market_trend(market: str = "india") -> dict:
    """Check broad market trend before scanning individual stocks.

    Uses the Nifty 50 (India) or S&P 500 (US) as the benchmark.
    Returns trend as 'bullish', 'bearish', or 'neutral'.
    """
    ticker = "^NSEI" if market == "india" else "^GSPC"

    try:
        df = get_historical_data(ticker, period="5d", interval="15m")
        df = df.dropna()

        if df.empty or len(df) < 20:
            return {"trend": "neutral", "reason": "Insufficient market data", "rsi": 50, "ema_9": 0, "ema_21": 0}

        indicators = compute_indicators(df)
        ema_9 = indicators.get("ema_9", 0)
        ema_21 = indicators.get("ema_21", 0)
        rsi = indicators.get("rsi", 50)

        if ema_9 > ema_21 and rsi > 50:
            trend = "bullish"
            reason = f"Market EMA9 ({ema_9:.0f}) > EMA21 ({ema_21:.0f}), RSI {rsi:.1f}"
        elif ema_9 < ema_21 and rsi < 50:
            trend = "bearish"
            reason = f"Market EMA9 ({ema_9:.0f}) < EMA21 ({ema_21:.0f}), RSI {rsi:.1f}"
        else:
            trend = "neutral"
            reason = f"Mixed signals — EMA9 {ema_9:.0f} vs EMA21 {ema_21:.0f}, RSI {rsi:.1f}"

        return {"trend": trend, "reason": reason, "rsi": rsi, "ema_9": ema_9, "ema_21": ema_21}

    except Exception as e:
        logger.warning(f"Market trend check failed for {market}: {e}")
        return {"trend": "neutral", "reason": f"Market trend check failed: {e}", "rsi": 50, "ema_9": 0, "ema_21": 0}


def should_take_signal(signal: str, market_trend: str) -> bool:
    """Filter signals against broad market direction.

    In a bullish market: skip SELL signals (don't short a rising market).
    In a bearish market: skip BUY signals (don't buy into a falling market).
    Neutral market: allow both directions with lower confidence.
    AVOID signals are always allowed through (informational, not directional).
    """
    if signal == "AVOID":
        return True
    if market_trend == "bullish" and signal == "SELL":
        return False
    if market_trend == "bearish" and signal == "BUY":
        return False
    return True
