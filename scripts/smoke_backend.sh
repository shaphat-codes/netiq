#!/usr/bin/env bash
# Quick manual smoke test against a running NetIQ server (default http://127.0.0.1:8080).
# Usage: ./scripts/smoke_backend.sh [BASE_URL]
set -euo pipefail
BASE="${1:-http://127.0.0.1:8080}"

_pretty() { python3 -m json.tool 2>/dev/null || cat; }

echo "== Health =="
curl -sf "${BASE}/health" | _pretty

echo "== Register + login + create API key =="
curl -sf -c /tmp/netiq_cookies.txt -X POST "${BASE}/api/v1/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"email":"smoke@example.com","password":"smokepass12","account_name":"Smoke"}' | _pretty

curl -sf -c /tmp/netiq_cookies.txt -b /tmp/netiq_cookies.txt -X POST "${BASE}/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"smoke@example.com","password":"smokepass12"}' | _pretty

KEY_JSON=$(curl -sf -b /tmp/netiq_cookies.txt -X POST "${BASE}/api/v1/keys" \
  -H "Content-Type: application/json" \
  -d '{"name":"smoke-key"}')
echo "$KEY_JSON" | _pretty
API_KEY=$(echo "$KEY_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin)['api_key'])")

echo "== Analyze (Bearer) =="
curl -sf "${BASE}/analyze" \
  -H "Authorization: Bearer ${API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"intent":"payment","phone":"+9999999100","amount":25}' | _pretty

echo "== Console events (session cookie) =="
curl -sf -b /tmp/netiq_cookies.txt "${BASE}/api/v1/events?limit=3" | _pretty

echo "== Metrics =="
curl -sf -b /tmp/netiq_cookies.txt "${BASE}/api/v1/metrics/summary?days=7" | _pretty

echo "== OpenAPI =="
curl -sf "${BASE}/api/v1/openapi.json" | python3 -c "import sys,json; print(json.load(sys.stdin).get('openapi',''))"

echo "OK — smoke complete. Cookie jar: /tmp/netiq_cookies.txt"
