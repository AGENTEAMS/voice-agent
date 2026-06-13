"""One-command demo slate — run this right before a demo/test session.

Does the whole dance deterministically:
  1. Full clean reset via reseed.py (needs SUPABASE_DB_URL = Session-pooler URI in .env;
     falls back to REST date-shift with a warning if missing).
  2. Creates the two תומר test reservations (stage CTA + n8n batch numbers).
  3. Verifies the slate: both test rows pending, 21:00 FULL, 20:00 + 21:30 have room.

    agent/.venv/bin/python supabase/demo_reset.py

Props (21:00 FULL → negotiation, 20:00 room → change-to-eight) are baked into seed.sql,
so they survive every full reset — no manual `booked` tweaks needed anymore.
"""
import os
import subprocess
import sys
from pathlib import Path

import httpx
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env")
PY = sys.executable
AGENT = ROOT / "agent"
RID = "11111111-1111-1111-1111-111111111111"

TEST_ROWS = [
    ("תומר אלזם", "+972585121998", "20:30", "4"),  # stage CTA / single-call target
    ("תומר אלזם", "+972525898552", "19:00", "2"),  # n8n batch original target
]


def run(args):
    print(f"\n$ {' '.join(str(a) for a in args)}")
    r = subprocess.run([PY, *args], cwd=ROOT)
    if r.returncode != 0:
        sys.exit(f"step failed: {args}")


def main():
    run([ROOT / "supabase" / "reseed.py", "--clean"])
    for name, phone, t, party in TEST_ROWS:
        run([AGENT / "make_reservation.py", "--name", name, "--phone", phone, "--time", t, "--party", party])

    # ── verify ──────────────────────────────────────────────────────────────
    url = os.environ["SUPABASE_URL"].rstrip("/")
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    h = {"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"}
    pend = httpx.post(f"{url}/rest/v1/rpc/todays_pending_reservations", headers=h,
                      json={"p_restaurant_id": RID}).json()
    avail = httpx.get(f"{url}/rest/v1/availability",
                      params={"select": "time_slot,available", "date": "eq."
                              + __import__("datetime").date.today().isoformat(),
                              "order": "time_slot"}, headers=h).json()
    av = {a["time_slot"][:5]: a["available"] for a in avail}

    print("\n── demo slate ──────────────────────────────────────")
    ok = True
    for _, phone, _, _ in TEST_ROWS:
        rows = [x for x in pend if x.get("phone") == phone]
        flag = "OK" if len(rows) == 1 else f"!! {len(rows)} rows"
        ok &= len(rows) == 1
        print(f"  {phone:16} pending: {flag}")
    checks = [("20:00", av.get("20:00", 0) > 0, "room for change-to-eight"),
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
