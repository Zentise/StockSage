import pytest
from fastapi.testclient import TestClient

from backend import db, evals, main
from backend.providers import yahoo
from backend.services import ai, notes
from tests.test_api import q


def test_guard_stops_every_known_attack():
    failed = [r for r in evals.offline() if not r["pass"]]
    assert not failed, failed


def test_a_model_that_obeys_a_poisoned_headline_shows_nothing():
    obeyed = {"summary": "You should buy now. It is guaranteed.", "bull": ["Guaranteed 100% return"], "bear": [], "watch": [], "missing": []}
    out = notes.clean(obeyed, evals.FACTS)
    assert out["summary"] == "" and out["bull"] == [] and out["removed"] >= 2


@pytest.fixture
def fake_model(monkeypatch):
    db.init()
    calls = []

    def ask(system, payload, max_tokens=1500, json_mode=True):
        calls.append(system[:30])
        if "bull analyst" in system:
            return {"case": ["RSI is 58, not stretched.", "Revenue grew 45%.", "You should buy now."], "wrong_if": "Price closes under 2400."}
        if "bear analyst" in system:
            return {"case": ["ATR is 41.3, so stops can be noisy."], "wrong_if": "RSI stays near 58."}
        if "risk manager" in system:
            return {"summary": "They agree on the trend. Check the news.", "agree": ["Trend is intact"],
                    "clash": ["Size of the dip"], "check_first": ["Open stop below 2400"]}
        return {"answer": "RSI is 58. Not a promise of anything."}
    monkeypatch.setattr(notes, "ask", ask)
    return calls


FACTS = evals.FACTS | {"technicals": {"rsi": 58.0, "atr": 41.3, "price": 2400.0}}


def test_debate_drops_unsupported_claims_and_counts_them(fake_model):
    out = ai.debate("TEST.NS", FACTS)
    assert out["bull"]["case"] == ["RSI is 58, not stretched."]          # the invented number and the order were removed
    assert out["bear"]["case"] and out["summary"] and out["removed"] == 2
    assert len(fake_model) == 3                                            # bull, bear, judge
    again = ai.debate("TEST.NS", FACTS)
    assert again["cached"] and len(fake_model) == 3                       # a second ask costs no quota


def test_chat_allows_numbers_the_trader_typed(monkeypatch):
    monkeypatch.setattr(notes, "ask", lambda *a, **k: {"answer": "A stop at 2300 would sit below the 20-day low."})
    out = ai.chat(evals.FACTS, [{"role": "user", "content": "Is 2300 a sensible stop?"}])
    assert "2300" in out["answer"] and out["removed"] == 0


def test_chat_refuses_to_guess(monkeypatch):
    monkeypatch.setattr(notes, "ask", lambda *a, **k: {"answer": "It will go to 9999 by Friday."})
    out = ai.chat(evals.FACTS, [{"role": "user", "content": "Where will it be?"}])
    assert "9999" not in out["answer"] and out["removed"] >= 1


def test_chat_endpoint_validates_and_runs(monkeypatch, make_bars):
    monkeypatch.setattr(yahoo, "quotes", lambda ts: {t: q(t) for t in ts})
    monkeypatch.setattr(yahoo, "candles", lambda *a, **k: make_bars())
    monkeypatch.setattr(yahoo, "market_news", lambda *a, **k: [])
    monkeypatch.setattr(notes, "ask", lambda *a, **k: {"answer": "Breadth is mixed."})
    main._hits.clear()
    with TestClient(main.app) as c:
        assert c.post("/chat", json={"messages": []}).status_code == 422
        assert c.post("/chat", json={"messages": [{"role": "assistant", "content": "hi"}]}).status_code == 422
        r = c.post("/chat", json={"market": "india", "messages": [{"role": "user", "content": "How is the market?"}]})
        assert r.status_code == 200 and r.json()["answer"] == "Breadth is mixed."


def test_no_key_means_a_plain_message_not_a_crash(monkeypatch):
    monkeypatch.setattr(notes.config, "GROQ_API_KEY", "")
    with pytest.raises(notes.NoteError, match="off"):
        notes.ask("x", {})
