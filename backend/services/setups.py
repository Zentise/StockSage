"""What each kind of setup has earned. Read from the replay, so a strategy has to prove itself."""

import json
from functools import lru_cache

from backend import replay
from backend.engine import strategies as st

BLURB = {st.BASELINE: "The original engine: trend, momentum, volume and candle patterns added up."} | {
    k: s.blurb for k, s in st.REGISTRY.items()}


@lru_cache(maxsize=1)
def _load(stamp: float) -> dict:
    return json.loads(replay.OUT.read_text()) if replay.OUT.exists() else {}


def replay_data() -> dict:
    return _load(replay.OUT.stat().st_mtime if replay.OUT.exists() else 0.0)


def summary(market: str, key: str) -> dict | None:
    m = replay_data().get(market) or {}
    if key == st.BASELINE:
        return (m.get("by_setup", {}).get(key)) or (m.get("overall") if m.get("overall", {}).get("n") else None)
    return m.get("by_setup", {}).get(key)


def is_validated(market: str, key: str) -> bool:
    s = summary(market, key)
    return bool(s and replay.validated(s))


def catalog(market: str) -> list[dict]:
    out = []
    for key, label in st.LABELS.items():
        s = summary(market, key)
        out.append({"key": key, "label": label, "blurb": BLURB[key], "validated": bool(s and replay.validated(s)),
                    "replay": s})
    return out
