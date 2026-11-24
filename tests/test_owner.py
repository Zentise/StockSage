from datetime import datetime

import pytest
from fastapi.testclient import TestClient

from backend import auth, config, main
from backend.db import Alert, Position, Session
from backend.providers import yahoo
from backend.services import alerts, brief, journal, notify
from tests.test_api import q


@pytest.fixture
def api(monkeypatch, make_bars):
    monkeypatch.setattr(yahoo, "quotes", lambda ts: {t: q(t) for t in ts})
    monkeypatch.setattr(yahoo, "candles", lambda *a, **k: make_bars())
    monkeypatch.setattr(yahoo, "stock_news", lambda *a, **k: [])
    monkeypatch.setattr(yahoo, "market_news", lambda *a, **k: [])
    monkeypatch.setattr(yahoo, "fundamentals", lambda t: {})
    main._hits.clear()
    with TestClient(main.app) as c:
        with Session() as s:
            s.query(Position).delete()
            s.query(Alert).delete()
            s.commit()
        yield c


def test_nothing_is_locked_without_an_owner_key(api):
    assert api.get("/auth").json() == {"required": False, "ok": True}
    assert api.get("/portfolio").status_code == 200


def test_owner_key_locks_private_routes(api, monkeypatch):
    monkeypatch.setattr(config, "OWNER_TOKEN", "s3cret-key")
    for method, path in (("get", "/portfolio"), ("get", "/alerts"), ("get", "/brief"), ("post", "/chat"), ("post", "/stock/TCS.NS/debate")):
        assert getattr(api, method)(path).status_code == 401, path
    assert api.get("/portfolio", headers={"X-Owner-Token": "wrong"}).status_code == 401
    assert api.get("/portfolio", headers={"X-Owner-Token": "s3cret-key"}).status_code == 200
    assert api.get("/auth", headers={"X-Owner-Token": "s3cret-key"}).json() == {"required": True, "ok": True}
    assert api.get("/signals").status_code == 200       # the public pages stay public
    assert api.get("/status").json()["owner_required"] is True


def test_check_is_constant_time_safe(monkeypatch):
    monkeypatch.setattr(config, "OWNER_TOKEN", "abc")
    assert auth.check("abc") and not auth.check("abd") and not auth.check(None) and not auth.check("")


def test_journal_round_trip_in_r(api):
    p = api.post("/positions", json={"ticker": "TCS.NS", "qty": 10, "entry": 100, "stop": 95, "target": 110, "paper": False, "why": "pullback"}).json()
    assert p["status"] == "open" and p["risk"] == 50
    done = api.post(f"/positions/{p['id']}/close", json={"price": 110, "reason": "target", "lesson": "waited for it", "mistake": "none"}).json()
    assert done["r"] == 2.0 and done["pnl"] == 100.0
    lose = api.post("/positions", json={"ticker": "INFY.NS", "qty": 5, "entry": 100, "stop": 95, "paper": False}).json()
    api.post(f"/positions/{lose['id']}/close", json={"price": 95, "reason": "stop", "mistake": "chased"})
    pf = api.get("/portfolio").json()
    assert pf["stats"]["n"] == 2 and pf["stats"]["total_r"] == 1.0 and pf["stats"]["win_rate"] == 0.5
    assert pf["by_mistake"]["chased"]["total_r"] == -1.0
    assert pf["curve"][-1]["total"] == 1.0 and not pf["open"]


def test_journal_refuses_nonsense(api):
    assert api.post("/positions", json={"ticker": "TCS.NS", "qty": 1, "entry": 100, "stop": 105}).status_code == 422
    assert api.post("/positions", json={"ticker": "TCS.NS", "qty": 1, "entry": 100, "target": 90}).status_code == 422
    assert api.post("/positions", json={"ticker": "TCS.NS", "qty": 0, "entry": 100}).status_code == 422
    p = api.post("/positions", json={"ticker": "TCS.NS", "qty": 1, "entry": 100}).json()
    assert api.post(f"/positions/{p['id']}/close", json={"price": 99, "mistake": "made up"}).status_code == 422
    assert api.post("/positions/999/close", json={"price": 99}).status_code == 404
    api.post(f"/positions/{p['id']}/close", json={"price": 99})
    assert api.post(f"/positions/{p['id']}/close", json={"price": 99}).status_code == 404   # already closed


