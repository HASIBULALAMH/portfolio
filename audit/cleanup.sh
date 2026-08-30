#!/usr/bin/env bash
# Remove records the audit created, using the real authenticated API rather
# than direct SQL, so the DELETE endpoints get exercised one more time.
set -eu
API=http://127.0.0.1:8000/api

TOKEN=$(curl -s -X POST -H 'Accept: application/json' -H 'Content-Type: application/json' \
  -d '{"email":"info@hasib.com","password":"42862266"}' "$API/login" \
  | python3 -c 'import sys,json; print(json.load(sys.stdin)["data"]["token"])')

auth=(-H "Authorization: Bearer $TOKEN" -H 'Accept: application/json')

# Contact messages created by the audit.
curl -s "${auth[@]}" "$API/admin/messages" \
| python3 -c '
import sys, json, re
rows = json.load(sys.stdin).get("data") or []
for r in rows:
    if re.search(r"Audit Visitor|Reverify|Leak Probe", str(r.get("name",""))):
        print(r["id"])
' | while read -r id; do
  [ -n "$id" ] || continue
  c=$(curl -s -o /dev/null -w '%{http_code}' -X DELETE "${auth[@]}" "$API/admin/messages/$id")
  echo "  DELETE /admin/messages/$id -> $c"
done

# Meeting requests created by the audit.
curl -s "${auth[@]}" "$API/admin/meeting-requests" \
| python3 -c '
import sys, json, re
rows = json.load(sys.stdin).get("data") or []
for r in rows:
    if re.search(r"Meeting Audit|Meeting \d+", str(r.get("name",""))):
        print(r["id"])
' | while read -r id; do
  [ -n "$id" ] || continue
  c=$(curl -s -o /dev/null -w '%{http_code}' -X DELETE "${auth[@]}" "$API/admin/meeting-requests/$id")
  echo "  DELETE /admin/meeting-requests/$id -> $c"
done

echo "--- remaining ---"
echo -n "  messages: "
curl -s "${auth[@]}" "$API/admin/messages" | python3 -c 'import sys,json; d=json.load(sys.stdin).get("data") or []; print(len(d), [r.get("name") for r in d])'
echo -n "  meetings: "
curl -s "${auth[@]}" "$API/admin/meeting-requests" | python3 -c 'import sys,json; d=json.load(sys.stdin).get("data") or []; print(len(d), [r.get("name") for r in d])'

curl -s -o /dev/null -X POST "${auth[@]}" "$API/logout"
