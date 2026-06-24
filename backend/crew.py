"""CrewAI pipeline — orchestrates all agents for stock analysis.
Falls back to the Groq SDK when CrewAI is not installed (e.g. on Windows
where the transitive uvloop dependency cannot be built)."""

import os
import json
import logging

# --- optional CrewAI import (fails on Windows due to uvloop) ---
try:
    from crewai import Crew, Task, LLM
    from backend.agents.signal_generator import create_signal_generator
    CREWAI_AVAILABLE = True
except Exception:          # ImportError / ModuleNotFoundError
    CREWAI_AVAILABLE = False

# Groq SDK – always available, used as fallback
from groq import Groq

from backend.tools.market_scanner import scan_market, scan_commodities
from backend.tools.indicator_tools import (
    compute_indicators, compute_entry_sl_target, detect_ema_crossover,
    detect_candlestick_patterns, get_signal_timestamp, multi_confirmation_check,
)
from backend.tools.yfinance_tools import get_historical_data, get_stock_info, get_stock_news, fetch_ohlcv
from backend.tools.sentiment_tools import score_sentiment_simple
from backend.tools.market_trend import get_market_trend, should_take_signal
from backend.data.nse_stocks import TICKER_NAME_MAP as NSE_NAMES
from backend.data.nyse_stocks import TICKER_NAME_MAP as US_NAMES, COMMODITY_NAME_MAP
from backend.market_hours import is_market_open

logger = logging.getLogger(__name__)

GROQ_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct"


def _groq_client() -> Groq:
    return Groq(api_key=os.getenv("GROQ_API_KEY", ""))


def get_llm():
    if not CREWAI_AVAILABLE:
        return None
    return LLM(
        model=f"groq/{GROQ_MODEL}",
        api_key=os.getenv("GROQ_API_KEY", ""),
        temperature=0.3,
    )


def get_name(ticker: str, market: str) -> str:
    if market == "india":
        return NSE_NAMES.get(ticker, ticker)
    name = US_NAMES.get(ticker, COMMODITY_NAME_MAP.get(ticker, ticker))
    return name


def categorize_signal(ticker: str, indicators: dict, market: str) -> tuple[str, str]:
    """Determine category and timeframe for a signal."""
    rsi = indicators.get("rsi", 50)
    ema_9 = indicators.get("ema_9", 0)
    ema_21 = indicators.get("ema_21", 0)
    ema_50 = indicators.get("ema_50", 0)
    price = indicators.get("current_price", 0)
    atr = indicators.get("atr", 0)

    if not price:
        return "short_term", "1-2 Weeks"

    atr_pct = (atr / price) if atr else 0

    # Intraday: only when the market is currently tradable.
    if atr_pct > 0.03 and is_market_open(market):
        return "intraday", "Today"

    # Long-term: all EMAs aligned in a sustained trend, moderate RSI
    if ema_50 and ema_9 and ema_21:
        if (price > ema_9 > ema_21 > ema_50) or (price < ema_9 < ema_21 < ema_50):
            return "long_term", "3-6 Months"

    # Short-term: swing / positional trades
    return "short_term", "1-2 Weeks"


