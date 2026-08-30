#!/usr/bin/env bash
# Direct API audit: public endpoints, auth enforcement, validation, rate limit.
set -u
API=http://127.0.0.1:8000/api
pass=0; fail=0

check() { # check <desc> <expected> <actual>
  if [ "$2" = "$3" ]; then printf '  OK   %-52s %s\n' "$1" "$3"; pass=$((pass+1))
  else printf '  FAIL %-52s expected %s got %s\n' "$1" "$2" "$3"; fail=$((fail+1)); fi
}

code() { curl -s -o /dev/null -w '%{http_code}' "$@"; }

echo "=== 1. Public GET endpoints (expect 200) ==="
for p in settings nav-items hero about skills timeline projects api-showcases testimonials contact-info; do
  check "GET /$p" 200 "$(code "$API/$p")"
done

echo
echo "=== 2. Admin endpoints WITHOUT a token (expect 401) ==="
for p in admin/settings admin/projects admin/skills admin/messages admin/meeting-requests admin/me \
         admin/nav-items admin/hero admin/about admin/timeline-items admin/api-showcases \
         admin/testimonials admin/contact-info admin/skill-categories; do
  check "GET /$p unauthenticated" 401 "$(code "$API/$p")"
done

echo
echo "=== 3. Admin writes WITHOUT a token (expect 401) ==="
check "POST /admin/projects unauth" 401 "$(code -X POST -H 'Accept: application/json' "$API/admin/projects")"
check "PUT /admin/settings unauth"  401 "$(code -X PUT  -H 'Accept: application/json' "$API/admin/settings")"
check "DELETE /admin/projects/1 unauth" 401 "$(code -X DELETE -H 'Accept: application/json' "$API/admin/projects/1")"
check "POST /admin/upload unauth"   401 "$(code -X POST -H 'Accept: application/json' "$API/admin/upload")"

echo
echo "=== 4. Login validation ==="
check "POST /login empty body"      422 "$(code -X POST -H 'Accept: application/json' -H 'Content-Type: application/json' -d '{}' "$API/login")"
check "POST /login bad password"    401 "$(code -X POST -H 'Accept: application/json' -H 'Content-Type: application/json' -d '{"email":"info@hasib.com","password":"nope"}' "$API/login")"
check "POST /login malformed email" 422 "$(code -X POST -H 'Accept: application/json' -H 'Content-Type: application/json' -d '{"email":"notanemail","password":"whatever"}' "$API/login")"

echo
echo "=== 5. Public form validation (expect 422) ==="
check "POST /contact-messages empty" 422 "$(code -X POST -H 'Accept: application/json' -H 'Content-Type: application/json' -d '{}' "$API/contact-messages")"
check "POST /meeting-requests empty" 422 "$(code -X POST -H 'Accept: application/json' -H 'Content-Type: application/json' -d '{}' "$API/meeting-requests")"

echo
echo "=== 6. Unknown routes / bad ids ==="
check "GET /projects/nonexistent-slug"  404 "$(code "$API/projects/nonexistent-slug")"
check "GET /no-such-endpoint"           404 "$(code "$API/no-such-endpoint")"

echo
echo "=== 7. Authenticated happy path ==="
TOKEN=$(curl -s -X POST -H 'Accept: application/json' -H 'Content-Type: application/json' \
  -d '{"email":"info@hasib.com","password":"42862266"}' "$API/login" \
  | python3 -c 'import sys,json; print(json.load(sys.stdin).get("data",{}).get("token",""))' 2>/dev/null)

if [ -z "$TOKEN" ]; then
  echo "  FAIL could not obtain a token; skipping authenticated checks"
  fail=$((fail+1))
else
  echo "  token acquired (${#TOKEN} chars)"
  for p in admin/me admin/settings admin/projects admin/skills admin/skill-categories \
           admin/messages admin/meeting-requests admin/nav-items admin/hero admin/about \
           admin/timeline-items admin/api-showcases admin/testimonials admin/contact-info; do
    check "GET /$p with token" 200 "$(code -H "Authorization: Bearer $TOKEN" -H 'Accept: application/json' "$API/$p")"
  done

  echo
  echo "=== 8. Validation while authenticated (expect 422) ==="
  check "POST /admin/projects empty" 422 "$(code -X POST -H "Authorization: Bearer $TOKEN" -H 'Accept: application/json' -H 'Content-Type: application/json' -d '{}' "$API/admin/projects")"
  check "POST /admin/skills empty"   422 "$(code -X POST -H "Authorization: Bearer $TOKEN" -H 'Accept: application/json' -H 'Content-Type: application/json' -d '{}' "$API/admin/skills")"

  echo
  echo "=== 9. Bad token (expect 401) ==="
  check "GET /admin/me with junk token" 401 "$(code -H 'Authorization: Bearer not-a-real-token' -H 'Accept: application/json' "$API/admin/me")"

  echo
  echo "=== 10. Logout invalidates the token ==="
  check "POST /logout" 200 "$(code -X POST -H "Authorization: Bearer $TOKEN" -H 'Accept: application/json' "$API/logout")"
  check "GET /admin/me after logout" 401 "$(code -H "Authorization: Bearer $TOKEN" -H 'Accept: application/json' "$API/admin/me")"
fi

echo
echo "=== 11. Rate limit on public writes (throttle:10,1 -> expect a 429) ==="
got429=no
for i in $(seq 1 14); do
  c=$(code -X POST -H 'Accept: application/json' -H 'Content-Type: application/json' -d '{}' "$API/contact-messages")
  [ "$c" = "429" ] && got429=yes && echo "  429 received on request $i" && break
done
check "public writes are rate limited" yes "$got429"

echo
echo "==================== TOTAL: $pass passed, $fail failed ===================="
[ "$fail" -eq 0 ] || exit 1
