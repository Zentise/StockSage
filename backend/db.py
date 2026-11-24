"""Storage. SQLite file by default; any Postgres (e.g. Neon) via DATABASE_URL."""

from datetime import UTC, datetime

from sqlalchemy import JSON, DateTime, Float, Integer, String, Text, create_engine, event
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


def init() -> None:
    Base.metadata.create_all(engine)


def get_meta(key: str) -> str | None:
    with Session() as s:
        row = s.get(Meta, key)
        return row.value if row else None


def set_meta(key: str, value: str) -> None:
    with Session() as s:
        s.merge(Meta(key=key, value=value))
        s.commit()
