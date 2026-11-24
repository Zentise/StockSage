"""Storage. SQLite file by default; any Postgres (e.g. Neon) via DATABASE_URL."""

from datetime import UTC, datetime

from sqlalchemy import JSON, Boolean, DateTime, Float, Integer, String, Text, create_engine, event, inspect, text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker

from backend.config import DATABASE_URL

engine = create_engine(DATABASE_URL, pool_pre_ping=True)
Session = sessionmaker(engine, expire_on_commit=False)

if engine.dialect.name == "sqlite":
    @event.listens_for(engine, "connect")
    def _pragmas(conn, _):
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA busy_timeout=5000")


def utcnow() -> datetime:
    """Naive UTC everywhere in storage: SQLite has no timezone type."""
    return datetime.now(UTC).replace(tzinfo=None)


class Base(DeclarativeBase):
    pass


class Signal(Base):
    __tablename__ = "signals"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    engine: Mapped[str] = mapped_column(String(8), index=True)      # v1 (imported) or v2
    market: Mapped[str] = mapped_column(String(8), index=True)
    ticker: Mapped[str] = mapped_column(String(24), index=True)
    name: Mapped[str] = mapped_column(String(120))
    direction: Mapped[str] = mapped_column(String(8))
    category: Mapped[str] = mapped_column(String(16))
    setup: Mapped[str] = mapped_column(String(16), default="confluence", server_default="confluence", index=True)
    timeframe: Mapped[str] = mapped_column(String(32), default="")
    entry: Mapped[float] = mapped_column(Float)
    stop: Mapped[float | None] = mapped_column(Float)
    target: Mapped[float | None] = mapped_column(Float)
    evidence_for: Mapped[list] = mapped_column(JSON, default=list)
    evidence_against: Mapped[list] = mapped_column(JSON, default=list)
    pending: Mapped[bool] = mapped_column(default=False)            # fills at next open
    created_at: Mapped[datetime] = mapped_column(DateTime, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime)
    # active | target | stop | expired | reversed | void | ended (AVOID only)
    status: Mapped[str] = mapped_column(String(12), default="active", index=True)
    fill_price: Mapped[float | None] = mapped_column(Float)
    exit_price: Mapped[float | None] = mapped_column(Float)
    exit_at: Mapped[datetime | None] = mapped_column(DateTime)
    r: Mapped[float | None] = mapped_column(Float)
    best_r: Mapped[float | None] = mapped_column(Float)
    worst_r: Mapped[float | None] = mapped_column(Float)
    # What other stocks in the same market did from the same minute under the same rule.
    control_r: Mapped[float | None] = mapped_column(Float)
    checked_at: Mapped[datetime | None] = mapped_column(DateTime)


class Meta(Base):
    __tablename__ = "meta"

    key: Mapped[str] = mapped_column(String(80), primary_key=True)
    value: Mapped[str] = mapped_column(Text)


class Note(Base):
    __tablename__ = "notes"

    ticker: Mapped[str] = mapped_column(String(24), primary_key=True)
    day: Mapped[str] = mapped_column(String(10), primary_key=True)
    body: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class Position(Base):
    """A trade the owner took (or paper-traded) and wants to journal. Long only."""
    __tablename__ = "positions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    market: Mapped[str] = mapped_column(String(8), index=True)
    ticker: Mapped[str] = mapped_column(String(24), index=True)
    name: Mapped[str] = mapped_column(String(120), default="")
    paper: Mapped[bool] = mapped_column(Boolean, default=True)
    qty: Mapped[float] = mapped_column(Float)
    entry: Mapped[float] = mapped_column(Float)
    stop: Mapped[float | None] = mapped_column(Float)
    target: Mapped[float | None] = mapped_column(Float)
    opened_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    signal_id: Mapped[int | None] = mapped_column(Integer)          # the setup it came from, if any
    setup: Mapped[str | None] = mapped_column(String(16))
    why: Mapped[str] = mapped_column(Text, default="")              # the reason, in the owner's words
    status: Mapped[str] = mapped_column(String(8), default="open", index=True)   # open | closed
    exit_price: Mapped[float | None] = mapped_column(Float)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime)
    close_reason: Mapped[str | None] = mapped_column(String(12))    # stop | target | manual
    lesson: Mapped[str] = mapped_column(Text, default="")           # what the owner learned
    mistake: Mapped[str | None] = mapped_column(String(24))         # tag, e.g. "moved stop"
    alerted: Mapped[str | None] = mapped_column(String(8))          # stop/target message already sent


class Alert(Base):
    __tablename__ = "alerts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    market: Mapped[str] = mapped_column(String(8))
    ticker: Mapped[str] = mapped_column(String(24), index=True)
    kind: Mapped[str] = mapped_column(String(8))                    # above | below
    level: Mapped[float] = mapped_column(Float)
    note: Mapped[str] = mapped_column(String(200), default="")
    active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    fired_at: Mapped[datetime | None] = mapped_column(DateTime)
    fired_price: Mapped[float | None] = mapped_column(Float)


class AiCache(Base):
    """One AI result per key and day (debates, briefs). Keeps the free quota for new questions."""
    __tablename__ = "ai_cache"

    key: Mapped[str] = mapped_column(String(80), primary_key=True)
    day: Mapped[str] = mapped_column(String(10), primary_key=True)
    body: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


def _add_missing_columns() -> None:
    """create_all makes new tables but never alters old ones. Add columns that arrived later."""
    insp = inspect(engine)
    have = {c["name"] for c in insp.get_columns("signals")}
    if "setup" not in have:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE signals ADD COLUMN setup VARCHAR(16) NOT NULL DEFAULT 'confluence'"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_signals_setup ON signals (setup)"))


def init() -> None:
    Base.metadata.create_all(engine)
    _add_missing_columns()


def get_meta(key: str) -> str | None:
    with Session() as s:
        row = s.get(Meta, key)
        return row.value if row else None


def set_meta(key: str, value: str) -> None:
    with Session() as s:
        s.merge(Meta(key=key, value=value))
        s.commit()
