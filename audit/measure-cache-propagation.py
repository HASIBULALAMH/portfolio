#!/usr/bin/env python3
"""How long does an admin change actually take to reach the public page?

The frontend sets `revalidate: 60`, but Next's stale-while-revalidate means the
first request after expiry still serves stale HTML and only *schedules* the
regeneration — the change appears on a later request. This measures the real
delay so the verification harness can wait the right amount instead of guessing.
"""
import json
import subprocess
import sys
import time
import urllib.request

API = "http://127.0.0.1:8000/api"
PUBLIC = "http://localhost:3000"


def get_json(url, token=None, method="GET", payload=None):
    req = urllib.request.Request(url, method=method)
    req.add_header("Accept", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    data = None
    if payload is not None:
        data = json.dumps(payload).encode()
        req.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(req, data) as r:
        return json.load(r)


token = get_json(f"{API}/login", method="POST",
                 payload={"email": "info@hasib.com", "password": "42862266"})["data"]["token"]

sections = get_json(f"{API}/section-visibility")["data"]
target = sys.argv[1] if len(sys.argv) > 1 else "testimonials"
current = next(s for s in sections if s["section_key"] == target)["is_visible"]
desired = not current

get_json(f"{API}/admin/section-visibility", token=token, method="PUT",
         payload={"sections": [
             {"id": s["id"],
              "is_visible": desired if s["section_key"] == target else s["is_visible"],
              "order": s["order"]}
             for s in sections]})

print(f"set {target}.is_visible = {desired} at t=0; polling public page...")

marker = f'id="{target}"'
start = time.monotonic()
deadline = start + 300

while time.monotonic() < deadline:
    html = subprocess.run(["curl", "-s", PUBLIC], capture_output=True, text=True).stdout
    present = marker in html
    elapsed = time.monotonic() - start
    if present != current:
        print(f"  propagated after {elapsed:.1f}s (section present={present})")
        break
    print(f"  t={elapsed:5.1f}s  still stale (present={present})")
    time.sleep(5)
else:
    print("  NEVER propagated within 300s")