def test_paper_trades_close_on_the_price_path(monkeypatch, make_bars, api):
    p = journal.open_position({"ticker": "TCS.NS", "qty": 1, "entry": 1000.0, "stop": 1.0, "target": 1e9, "paper": True})
    assert journal.manage_paper() == []                    # nothing touched
    with Session() as s:
        row = s.get(Position, p.id)
        row.opened_at = datetime(2025, 2, 1)               # the fake bars run through 2025
        row.target, row.stop = 1.0001, 0.5                 # target below any price: hit on the first bar
        s.commit()
    done = journal.manage_paper()
    assert [x.id for x in done] == [p.id] and done[0].close_reason == "target" and done[0].status == "closed"


def test_price_alert_fires_once_and_only_during_the_session(api, monkeypatch):
    sent = []
    monkeypatch.setattr(notify, "send", lambda t: sent.append(t) or True)
    a = alerts.create("TCS.NS", "above", 99.0)
    alerts.create("INFY.NS", "below", 50.0)                # price is 100: not crossed
    monkeypatch.setattr(alerts.mh, "is_open", lambda m, now=None: False)
    assert alerts.check() == 0 and not sent                # market shut: no check
    monkeypatch.setattr(alerts.mh, "is_open", lambda m, now=None: m == "india")
    assert alerts.check() == 1 and len(sent) == 1 and "Tata Consultancy" in sent[0]
    assert alerts.check() == 0                              # rings once
    with Session() as s:
        assert s.get(Alert, a.id).active is False


def test_real_trade_gets_a_message_when_the_stop_is_reached(api, monkeypatch):
    sent = []
    monkeypatch.setattr(notify, "send", lambda t: sent.append(t) or True)
    monkeypatch.setattr(alerts.mh, "is_open", lambda m, now=None: m == "india")
    journal.open_position({"ticker": "TCS.NS", "qty": 1, "entry": 105.0, "stop": 101.0, "target": 120.0, "paper": False})
    assert alerts.check() == 1 and "stop" in sent[0] and alerts.check() == 0     # price 100 <= stop 101, said once


def test_alert_validation(api):
    assert api.post("/alerts", json={"ticker": "TCS.NS", "kind": "above", "level": 0}).status_code == 422
    assert api.post("/alerts", json={"ticker": "TCS.NS", "kind": "sideways", "level": 5}).status_code == 422
    a = api.post("/alerts", json={"ticker": "TCS.NS", "kind": "below", "level": 90, "note": "stop area"}).json()
    assert api.get("/alerts").json()[0]["id"] == a["id"]
    assert api.delete(f"/alerts/{a['id']}").status_code == 200 and api.delete(f"/alerts/{a['id']}").status_code == 404


def test_brief_has_the_honest_reminder(api):
    b = api.get("/brief?market=india").json()
    assert b["indices"] and "record" in b and b["telegram"] is False
    text = brief.text(brief.build("india"))
    assert "Not advice" in text


def test_telegram_is_a_no_op_when_unset(monkeypatch):
    monkeypatch.setattr(config, "TELEGRAM_BOT_TOKEN", "")
    assert notify.send("hi") is False and notify.configured() is False


def test_telegram_failure_does_not_leak_the_token(monkeypatch, caplog):
    monkeypatch.setattr(config, "TELEGRAM_BOT_TOKEN", "123:SECRET")
    monkeypatch.setattr(config, "TELEGRAM_CHAT_ID", "1")

    def boom(*a, **k):
        raise notify.requests.ConnectionError("https://api.telegram.org/bot123:SECRET/sendMessage failed")
    monkeypatch.setattr(notify.requests, "post", boom)
    assert notify.send("hi") is False
    assert "SECRET" not in caplog.text
