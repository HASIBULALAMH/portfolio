#!/usr/bin/env sh
set -eu

PUBLIC_URL=${PUBLIC_URL:-http://127.0.0.1:3000}
API_URL=${API_URL:-http://127.0.0.1:8000/api}
ADMIN_URL=${ADMIN_URL:-http://127.0.0.1:3001}

curl --fail --silent --show-error --max-time 3 "$API_URL/settings" >/dev/null
curl --fail --silent --show-error --max-time 3 "$PUBLIC_URL/" >/dev/null
curl --fail --silent --show-error --max-time 3 "$ADMIN_URL/login" >/dev/null

printf '%s\n' 'Smoke test passed: API, public homepage, and admin login respond.'