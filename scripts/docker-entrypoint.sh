#!/bin/bash
set -euo pipefail

NEXT_PORT="${NEXT_PORT:-3000}"
FLASK_PORT="${FLASK_PORT:-8080}"

shutdown() {
  [[ -n "${NODE_PID:-}" ]] && kill "${NODE_PID}" 2>/dev/null || true
  [[ -n "${GUNICORN_PID:-}" ]] && kill "${GUNICORN_PID}" 2>/dev/null || true
  exit 0
}
trap shutdown SIGTERM SIGINT

cd /opt/netiq/web-standalone
HOSTNAME=0.0.0.0 PORT="${NEXT_PORT}" node server.js &
NODE_PID=$!

cd /opt/netiq
gunicorn \
  --bind "0.0.0.0:${FLASK_PORT}" \
  --workers "${GUNICORN_WORKERS:-2}" \
  --threads "${GUNICORN_THREADS:-4}" \
  --timeout "${GUNICORN_TIMEOUT:-120}" \
  --access-logfile - \
  --error-logfile - \
  app:app &
GUNICORN_PID=$!

wait "${NODE_PID}" "${GUNICORN_PID}"
