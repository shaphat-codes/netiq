#!/usr/bin/env bash
# Start NetIQ (Flask) in the background. Logs to netiq.log in the project root.
# To stop: scripts/stop.sh (works even if you started with `python app.py` manually).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PIDFILE="$ROOT/netiq.pid"
LOGFILE="$ROOT/netiq.log"
VENV_PY="$ROOT/.venv/bin/python"

if [[ ! -x "$VENV_PY" ]]; then
  echo "Missing venv at .venv — run: python3 -m venv .venv && .venv/bin/pip install -r requirements.txt" >&2
  exit 1
fi

if [[ -f "$PIDFILE" ]]; then
  old_pid="$(cat "$PIDFILE" 2>/dev/null || true)"
  if [[ -n "$old_pid" ]] && kill -0 "$old_pid" 2>/dev/null; then
    echo "NetIQ already running (PID $old_pid). Use scripts/stop.sh first." >&2
    exit 1
  fi
  rm -f "$PIDFILE"
fi

PORT="$("$VENV_PY" -c "from config import AppConfig; print(AppConfig().PORT)" 2>/dev/null || echo 8080)"

if command -v lsof >/dev/null 2>&1 && lsof -tiTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Port $PORT is already in use. Run: $ROOT/scripts/stop.sh" >&2
  exit 1
fi

nohup "$VENV_PY" "$ROOT/app.py" >>"$LOGFILE" 2>&1 &
echo $! >"$PIDFILE"
new_pid="$(cat "$PIDFILE")"

# Confirm the process bound to PORT (avoids a stale listener + wrong netiq.pid).
for _ in 1 2 3 4 5 6 7 8 9 10; do
  if command -v lsof >/dev/null 2>&1; then
    if lsof -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null | grep -qx "$new_pid"; then
      echo "NetIQ started (PID $new_pid)"
      echo "  URL:  http://127.0.0.1:${PORT}/"
      echo "  Log:  $LOGFILE"
      exit 0
    fi
  elif command -v ss >/dev/null 2>&1; then
    if ss -lptn "sport = :$PORT" 2>/dev/null | grep -q "pid=$new_pid"; then
      echo "NetIQ started (PID $new_pid)"
      echo "  URL:  http://127.0.0.1:${PORT}/"
      echo "  Log:  $LOGFILE"
      exit 0
    fi
  else
    sleep 0.4
    if kill -0 "$new_pid" 2>/dev/null; then
      echo "NetIQ started (PID $new_pid) (could not verify port; install lsof or ss to confirm bind)"
      echo "  URL:  http://127.0.0.1:${PORT}/"
      echo "  Log:  $LOGFILE"
      exit 0
    fi
    break
  fi
  sleep 0.2
  if ! kill -0 "$new_pid" 2>/dev/null; then
    break
  fi
done

rm -f "$PIDFILE"
echo "NetIQ failed to listen on port $PORT (see $LOGFILE)." >&2
exit 1