def validate_signal_levels(signal: dict) -> dict:
    """Sanity-check SL and Target: ensure they are realistic and on the correct side.

    Corrects bad values produced by the data pipeline or LLM hallucinations.
    """
    entry = signal.get("entry", 0)
    sl = signal.get("sl", 0)
    target = signal.get("target", 0)
    direction = signal.get("signal", "BUY")
    category = signal.get("category", "intraday")

    if not entry:
        return signal

    # Max % move allowed per category
    max_moves = {
        "intraday":    {"sl": 0.008, "target": 0.016},
        "fno":         {"sl": 0.012, "target": 0.025},
        "short_term":  {"sl": 0.04,  "target": 0.08},
        "long_term":   {"sl": 0.08,  "target": 0.30},
        "commodities": {"sl": 0.015, "target": 0.03},
    }
    limits = max_moves.get(category, max_moves["short_term"])

    if direction == "BUY":
        if sl >= entry:
            sl = round(entry * (1 - limits["sl"] * 0.6), 2)
        if target <= entry:
            target = round(entry * (1 + limits["target"] * 0.6), 2)
        if entry and (entry - sl) / entry > limits["sl"]:
            sl = round(entry * (1 - limits["sl"]), 2)
        if entry and (target - entry) / entry > limits["target"]:
            target = round(entry * (1 + limits["target"]), 2)
    elif direction == "SELL":
        if sl <= entry:
            sl = round(entry * (1 + limits["sl"] * 0.6), 2)
        if target >= entry:
            target = round(entry * (1 - limits["target"] * 0.6), 2)
        if entry and (sl - entry) / entry > limits["sl"]:
            sl = round(entry * (1 + limits["sl"]), 2)
        if entry and (entry - target) / entry > limits["target"]:
            target = round(entry * (1 - limits["target"]), 2)

    sl_dist = abs(entry - sl)
    target_dist = abs(target - entry)
    rr = round(target_dist / sl_dist, 1) if sl_dist > 0 else 0

    signal["sl"] = sl
    signal["target"] = target
    signal["rr_ratio"] = str(rr)
    return signal


def build_signal_from_data(ticker: str, market: str) -> dict | None:
    """Build a trading signal using pure data analysis (no LLM needed for data processing)."""
    try:
        # Pass 1: daily data for category determination (fast, cached)
        df_daily = get_historical_data(ticker, period="3mo", interval="1d")
        if df_daily.empty or len(df_daily) < 20:
            return None

        indicators_init = compute_indicators(df_daily)
        if not indicators_init:
            return None

        # Determine category using daily indicators and market-open status
        category, timeframe = categorize_signal(ticker, indicators_init, market)

        # Pass 2: fetch category-appropriate candles for accurate signal computation
        df = fetch_ohlcv(ticker, category)
        if df.empty or len(df) < 20:
            df = df_daily
            indicators = indicators_init
        else:
            indicators = compute_indicators(df)
            if not indicators:
                indicators = indicators_init

        # Determine signal direction
        rsi = indicators.get("rsi", 50)
        macd_hist = indicators.get("macd_histogram", 0)
        ema_9 = indicators.get("ema_9", 0)
        ema_21 = indicators.get("ema_21", 0)
        price = indicators.get("current_price", 0)

        bullish_score = 0
        bearish_score = 0
        strategies = []

        # EMA crossover
        cross = detect_ema_crossover(df)
        if cross == "bullish_crossover":
            bullish_score += 3
            strategies.append("EMA 9/21 Crossover")
        elif cross == "bearish_crossover":
            bearish_score += 3
            strategies.append("EMA 9/21 Crossover (Bearish)")

        # EMA trend
        if ema_9 > ema_21:
            bullish_score += 1
        else:
            bearish_score += 1

        # RSI
        if rsi < 30:
            bullish_score += 2
            strategies.append("Oversold RSI")
        elif rsi > 70:
            bearish_score += 2
            strategies.append("Overbought RSI")

        # MACD
        if macd_hist > 0:
            bullish_score += 1
            strategies.append("MACD Positive")
        elif macd_hist < 0:
            bearish_score += 1
            strategies.append("MACD Negative")

        # VWAP
        vwap = indicators.get("vwap", 0)
        if price > vwap:
            bullish_score += 1
            strategies.append("Above VWAP")
        elif price < vwap:
            bearish_score += 1

        # Candlestick patterns
        patterns = detect_candlestick_patterns(df)
        for p in patterns:
            if p in ("hammer", "bullish_engulfing"):
                bullish_score += 2
                strategies.append(p.replace("_", " ").title())
            elif p in ("bearish_engulfing",):
                bearish_score += 2
                strategies.append(p.replace("_", " ").title())

        signal = "BUY" if bullish_score >= bearish_score else "SELL"
        confidence = min(95, max(30, (max(bullish_score, bearish_score) * 12) + 20))

        # category and timeframe already determined in two-pass fetch above

        levels = compute_entry_sl_target(indicators, signal, category=category)

        # In delivery-based categories (short_term, long_term) you can't short-sell.
        # Convert SELL to AVOID so users know to stay out, not to short.
        if signal == "SELL" and category in ("short_term", "long_term"):
            signal = "AVOID"

        # News sentiment
        news = get_stock_news(ticker)
        headlines = [n.get("title", "") for n in news]
        sentiment_score = score_sentiment_simple(headlines)
        sentiment_label = "positive" if sentiment_score > 0.1 else ("negative" if sentiment_score < -0.1 else "neutral")
        top_headline = headlines[0] if headlines else "No recent news"

        strategy_str = " + ".join(strategies[:3]) if strategies else "Trend Following"

        raw_signal = {
            "ticker": ticker,
            "name": get_name(ticker, market),
            "category": category,
            "signal": signal,
            "entry": levels["entry"],
            "sl": levels["sl"],
            "target": levels["target"],
            "rr_ratio": levels["rr_ratio"],
            "confidence": confidence,
            "strategy": strategy_str,
            "reasoning": "",
            "sentiment": sentiment_label,
            "sentiment_score": sentiment_score,
            "top_headline": top_headline,
            "timeframe": timeframe,
            "indicators": indicators,
            **get_signal_timestamp(market),
        }
        return validate_signal_levels(raw_signal)
    except Exception as e:
        logger.error(f"Failed to build signal for {ticker}: {e}")
        return None


