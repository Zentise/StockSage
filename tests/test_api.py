import pytest
from fastapi.testclient import TestClient

from backend import main
from backend.db import Session, Signal, utcnow
from backend.engine.signals import Evidence, Setup
from backend.providers import yahoo
from backend.services import scan, track


def q(t, price=100.0, prev=98.0):
    return {"ticker": t, "price": price, "prev_close": prev, "change_abs": 2.0, "change_pct": 2.04, "day_high": 101.0, "day_low": 97.0,
            "high_52w": 120.0, "low_52w": 80.0, "volume": 1000.0, "as_of": 1, "spark": [98.0, 99.0, 100.0]}


@pytest.fixture
def client(monkeypatch, make_bars):
    monkeypatch.setattr(yahoo, "quotes", lambda ts: {t: q(t) for t in ts})
    monkeypatch.setattr(yahoo, "candles", lambda *a, **k: make_bars())
    monkeypatch.setattr(yahoo, "stock_news", lambda *a, **k: [])
    monkeypatch.setattr(yahoo, "fundamentals", lambda t: {})
    main._hits.clear()
    with TestClient(main.app) as c:
        with Session() as s:
            s.query(Signal).delete()
            s.commit()
        yield c


def setup(ticker="TCS.NS", direction="BUY", entry=100.0):
    avoid = direction == "AVOID"
    return Setup(ticker, direction, "short_term", "Up to 2 weeks", entry, None if avoid else 95.0, None if avoid else 110.0,
                 [Evidence("Short-term trend is up", 1)], [])


def test_signal_payload_has_every_field_the_card_needs(client):
    scan.record("india", [setup()], open_=True)
    s = client.get("/signals").json()["active"][0]
    assert s["quote"]["price"] == 100 and s["quote"]["spark"] and s["evidence_for"]
    for k in ("created_at", "expires_at"):     # one Z, no offset: browsers must be able to parse it
        assert s[k].endswith("Z") and "+" not in s[k]


def test_same_idea_is_not_published_twice(client):
    assert scan.record("india", [setup()], True) == 1
    assert scan.record("india", [setup()], True) == 0


def test_opposite_idea_closes_the_first(client):
    scan.record("india", [setup()], True)
    scan.record("india", [setup(direction="AVOID", entry=102.5)], True)
    with Session() as db:
        old, new = db.query(Signal).order_by(Signal.id).all()
        assert (old.status, old.r) == ("reversed", 0.5) and new.status == "active"


def test_dead_signals_leave_the_dashboard(client):
    scan.record("india", [setup()], True)
    with Session() as db:
        db.query(Signal).one().expires_at = utcnow()
        db.commit()
    assert client.get("/signals").json()["active"] == []


def test_closed_market_signals_wait_for_the_open(client):
    scan.record("india", [setup()], open_=False)
    assert client.get("/signals").json()["active"][0]["pending"] is True


def test_record_compares_with_control(client):
    scan.record("india", [setup()], True)
    with Session() as db:
        s = db.query(Signal).one()
        s.status, s.r, s.control_r, s.exit_at = "target", 2.0, 0.5, utcnow()
        db.commit()
    o = client.get("/record").json()["overall"]
    assert (o["n"], o["avg_r"], o["control_r"], o["edge_r"]) == (1, 2.0, 0.5, 1.5)
    assert o["edge_low"] is None     # one trade is not enough for a range


def test_curve_never_draws_a_missing_control_as_zero(client):
    scan.record("india", [setup()], True)
    with Session() as db:
        s = db.query(Signal).one()
        s.status, s.r, s.exit_at = "target", 2.0, utcnow()      # control not computed yet
        db.commit()
    r = client.get("/record").json()
    assert r["overall"]["n"] == 1 and r["overall"]["control_r"] is None and r["curve"] == []


def test_v1_history_imports_once(client):
    if not track.BACKUP.exists():
        pytest.skip("no backup file")
    assert track.import_v1() == 479
    assert track.import_v1() == 0


def test_market(client):
    r = client.get("/market").json()
    assert len(r["stocks"]) == 50 and r["sectors"] and r["indices"][0]["name"] == "NIFTY 50"


@pytest.mark.parametrize("path", ["/stock/TCS.NS", "/stock/M&M.NS", "/stock/^NSEI", "/stock/TCS.NS/candles?tf=1D",
                                  "/stock/TCS.NS/odds?entry=1000&stop=950&target=1100"])
def test_stock_pages(client, path):
    assert client.get(path).status_code == 200


@pytest.mark.parametrize("path", ["/stock/..%2Fetc", "/stock/tcs;drop", "/stock/TCS.NS/candles?tf=9Y", "/status?market=mars",
                                  "/stock/TCS.NS/odds?entry=100&stop=110&target=120"])
def test_bad_input_is_rejected(client, path):
    assert client.get(path).status_code in (404, 422)


def test_ai_failure_is_visible(client):
    r = client.post("/stock/TCS.NS/note")
    assert r.status_code == 503 and "GROQ_API_KEY" in r.json()["detail"]


def test_ai_is_rate_limited(client):
    assert [client.post("/stock/TCS.NS/note").status_code for _ in range(7)][-1] == 429


def test_cors_is_not_open(client):
    r = client.get("/health", headers={"Origin": "https://evil.example"})
    assert "access-control-allow-origin" not in r.headers


def test_websocket_respects_market(client):
    with client.websocket_connect("/ws/prices?market=us") as ws:
        msg = ws.receive_json()
        assert msg["market"] == "us" and "AAPL" in msg["prices"] and "TCS.NS" not in msg["prices"]


def test_scan_cannot_be_triggered_by_a_link(client):
    assert client.get("/scan").status_code == 405
