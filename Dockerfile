FROM node:20-bookworm-slim AS web-builder
WORKDIR /app/web

COPY web/package.json web/package-lock.json ./
RUN npm ci

COPY web/ ./

ARG NEXT_PUBLIC_NETIQ_API_URL=http://localhost:8080
ENV NEXT_PUBLIC_NETIQ_API_URL=${NEXT_PUBLIC_NETIQ_API_URL}

RUN npx next build

FROM python:3.12-slim-bookworm

RUN apt-get update && apt-get install -y --no-install-recommends \
    tini \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY --from=node:20-bookworm-slim /usr/local/bin/node /usr/local/bin/node

WORKDIR /opt/netiq

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py config.py mcp_server.py cli.py ./
COPY database ./database
COPY routes ./routes
COPY services ./services
COPY integrations ./integrations
COPY utils ./utils
COPY examples ./examples

COPY scripts/docker-entrypoint.sh ./scripts/docker-entrypoint.sh
RUN chmod +x ./scripts/docker-entrypoint.sh

# Standalone layout is flat when only `web/` exists in the build context (no repo-root lockfile).
COPY --from=web-builder /app/web/.next/standalone /opt/netiq/web-standalone
COPY --from=web-builder /app/web/.next/static /opt/netiq/web-standalone/.next/static
COPY --from=web-builder /app/web/public /opt/netiq/web-standalone/public

ENV PYTHONUNBUFFERED=1 \
    NEXT_PORT=3000 \
    FLASK_PORT=8080 \
    NETIQ_API_URL=http://127.0.0.1:8080

EXPOSE 8080 3000

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["/opt/netiq/scripts/docker-entrypoint.sh"]
