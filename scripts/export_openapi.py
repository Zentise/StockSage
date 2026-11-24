"""Write the API contract the frontend's types are generated from."""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from backend.main import app  # noqa: E402

(ROOT / "frontend" / "openapi.json").write_text(json.dumps(app.openapi(), indent=1) + "\n", encoding="utf-8", newline="\n")
