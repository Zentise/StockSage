"""Start the StockSage API on http://127.0.0.1:8000 (run `npm run dev` in frontend/ for the UI)."""

from pathlib import Path

import uvicorn

if __name__ == "__main__":
    root = Path(__file__).resolve().parent
    uvicorn.run("backend.main:app", host="127.0.0.1", port=8000, reload=True, reload_dirs=[str(root / "backend")])
