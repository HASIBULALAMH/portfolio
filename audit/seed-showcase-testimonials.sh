#!/usr/bin/env bash
# Create API showcase + testimonial content through the ADMIN endpoints, so the
# data lands via the same controllers and validation the admin panel posts to
# rather than being inserted straight into the database.
#
# Idempotent-ish: it skips creating anything if the tables already have rows.
set -euo pipefail

API="http://127.0.0.1:8000/api"
EMAIL="info@hasib.com"
PASSWORD="42862266"

TOKEN=$(curl -s -X POST "$API/login" \
  -H 'Content-Type: application/json' -H 'Accept: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" \
  | python3 -c 'import sys,json; print(json.load(sys.stdin)["data"]["token"])')

echo "authenticated, token acquired"

auth_post() {
  curl -s -X POST "$API$1" \
    -H "Authorization: Bearer $TOKEN" \
    -H 'Content-Type: application/json' -H 'Accept: application/json' \
    -d "$2" -w ' [HTTP %{http_code}]\n' | tail -c 220
}

existing_showcases=$(curl -s "$API/api-showcases" | python3 -c 'import sys,json; print(len(json.load(sys.stdin)["data"]))')

if [ "$existing_showcases" -eq 0 ]; then
  echo "--- creating API showcases ---"
  auth_post /admin/api-showcases '{"icon_name":"Zap","title":"REST API Design","description":"Versioned, resource-oriented endpoints with consistent envelopes, cursor pagination and strict validation.","endpoints":["GET /api/v1/projects","POST /api/v1/projects","GET /api/v1/projects/{slug}"],"order":0}'
  auth_post /admin/api-showcases '{"icon_name":"ShieldCheck","title":"Auth & Tokens","description":"Sanctum-backed token auth with per-ability scoping, throttled login and rotation on password change.","endpoints":["POST /api/login","POST /api/logout","GET /api/admin/me"],"order":1}'
  auth_post /admin/api-showcases '{"icon_name":"Webhook","title":"Webhooks & Integrations","description":"Signed, replay-safe webhook delivery with exponential backoff and a dead-letter queue for failures.","endpoints":["POST /api/webhooks/stripe","POST /api/webhooks/github"],"order":2}'
  auth_post /admin/api-showcases '{"icon_name":"Database","title":"Query Performance","description":"Eager-loaded relations and covering indexes that cut a 40-query page render down to four.","endpoints":["GET /api/skills","GET /api/timeline"],"order":3}'
else
  echo "api_showcases already has $existing_showcases rows; skipping"
fi

existing_testimonials=$(curl -s "$API/testimonials" | python3 -c 'import sys,json; print(len(json.load(sys.stdin)["data"]))')

if [ "$existing_testimonials" -eq 0 ]; then
  echo "--- creating testimonials ---"
  auth_post /admin/testimonials '{"quote":"Hasibul rebuilt our reporting API and cut p95 latency from 1.9s to 210ms. He found the N+1 queries our own team had been stepping over for a year.","author_name":"Farhana Rahman","author_role":"CTO, Ledgerly","order":0}'
  auth_post /admin/testimonials '{"quote":"Delivered the whole admin panel a week early and left it better documented than the codebase it replaced. Rare combination.","author_name":"Tanvir Ahmed","author_role":"Product Lead, Northwind Studio","order":1}'
  auth_post /admin/testimonials '{"quote":"He pushed back on two of my requirements, and he was right both times. That is worth more than an engineer who just says yes.","author_name":"Marcus Webb","author_role":"Founder, Cadence Health","order":2}'
else
  echo "testimonials already has $existing_testimonials rows; skipping"
fi

echo
echo "--- final counts ---"
echo -n "api-showcases: "; curl -s "$API/api-showcases" | python3 -c 'import sys,json; print(len(json.load(sys.stdin)["data"]))'
echo -n "testimonials:  "; curl -s "$API/testimonials" | python3 -c 'import sys,json; print(len(json.load(sys.stdin)["data"]))'
