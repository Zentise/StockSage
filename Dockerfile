FROM node:22-alpine AS ui
WORKDIR /ui
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.11-slim
RUN apt-get update && apt-get install -y --no-install-recommends nginx curl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt
COPY backend/ backend/
COPY backups/ backups/
COPY --from=ui /ui/dist frontend/dist
COPY nginx.conf /etc/nginx/sites-available/default
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh
# Mount a volume here to keep history between restarts, or set DATABASE_URL to Postgres.
VOLUME /data
ENV PYTHONUNBUFFERED=1 DATABASE_URL=sqlite:////data/stocksage.db
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s CMD curl -fs http://127.0.0.1/health || exit 1
ENTRYPOINT ["/docker-entrypoint.sh"]
