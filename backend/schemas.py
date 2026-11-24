"""The API contract. The frontend's types are generated from these (npm run gen:api)."""

from datetime import UTC, datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, PlainSerializer, model_validator

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
    setup: str = "confluence"
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
    owner_required: bool = False


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


class SetupRecord(BaseModel):
    label: str
    active: int
    validated: bool
    replay: "ReplaySummary | None" = None
    live: Bucket


class RecordOut(BaseModel):
    market: str
    engine: str
    since: UTCTime | None
    active: int
    void: int
    overall: Bucket
    by_category: dict[str, Bucket]
    by_setup: dict[str, SetupRecord]
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
    edge_first_half: float | None = None
    edge_second_half: float | None = None


class SetupReplay(ReplaySummary):
    label: str
    validated: bool
    by_year: dict[str, ReplaySummary] = {}


class SetupInfo(BaseModel):
    key: str
    label: str
    blurb: str
    validated: bool
    replay: ReplaySummary | None = None


class ReplayOut(BaseModel):
    market: str
    ran: str
    stocks: int
    start: str
    end: str
    overall: ReplaySummary
    by_category: dict[str, ReplaySummary]
    by_year: dict[str, ReplaySummary]
    by_setup: dict[str, SetupReplay] = {}


# ------------------------------------------------------------ owner: journal, alerts, brief, AI

Ticker = Annotated[str, Field(pattern=r"^[A-Z0-9^&.=\-]{1,20}$")]


class PositionIn(BaseModel):
    ticker: Ticker
    qty: float = Field(gt=0, le=1e9)
    entry: float = Field(gt=0)
    stop: float | None = Field(default=None, gt=0)
    target: float | None = Field(default=None, gt=0)
    paper: bool = True
    why: str = Field(default="", max_length=600)
    signal_id: int | None = None
    setup: str | None = Field(default=None, max_length=16)

    @model_validator(mode="after")
    def _levels(self):
        if self.stop is not None and self.stop >= self.entry:
            raise ValueError("The stop must be below the entry (this journal tracks buys).")
        if self.target is not None and self.target <= self.entry:
            raise ValueError("The target must be above the entry.")
        return self


class PositionOut(BaseModel):
    id: int
    market: str
    ticker: str
    name: str
    paper: bool
    qty: float
    entry: float
    stop: float | None
    target: float | None
    opened_at: UTCTime
    setup: str | None
    why: str
    status: str
    exit_price: float | None
    closed_at: UTCTime | None
    close_reason: str | None
    lesson: str
    mistake: str | None
    price: float | None
    pnl: float | None
    pnl_pct: float | None
    r: float | None
    risk: float | None


class CloseIn(BaseModel):
    price: float = Field(gt=0)
    reason: Literal["manual", "stop", "target"] = "manual"
    lesson: str = Field(default="", max_length=600)
    mistake: str | None = Field(default=None, max_length=24)


class PositionPatch(BaseModel):
    lesson: str | None = Field(default=None, max_length=600)
    mistake: str | None = Field(default=None, max_length=24)
    stop: float | None = Field(default=None, gt=0)
    target: float | None = Field(default=None, gt=0)


class JournalStats(BaseModel):
    n: int
    with_r: int
    win_rate: float | None
    avg_r: float | None
    total_r: float | None
    avg_win_r: float | None
    avg_loss_r: float | None


class JournalPoint(BaseModel):
    at: str
    ticker: str
    r: float
    total: float


class PortfolioOut(BaseModel):
    open: list[PositionOut]
    closed: list[PositionOut]
    open_risk: float
    open_pnl: float
    stats: JournalStats
    curve: list[JournalPoint]
    by_mistake: dict[str, JournalStats]
    by_setup: dict[str, JournalStats]
    mistakes: list[str]


class AlertIn(BaseModel):
    ticker: Ticker
    kind: Literal["above", "below"]
    level: float = Field(gt=0)
    note: str = Field(default="", max_length=200)


class AlertOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    market: str
    ticker: str
    kind: str
    level: float
    note: str
    active: bool
    created_at: UTCTime
    fired_at: UTCTime | None
    fired_price: float | None


class BriefMover(BaseModel):
    ticker: str
    name: str
    price: float
    change_pct: float


class BriefSetup(BaseModel):
    ticker: str
    name: str
    setup: str
    entry: float
    stop: float | None
    target: float | None
    validated: bool
    pending: bool


class BriefPosition(BaseModel):
    ticker: str
    name: str
    qty: float
    entry: float
    stop: float | None
    target: float | None
    price: float | None
    pnl: float | None
    r: float | None
    paper: bool


class BriefAlert(BaseModel):
    ticker: str
    kind: str
    level: float


class BriefRecord(BaseModel):
    n: int
    paired_n: int
    edge_r: float | None
    edge_low: float | None
    edge_high: float | None


class BriefOut(BaseModel):
    market: str
    date: str
    status: str
    opens_at: str
    indices: list[BriefMover]
    advancing: int
    declining: int
    gainers: list[BriefMover]
    losers: list[BriefMover]
    setups: list[BriefSetup]
    positions: list[BriefPosition]
    alerts: list[BriefAlert]
    record: BriefRecord
    headlines: list[NewsItem]
    telegram: bool


class DebateSide(BaseModel):
    case: list[str]
    wrong_if: str


class DebateOut(BaseModel):
    bull: DebateSide
    bear: DebateSide
    summary: str
    agree: list[str]
    clash: list[str]
    check_first: list[str]
    removed: int
    model: str
    cached: bool
    created_at: str


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=600)


class ChatIn(BaseModel):
    ticker: Ticker | None = None
    market: Market = "india"
    messages: list[ChatMessage] = Field(min_length=1, max_length=12)

    @model_validator(mode="after")
    def _ends_with_question(self):
        if self.messages[-1].role != "user":
            raise ValueError("The last message must be the question.")
        return self


class ChatOut(BaseModel):
    answer: str
    removed: int
    model: str


class AuthOut(BaseModel):
    required: bool
    ok: bool


class SettingsOut(BaseModel):
    owner_required: bool
    telegram: bool
    ai_enabled: bool
    india_universe: int
    alert_unproven: bool
