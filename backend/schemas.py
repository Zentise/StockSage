"""The API contract. The frontend's types are generated from these (npm run gen:api)."""

from datetime import UTC, datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, PlainSerializer

Market = Literal["india", "us"]
# Stored naive in UTC; always sent with an explicit Z so browsers don't read it as local time.
def _utc(d: datetime) -> str:
    return (d.astimezone(UTC).replace(tzinfo=None) if d.tzinfo else d).isoformat() + "Z"


UTCTime = Annotated[datetime, PlainSerializer(_utc, return_type=str)]


class Evidence(BaseModel):
    text: str
    weight: int


class SignalOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    engine: str
    market: str
    ticker: str
    name: str
    direction: Literal["BUY", "SELL", "AVOID"]
    category: Literal["intraday", "short_term", "long_term"]
    timeframe: str
    entry: float
    stop: float | None
    target: float | None
    evidence_for: list[Evidence]
    evidence_against: list[Evidence]
    pending: bool
    created_at: UTCTime
    expires_at: UTCTime
    status: str
    fill_price: float | None
    exit_price: float | None
    exit_at: UTCTime | None
    r: float | None
    best_r: float | None
    worst_r: float | None
    control_r: float | None


class Quote(BaseModel):
    ticker: str
    name: str
    price: float
    prev_close: float
    change_abs: float
    change_pct: float
    day_high: float | None = None
    day_low: float | None = None
    high_52w: float | None = None
    low_52w: float | None = None
    volume: float = 0
    as_of: int
    spark: list[float] = []


class LiveSignal(SignalOut):
    quote: Quote | None = None


class Status(BaseModel):
    market: str
    open: bool
    reason: str
    session_date: str
    opens_at: str
    closes_at: str | None
    calendar_ok: bool
    last_scan: str | None
    scanning: bool
    ai_enabled: bool


class Constituent(BaseModel):
    ticker: str
    name: str
    sector: str
    price: float
    change_pct: float
    spark: list[float]
    turnover: float


class Sector(BaseModel):
    name: str
    change_pct: float
    advancing: int
    total: int


class MarketOut(BaseModel):
    market: str
    as_of: int
    indices: list[Quote]
    stocks: list[Constituent]
    sectors: list[Sector]
    advancing: int
    declining: int
    missing: list[str]


class SignalsOut(BaseModel):
    market: str
    active: list[LiveSignal]
    recent: list[SignalOut]


class ScanOut(BaseModel):
    started: bool
    message: str


class Candle(BaseModel):
    time: int
    open: float
    high: float
    low: float
    close: float
    volume: float


class CandlesOut(BaseModel):
    ticker: str
    timeframe: str
    intraday: bool
    candles: list[Candle]


class Fundamentals(BaseModel):
    market_cap: float | None = None
    pe: float | None = None
    forward_pe: float | None = None
    pb: float | None = None
    eps: float | None = None
    roe: float | None = None
    profit_margin: float | None = None
    debt_to_equity: float | None = None
    revenue_growth: float | None = None
    earnings_growth: float | None = None
    dividend_yield: float | None = None
    beta: float | None = None
    insider_holding: float | None = None
    sector: str | None = None
    industry: str | None = None
    summary: str | None = None
    earnings_date: str | None = None


class Technicals(BaseModel):
    price: float | None = None
    ema_9: float | None = None
    ema_21: float | None = None
    ema_50: float | None = None
    ema_200: float | None = None
    rsi: float | None = None
    macd_hist: float | None = None
    bb_upper: float | None = None
    bb_lower: float | None = None
    atr: float | None = None
    vwma: float | None = None
    volume_ratio: float | None = None
    support: float | None = None
    resistance: float | None = None
    return_20d: float | None = None


class StockOut(BaseModel):
    ticker: str
    name: str
    market: str
    sector: str | None
    quote: Quote | None
    technicals: Technicals
    bullish: list[Evidence]
    bearish: list[Evidence]
    suggested_stop: float | None
    suggested_target: float | None
    signal: SignalOut | None
    history: list[SignalOut]


class NewsItem(BaseModel):
    title: str
    source: str
    url: str
    published: str | None


class NewsOut(BaseModel):
    items: list[NewsItem]


class NoteOut(BaseModel):
    summary: str
    bull: list[str]
    bear: list[str]
    watch: list[str]
    missing: list[str]
    removed: int
    model: str
    cached: bool
    created_at: str


class OddsOut(BaseModel):
    paths: int
    days: int
    history_bars: int
    p_target: float
    p_stop: float
    p_neither: float
    avg_r: float
    median_days_to_exit: int
    prices: list[float]
    density: list[list[float]]
    bands: list[list[float]]


class Bucket(BaseModel):
    n: int
    target: int
    stop: int
    other: int
    avg_r: float | None
    paired_n: int
    paired_r: float | None
    control_r: float | None
    edge_r: float | None
    edge_low: float | None
    edge_high: float | None


class CurvePoint(BaseModel):
    at: str
    ticker: str
    r: float
    total: float
    control: float


class RecordOut(BaseModel):
    market: str
    engine: str
    since: UTCTime | None
    active: int
    void: int
    overall: Bucket
    by_category: dict[str, Bucket]
    curve: list[CurvePoint]
    trades: list[SignalOut]


class SearchItem(BaseModel):
    ticker: str
    name: str
    sector: str
    market: str


class ReplaySummary(BaseModel):
    n: int
    target: int = 0
    stop: int = 0
    avg_r: float | None = None
    avg_r_net: float | None = None
    control_r: float | None = None
    edge_r: float | None = None
    edge_low: float | None = None
    edge_high: float | None = None


class ReplayOut(BaseModel):
    market: str
    ran: str
    stocks: int
    start: str
    end: str
    overall: ReplaySummary
    by_category: dict[str, ReplaySummary]
    by_year: dict[str, ReplaySummary]
