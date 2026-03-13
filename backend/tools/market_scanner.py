"""Market scanner — scans stock universe for trading candidates using bulk downloads."""

import logging
from backend.tools.yfinance_tools import get_historical_data, get_volume_data, bulk_download
from backend.tools.indicator_tools import compute_indicators, detect_ema_crossover
from backend.data.nse_stocks import ALL_NSE
from backend.data.nyse_stocks import ALL_US, COMMODITIES

logger = logging.getLogger(__name__)


def scan_stock(ticker: str, df=None) -> dict | None:
    """Scan a single stock for trading opportunity signals."""
    try:
        if df is None:
            df = get_historical_data(ticker, period="3mo", interval="1d")
        if df.empty or len(df) < 20:
            return None

        indicators = compute_indicators(df)
        if not indicators:
            return None

        vol_data = get_volume_data(ticker, df=df)
        volume_ratio = vol_data.get("volume_ratio", 0)

        score = 0
        reasons = []

        # Volume spike
        if volume_ratio >= 2.0:
            score += 3
            reasons.append("high_volume")
        elif volume_ratio >= 1.5:
            score += 2
            reasons.append("above_avg_volume")
        elif volume_ratio >= 1.0:
            score += 1

        # RSI conditions
        rsi = indicators.get("rsi", 50)
        if rsi < 30:
            score += 3
            reasons.append("oversold_rsi")
        elif rsi > 70:
            score += 3
            reasons.append("overbought_rsi")
        elif rsi < 40:
            score += 1
            reasons.append("rsi_approaching_oversold")
        elif rsi > 60:
            score += 1
            reasons.append("rsi_approaching_overbought")

        # EMA crossover
        cross = detect_ema_crossover(df)
        if cross == "bullish_crossover":
            score += 3
            reasons.append("ema_bullish_crossover")
        elif cross == "bearish_crossover":
            score += 3
            reasons.append("ema_bearish_crossover")

        # EMA trend alignment
        ema_9 = indicators.get("ema_9", 0)
        ema_21 = indicators.get("ema_21", 0)
        price = indicators.get("current_price", 0)
        if ema_9 and ema_21 and price:
            if price > ema_9 > ema_21:
                score += 1
                reasons.append("bullish_trend")
            elif price < ema_9 < ema_21:
                score += 1
                reasons.append("bearish_trend")

        # MACD histogram
        macd_hist = indicators.get("macd_histogram", 0)
        if macd_hist > 0:
            score += 1
            reasons.append("macd_positive")
        elif macd_hist < 0:
            score += 1
            reasons.append("macd_negative")

        # Near support / resistance
        support = indicators.get("support_1", 0)
        resistance = indicators.get("resistance_1", 0)

        if price and support and abs(price - support) / price < 0.03:
            score += 2
            reasons.append("near_support")
        if price and resistance and abs(price - resistance) / price < 0.03:
            score += 2
            reasons.append("near_resistance")

        # Bollinger Band squeeze or touch
        bb_upper = indicators.get("bb_upper", 0)
        bb_lower = indicators.get("bb_lower", 0)
        if price and bb_lower and price <= bb_lower * 1.01:
            score += 2
            reasons.append("at_bb_lower")
        elif price and bb_upper and price >= bb_upper * 0.99:
            score += 2
            reasons.append("at_bb_upper")

        if score < 2:
            return None

        return {
            "ticker": ticker,
            "score": score,
            "reasons": reasons,
            "indicators": indicators,
            "volume_ratio": volume_ratio,
        }
    except Exception as e:
        logger.warning(f"Scan failed for {ticker}: {e}")
        return None


def scan_market(market: str = "india", max_results: int = 15) -> list[dict]:
    """Scan full market universe using efficient bulk download."""
    tickers = ALL_NSE if market == "india" else ALL_US

    logger.info(f"Bulk downloading {len(tickers)} tickers for {market} scan...")
    data = bulk_download(tickers, period="3mo")
    logger.info(f"Got data for {len(data)}/{len(tickers)} tickers")

    candidates = []
    for ticker in tickers:
        df = data.get(ticker)
        if df is None:
            continue
        result = scan_stock(ticker, df=df)
        if result:
            candidates.append(result)

    candidates.sort(key=lambda x: x["score"], reverse=True)
    return candidates[:max_results]


def scan_commodities() -> list[dict]:
    """Scan commodity tickers using bulk download."""
    data = bulk_download(COMMODITIES, period="3mo")
    candidates = []
    for ticker in COMMODITIES:
        df = data.get(ticker)
        if df is None:
            continue
        result = scan_stock(ticker, df=df)
        if result:
            candidates.append(result)
    candidates.sort(key=lambda x: x["score"], reverse=True)
    return candidates
