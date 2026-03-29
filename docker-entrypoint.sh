#!/bin/sh
set -e

# Start nginx in the background
nginx -g "daemon off;" &

# Start FastAPI backend
exec uvicorn backend.main:app \
    --host 127.0.0.1 \
    --port 8000 \
    --workers 1
