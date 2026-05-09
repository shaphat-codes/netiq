#!/usr/bin/env bash
# Stop NetIQ: uses netiq.pid if present, otherwise finds the process listening on
# the configured PORT whose command line runs this repo's app.py (e.g. manual `python app.py`).
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PIDFILE="$ROOT/netiq.pid"
VENV_PY="$ROOT/.venv/bin/python"

if [[ -x "$VENV_PY" ]]; then
  PORT="$("$VENV_PY" -c "from config import AppConfig; print(AppConfig().PORT)" 2>/dev/null || echo 8080)"
else
  PORT="${PORT:-8080}"
fi

stopped=false

stop_pid() {
  local pid="$1"
  if kill -0 "$pid" 2>/dev/null; then
    kill "$pid" 2>/dev/null || true
    sleep 0.3
    if kill -0 "$pid" 2>/dev/null; then
      kill -9 "$pid" 2>/dev/null || true
    fi
    return 0
  fi
  return 1
}

# 1) PID file from scripts/start.sh
if [[ -f "$PIDFILE" ]]; then
  pid="$(tr -d '[:space:]' <"$PIDFILE" 2>/dev/null || true)"
  if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
    stop_pid "$pid"
    echo "Stopped NetIQ (PID $pid from netiq.pid)"
    stopped=true
  elif [[ -n "$pid" ]]; then
    echo "Removing stale netiq.pid (PID $pid not running)."
  fi
  rm -f "$PIDFILE"
fi

# Collect listener PIDs on PORT (Linux)
listener_pids=()
if command -v lsof >/dev/null 2>&1; then
  while IFS= read -r p; do
    [[ -n "$p" ]] && listener_pids+=("$p")
  done < <(lsof -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null || true)
elif command -v ss >/dev/null 2>&1; then
  while IFS= read -r p; do
    [[ -n "$p" ]] && listener_pids+=("$p")
  done < <(ss -lptn "sport = :$PORT" 2>/dev/null | grep -oE 'pid=[0-9]+' | cut -d= -f2 | sort -u)
fi

is_this_netiq() {
  local pid="$1"
  local cmd=""
  if [[ -r "/proc/$pid/cmdline" ]]; then
    cmd=$(tr '\0' ' ' <"/proc/$pid/cmdline")
  else
    cmd=$(ps -p "$pid" -o args= 2>/dev/null || true)
  fi
  [[ "$cmd" == *"app.py"* ]] || return 1
  # Prefer match on this repo path so we don't kill another Flask app on the same port
  [[ "$cmd" == *"$ROOT"* ]] || [[ "$cmd" == *"/netiq/app.py"* ]] || return 1
  return 0
}

for pid in "${listener_pids[@]:-}"; do
  if is_this_netiq "$pid"; then
    stop_pid "$pid"
    echo "Stopped NetIQ (PID $pid listening on port $PORT)"
    stopped=true
  fi
done

# Last resort: any process whose cmdline is this repo's app.py (avoids regex issues with paths)
if [[ "$stopped" == false ]] && command -v pgrep >/dev/null 2>&1; then
  while IFS= read -r pid; do
    [[ -z "$pid" ]] && continue
    if is_this_netiq "$pid"; then
      stop_pid "$pid"
      echo "Stopped NetIQ (PID $pid matched this project's app.py)"
      stopped=true
    fi
  done < <(pgrep -f "app.py" 2>/dev/null || true)
fi

if [[ "$stopped" == false ]]; then
  echo "No NetIQ process found." >&2
  echo "  Checked: netiq.pid, port $PORT (listeners must run $ROOT/app.py)." >&2
  echo "  If the app uses another port, set PORT in .env or run: lsof -iTCP -sTCP:LISTEN" >&2
  exit 1
fi

exit 0
