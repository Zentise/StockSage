#!/bin/sh
set -e
nginx -g "daemon off;" &
# One worker on purpose: the scan loop runs inside it.
exec uvicorn backend.main:app --host 127.0.0.1 --port 8000 --workers 1
