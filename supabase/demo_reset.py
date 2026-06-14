"""One-command demo slate — run right before a demo/test session.

Calls the authoritative public.demo_reset() RPC (single source of truth, defined in
supabase/migrations/0005_demo_reset.sql), then verifies the slate. Pure REST with the
service key — no SUPABASE_DB_URL needed.

    agent/.venv/bin/python supabase/demo_reset.py
"""
import os
import sys
from datetime import date
from pathlib import Path

import httpx
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env")
RID = os.environ.get("RESTAURANT_ID", "11111111-1111-1111-1111-111111111111")
TARGET = "+972505550099"   # demo target row (fake number; no real number is seeded post-demo)


def main():
    url = os.environ["SUPABASE_URL"].rstrip("/")
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    h = {"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"}

    # ── reset ──
    r = httpx.post(f"{url}/rest/v1/rpc/demo_reset", headers=h, json={}, timeout=30)
    r.raise_for_status()
    print("demo_reset() applied.")

    # ── verify ──
    pend = httpx.post(f"{url}/rest/v1/rpc/todays_pending_reservations", headers=h,
                      json={"p_restaurant_id": RID}, timeout=20).json()
    avail = httpx.get(f"{url}/rest/v1/availability",
                      params={"select": "time_slot,available",
                              "date": f"eq.{date.today().isoformat()}",
                              "order": "time_slot"}, headers=h, timeout=20).json()
    av = {a["time_slot"][:5]: a["available"] for a in avail}

    print("\n── demo slate ──────────────────────────────────────")
    ok = True
    callable_rows = [p for p in pend if p.get("phone") == TARGET]
    one_callable = len(callable_rows) == 1
    ok &= one_callable
    print(f"  pending rows: {len(pend)} (varied board) | demo target rows: {len(callable_rows)}  → "
          f"{'OK — exactly one demo target row' if one_callable else '!! expected exactly 1 pending at ' + TARGET}")
    checks = [("20:00", av.get("20:00", 0) >= 8, "room for change-to-eight"),
              ("21:00", av.get("21:00", 1) == 0, "FULL (negotiation prop)"),
              ("21:30", av.get("21:30", 0) > 0, "room for the offer")]
    for slot, good, why in checks:
        ok &= good
        print(f"  {slot} avail={av.get(slot, '?'):<3} {'OK' if good else '!!'}  — {why}")
    print("────────────────────────────────────────────────────")
    print("READY ✅" if ok else "SLATE HAS ISSUES — check above ⚠️")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
