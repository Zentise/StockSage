"""Launch StockSage backend server."""

import sys
from pathlib import Path

# Ensure project root is on sys.path
root = str(Path(__file__).resolve().parent)
if root not in sys.path:
    sys.path.insert(0, root)

import uvicorn

if __name__ == "__main__":
    uvicorn.run(
        "backend.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        reload_dirs=[str(Path(root) / "backend")],
    )
