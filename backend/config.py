"""All configuration comes from environment variables (or .env in the project root)."""

import os
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")


def _int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, default))
    except ValueError:
        return default


def _db_url() -> str:
    url = os.getenv("DATABASE_URL", "").strip()
    if not url:
        return f"sqlite:///{(ROOT / 'stocksage.db').as_posix()}"
    # Neon/Render hand out postgres:// URLs; SQLAlchemy wants the driver named.
    for prefix in ("postgres://", "postgresql://"):
        if url.startswith(prefix):
            return "postgresql+psycopg://" + url[len(prefix):]
    return url


DATABASE_URL = _db_url()
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
GROQ_MODEL = os.getenv("GROQ_MODEL", "openai/gpt-oss-120b")
ALLOWED_ORIGINS = [
    o.strip()
    for o in os.getenv(
        "ALLOWED_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173,https://thestocksage.vercel.app",
    ).split(",")
    if o.strip()
]
# How much of India the scan covers: 50, 100, 200 or 500. Wider means many more price requests.
INDIA_UNIVERSE = _int("STOCKSAGE_INDIA_UNIVERSE", 50) if _int("STOCKSAGE_INDIA_UNIVERSE", 50) in (50, 100, 200, 500) else 50
# The owner's key. When set, the journal, alerts, chat and debate need it; when empty (local use) nothing does.
OWNER_TOKEN = os.getenv("OWNER_TOKEN", "")
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
ALERT_UNPROVEN = os.getenv("ALERT_UNPROVEN", "0") == "1"   # also message about setups that have not beaten random
TELEGRAM_CHAT_ID = os.getenv("TELEGRAM_CHAT_ID", "")
SCAN_INTERVAL = _int("STOCKSAGE_SCAN_INTERVAL_SECONDS", 300)
OFF_HOURS_INTERVAL = _int("STOCKSAGE_OFF_HOURS_INTERVAL_SECONDS", 1800)
BACKGROUND = os.getenv("STOCKSAGE_BACKGROUND", "1") != "0"
EXTRA_HOLIDAYS = {
    "india": os.getenv("STOCKSAGE_NSE_HOLIDAYS", ""),
    "us": os.getenv("STOCKSAGE_NYSE_HOLIDAYS", ""),
}
