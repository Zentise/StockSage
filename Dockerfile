# ─── Stage 1: Build React frontend ───────────────────────────────────────────
FROM node:20-alpine AS frontend-builder

WORKDIR /build/frontend

COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci

COPY frontend/ ./
RUN npm run build


# ─── Stage 2: Production image ────────────────────────────────────────────────
FROM python:3.11-slim

# Install nginx (for static file serving + reverse proxy)
RUN apt-get update \
    && apt-get install -y --no-install-recommends nginx \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies first (layer-cached)
COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

# Copy backend source
COPY backend/ ./backend/

# Copy built React app
COPY --from=frontend-builder /build/frontend/dist ./frontend/dist

# nginx config
COPY nginx.conf /etc/nginx/sites-available/default

# Entrypoint
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# Runtime environment variables (pass secrets via -e / --env-file at runtime)
ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/app

EXPOSE 80

ENTRYPOINT ["/docker-entrypoint.sh"]
