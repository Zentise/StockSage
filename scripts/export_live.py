"""Save signals from a deployed v1 server before redeploying it: v1 keeps them only in memory.

    python scripts/export_live.py https://thestocksage.vercel.app/api 2026-11-24
"""

import json
import sys
import time
from datetime import date, timedelta
from pathlib import Path

import requests

base, start = sys.argv[1], date.fromisoformat(sys.argv[2])
days, d = [], start
while d <= date.today():
    for market in ("india", "us"):
        r = requests.get(f"{base}/accuracy", params={"market": market, "date": d.isoformat()}, timeout=100)
        r.raise_for_status()
        if r.json().get("signals"):
            days.append(r.json())
        time.sleep(0.4)
    d += timedelta(days=1)
out = Path(__file__).resolve().parent.parent / "backups" / f"live-signals_{start}_to_{date.today()}.json"
out.write_text(json.dumps({"source": base, "days": days}, indent=1))
print(f"{sum(len(x['signals']) for x in days)} signals -> {out}")
