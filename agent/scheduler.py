"""Process due scheduled_calls → place the ElevenLabs callback calls.

One row in scheduled_calls = one future outbound call (written in-call by schedule_callback).
This is the executor: find pending rows whose time arrived, dial each, mark done/failed.

POC safety: seed phone numbers are FAKE, so every dial is redirected to --to (your number).
In production --to goes away and the customer's real phone is used.

    python scheduler.py --to +9725XXXXXXXX             # one-shot: process everything due now
    python scheduler.py --to +9725XXXXXXXX --watch     # poll every 20s (local demo loop)

Hosting later (Vercel): this exact logic as an API route triggered by Vercel Cron
(vercel.json: {"crons": [{"path": "/api/run-scheduler", "schedule": "*/5 * * * *"}]}).
"""
import argparse
import time
from datetime import datetime
from zoneinfo import ZoneInfo

import httpx

from outbound_elevenlabs import SUPABASE_URL, _SB, place_call

TZ = ZoneInfo("Asia/Jerusalem")


def due_rows(c: httpx.Client) -> list[dict]:
    now = datetime.now(TZ).isoformat()
    r = c.get(f"{SUPABASE_URL}/rest/v1/scheduled_calls", headers=_SB, params={
        "status": "eq.pending",
        "scheduled_for": f"lte.{now}",   # params= encodes the +03:00 offset correctly (%2B)
        "select": "id,reservation_id,kind,scheduled_for,reason,attempts",
        "order": "scheduled_for",
    })
    r.raise_for_status()
    return r.json()


def set_status(c: httpx.Client, row_id: str, status: str, attempts: int | None = None):
    body = {"status": status}
    if attempts is not None:
        body["attempts"] = attempts
    c.patch(f"{SUPABASE_URL}/rest/v1/scheduled_calls?id=eq.{row_id}", headers=_SB, json=body).raise_for_status()


def process_once(to_number: str) -> int:
    with httpx.Client(timeout=20) as c:
        rows = due_rows(c)
        if not rows:
            print(f"[{datetime.now(TZ):%H:%M:%S}] nothing due.")
            return 0
        for row in rows:
            rid = row["id"]
            print(f"[{datetime.now(TZ):%H:%M:%S}] due: {row['kind']} for reservation {row['reservation_id']} "
                  f"(scheduled {row['scheduled_for']}, reason={row.get('reason')})")
            if not row["reservation_id"]:
                print("  no reservation attached — marking failed")
                set_status(c, rid, "failed", row["attempts"] + 1)
                continue
            set_status(c, rid, "in_progress", row["attempts"] + 1)
            try:
                place_call(row["reservation_id"], to_number)
                set_status(c, rid, "done")
                print("  → call placed, row marked done")
            except SystemExit as e:  # place_call raises SystemExit on API errors
                set_status(c, rid, "failed")
                print(f"  → FAILED: {e}")
        return len(rows)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--to", required=True, help="POC override target (your own number, E.164)")
    ap.add_argument("--watch", action="store_true", help="poll every 20s until Ctrl-C")
    args = ap.parse_args()

    if not args.watch:
        process_once(args.to)
        return
    print("watching scheduled_calls (Ctrl-C to stop)…")
    while True:
        process_once(args.to)
        time.sleep(20)


if __name__ == "__main__":
    main()
