"""Turn indicator facts into a setup: direction, levels, and the evidence on both sides.

Rules that v1 broke and this module guarantees (see tests/test_signals.py):
  * a reason listed for a signal always points the same way as the signal;
  * a tie is not a signal;
  * AVOID never carries trade levels;
  * the stop sits outside ordinary noise for the holding period.
"""

from dataclasses import asdict, dataclass, field

import pandas as pd

from backend.engine import indicators as ind

# category: (ATR multiple for stop, min stop %, max stop %, sessions to live, label)
RULES = {
    "intraday": (1.5, 0.006, 0.015, 0, "Today"),
    "short_term": (1.5, 0.010, 0.060, 10, "Up to 2 weeks"),
    "long_term": (2.5, 0.020, 0.120, 60, "Up to 12 weeks"),
}
REWARD = 2.0
MIN_WEIGHT = 4   # total weight the winning side needs
MIN_CORE = 3     # of trend, momentum, RSI zone, price vs average volume-weighted price
CAUTION_SESSIONS = 5


@dataclass
class Evidence:
    text: str
    weight: int


@dataclass
class Setup:
    ticker: str
    direction: str                 # BUY | SELL | AVOID
    category: str                  # intraday | short_term | long_term
    timeframe: str
    entry: float
    stop: float | None
    target: float | None
    evidence_for: list[Evidence] = field(default_factory=list)
    evidence_against: list[Evidence] = field(default_factory=list)
    setup: str = "confluence"       # which strategy produced it

    def to_dict(self) -> dict:
        return asdict(self)


def collect(x: dict) -> tuple[list[Evidence], list[Evidence]]:
    """All bullish and bearish evidence present in one set of indicators."""
    bull: list[Evidence] = []
    bear: list[Evidence] = []
    if x["ema_9"] and x["ema_21"]:
        if x["ema_cross"] == "up":
            bull.append(Evidence("9-day average just crossed above the 21-day", 3))
        elif x["ema_cross"] == "down":
            bear.append(Evidence("9-day average just crossed below the 21-day", 3))
        if x["ema_9"] > x["ema_21"]:
            bull.append(Evidence("Short-term trend is up", 1))
        elif x["ema_9"] < x["ema_21"]:
            bear.append(Evidence("Short-term trend is down", 1))
    if x["macd_hist"]:
        (bull if x["macd_hist"] > 0 else bear).append(
            Evidence("Momentum (MACD) is " + ("rising" if x["macd_hist"] > 0 else "falling"), 1))
    if x["vwma"] and x["price"] != x["vwma"]:
        above = x["price"] > x["vwma"]
        (bull if above else bear).append(
            Evidence(f"Price is {'above' if above else 'below'} where most volume traded (14 bars)", 1))
    if x["pattern"] == "bullish_engulfing":
        bull.append(Evidence("Bullish engulfing candle", 2))
    elif x["pattern"] == "hammer":
        bull.append(Evidence("Hammer candle", 2))
    elif x["pattern"] == "bearish_engulfing":
        bear.append(Evidence("Bearish engulfing candle", 2))
    if x["price"] > x["resistance"]:
        bull.append(Evidence("Closed above its 20-bar high", 2))
    elif x["price"] < x["support"]:
        bear.append(Evidence("Closed below its 20-bar low", 2))
    if x["volume_ratio"] and x["volume_ratio"] >= 1.5:
        # Volume confirms whichever way the bar went; the caller cannot count it twice.
        up = x.get("bar_up", True)
        (bull if up else bear).append(Evidence(f"Volume {x['volume_ratio']:.1f}x normal", 1))
    if x["rsi"] is not None:
        if x["rsi"] >= 70:
            bear.append(Evidence(f"Overbought (RSI {x['rsi']:.0f})", 1))
        elif x["rsi"] <= 30:
            bull.append(Evidence(f"Oversold (RSI {x['rsi']:.0f})", 1))
    return bull, bear


def core_checks(x: dict, up: bool) -> int:
    s = 1 if up else -1
    zone = (45, 70) if up else (30, 55)
    return sum([
        bool(x["ema_9"] and x["ema_21"] and s * (x["ema_9"] - x["ema_21"]) > 0),
        bool(x["macd_hist"] and s * x["macd_hist"] > 0),
        bool(x["vwma"] and s * (x["price"] - x["vwma"]) > 0),
        bool(x["rsi"] is not None and zone[0] <= x["rsi"] <= zone[1]),
    ])


def levels(price: float, atr: float, category: str, up: bool) -> tuple[float, float]:
    mult, lo, hi, _, _ = RULES[category]
    risk = price * min(max(atr * mult / price, lo), hi)
    s = 1 if up else -1
    return round(price - s * risk, 2), round(price + s * risk * REWARD, 2)


def categorize(x: dict, up: bool) -> str:
    s = 1 if up else -1
    if not x["ema_50"]:
        return "short_term"
    ladder = (x["price"], x["ema_9"], x["ema_21"], x["ema_50"])
    aligned = all(s * (a - b) > 0 for a, b in zip(ladder, ladder[1:]))
    return "long_term" if aligned else "short_term"


def _facts(df: pd.DataFrame, fraction: float) -> dict:
    x = ind.compute(df, fraction)
    if x:
        x["bar_up"] = bool(df["Close"].iloc[-1] >= df["Open"].iloc[-1])
    return x


def evaluate(ticker: str, daily: pd.DataFrame, volume_fraction: float = 1.0) -> Setup | None:
    """Swing / position setup from daily bars, or None when nothing qualifies."""
    x = _facts(daily, volume_fraction)
    if not x or not x["atr"] or not x["price"]:
        return None
    return _decide(ticker, x, None)


def evaluate_intraday(ticker: str, bars15: pd.DataFrame, index_up: bool | None) -> Setup | None:
    """Same-day setup from 15-minute bars. Trades only with the index, when it has a direction."""
    x = _facts(bars15, 1.0)
    if not x or not x["atr"] or not x["price"]:
        return None
    s = _decide(ticker, x, "intraday")
    if s and index_up is not None and (s.direction == "BUY") != index_up:
        return None
    return s


def _decide(ticker: str, x: dict, category: str | None) -> Setup | None:
    bull, bear = collect(x)
    wb, ws = sum(e.weight for e in bull), sum(e.weight for e in bear)
    if wb == ws:
        return None
    up = wb > ws
    mine, other = (bull, bear) if up else (bear, bull)
    if max(wb, ws) < MIN_WEIGHT or core_checks(x, up) < MIN_CORE:
        return None
    cat = category or categorize(x, up)
    # Delivery trades cannot be shorted in the cash market, so bearish means stay out.
    direction = "BUY" if up else ("SELL" if cat == "intraday" else "AVOID")
    stop = target = None
    if direction != "AVOID":
        stop, target = levels(x["price"], x["atr"], cat, up)
    mine.sort(key=lambda e: -e.weight)
    other.sort(key=lambda e: -e.weight)
    return Setup(ticker, direction, cat, RULES[cat][4] if direction != "AVOID" else "Next 5 sessions",
                 round(x["price"], 2), stop, target, mine, other)