def _build_reasoning_prompt(signal_data: dict, ticker: str, fund_summary: str) -> str:
    return (
        f"You are a senior trading desk analyst. Generate a 2-3 sentence professional "
        f"trading explanation for this signal:\n"
        f"Stock: {signal_data['name']} ({ticker})\n"
        f"Signal: {signal_data['signal']}\n"
        f"Entry: {signal_data['entry']}, SL: {signal_data['sl']}, Target: {signal_data['target']}\n"
        f"Strategy: {signal_data['strategy']}\n"
        f"RSI: {signal_data['indicators'].get('rsi')}, "
        f"MACD Hist: {signal_data['indicators'].get('macd_histogram')}\n"
        f"Sentiment: {signal_data['sentiment']} ({signal_data['top_headline']})\n"
        f"Fundamentals: {fund_summary}\n\n"
        f"Respond with ONLY the 2-3 sentence reasoning, nothing else."
    )


def _get_reasoning_groq(prompt: str) -> str:
    """Get reasoning via the Groq SDK directly (Windows-friendly)."""
    client = _groq_client()
    resp = client.chat.completions.create(
        model=GROQ_MODEL,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.3,
        max_tokens=256,
    )
    return resp.choices[0].message.content.strip()


def _get_reasoning_crewai(prompt: str):
    """Get reasoning via CrewAI (Linux/Mac)."""
    llm = get_llm()
    signal_agent = create_signal_generator(llm)
    reasoning_task = Task(
        description=prompt,
        expected_output="A 2-3 sentence professional trading reasoning.",
        agent=signal_agent,
    )
    crew = Crew(agents=[signal_agent], tasks=[reasoning_task], verbose=False)
    return str(crew.kickoff()).strip()


def run_crew_analysis(ticker: str, market: str = "india") -> dict | None:
    """Run the full analysis pipeline for a single stock."""
    signal_data = build_signal_from_data(ticker, market)
    if not signal_data:
        return None

    try:
        stock_info = get_stock_info(ticker)
        fund_summary = (
            f"PE: {stock_info.get('pe_ratio', 'N/A')}, "
            f"EPS: {stock_info.get('eps', 'N/A')}, "
            f"D/E: {stock_info.get('debt_to_equity', 'N/A')}, "
            f"Margin: {stock_info.get('profit_margin', 'N/A')}"
        )

        prompt = _build_reasoning_prompt(signal_data, ticker, fund_summary)

        if CREWAI_AVAILABLE:
            reasoning = _get_reasoning_crewai(prompt)
        else:
            reasoning = _get_reasoning_groq(prompt)

        signal_data["reasoning"] = reasoning
        signal_data.pop("indicators", None)
        signal_data.pop("sentiment_score", None)
        return signal_data

    except Exception as e:
        logger.error(f"Analysis failed for {ticker}: {e}")
        signal_data["reasoning"] = f"{signal_data['signal']} signal based on {signal_data['strategy']}."
        signal_data.pop("indicators", None)
        signal_data.pop("sentiment_score", None)
        return signal_data


def run_full_scan(market: str = "india") -> list[dict]:
    """Run a full market scan and generate signals for top candidates.

    Applies three quality gates before accepting a signal:
    1. Multi-confirmation: ≥3 of 4 core technical checks must agree.
    2. Market-trend filter (intraday/F&O only): no contra-trend trades.
    3. Confidence threshold: ≥70% required; relaxed to 60% per category if
       fewer than 3 signals would survive otherwise.
    """
    logger.info(f"Starting full market scan for {market}")
    candidates = scan_market(market)

    # Fetch broad market trend once for the whole scan
    market_trend_data = get_market_trend(market)
    market_trend = market_trend_data["trend"]
    logger.info(f"Market trend for {market}: {market_trend} — {market_trend_data.get('reason', '')}")

    # First pass: build all raw signals (with indicators still attached)
    raw_signals = []
    for candidate in candidates:
        ticker = candidate["ticker"]
        signal = build_signal_from_data(ticker, market)
        if signal:
            signal["reasoning"] = f"{signal['signal']} signal based on {signal['strategy']}."
            raw_signals.append(signal)

    # Apply filters; keep rejected-only-by-confidence signals separately per category
    HIGH_CONF = 70
    LOW_CONF = 60
    accepted: list[dict] = []
    fallback_by_cat: dict[str, list[dict]] = {}

    for signal in raw_signals:
        indicators = signal.get("indicators", {})
        sig_type = signal.get("signal", "BUY")
        sig_cat = signal.get("category", "short_term")

        # Multi-confirmation gate
        confirmation = multi_confirmation_check(indicators, sig_type, sig_cat)
        if not confirmation["passes"]:
            continue

        # Market trend gate (intraday and F&O only)
        if sig_cat in ("intraday", "fno"):
            if not should_take_signal(sig_type, market_trend):
                continue

        # Confidence gate
        conf = signal.get("confidence", 0)
        signal["confirmation_score"] = confirmation["confirmation_score"]
        signal["confirmation_reasons"] = confirmation["reasons"]
        signal["market_trend"] = market_trend

        if conf >= HIGH_CONF:
            accepted.append(signal)
        elif conf >= LOW_CONF:
            fallback_by_cat.setdefault(sig_cat, []).append(signal)

    # Count accepted per category; fill up to 3 from fallback if needed
    accepted_by_cat: dict[str, int] = {}
    for s in accepted:
        cat = s.get("category", "short_term")
        accepted_by_cat[cat] = accepted_by_cat.get(cat, 0) + 1

    for cat, fallbacks in fallback_by_cat.items():
        needed = max(0, 3 - accepted_by_cat.get(cat, 0))
        accepted.extend(fallbacks[:needed])

    # Strip internal fields, sort and return
    signal_priority = {"BUY": 0, "SELL": 1, "AVOID": 2}
    for s in accepted:
        s.pop("indicators", None)
        s.pop("sentiment_score", None)

    accepted.sort(key=lambda s: (signal_priority.get(s.get("signal"), 3), -s.get("confidence", 0)))

    logger.info(f"Scan complete: {len(accepted)} high-quality signals (market: {market_trend})")
    return accepted


async def run_full_scan_with_reasoning(market: str = "india") -> list[dict]:
    """Run full scan with LLM reasoning (slower, for scheduled runs)."""
    candidates = scan_market(market)
    signals = []

    for candidate in candidates[:10]:  # Limit to avoid rate limits
        ticker = candidate["ticker"]
        signal = run_crew_analysis(ticker, market)
        if signal:
            signals.append(signal)

    return signals
