"""Refresh demo data so reservations + availability are dated TODAY (Asia/Jerusalem).

Why: check_availability / change_reservation match on date. If the seed ran on a past day,
they return no_such_slot even though rows exist (the date-drift trap). Run me before every
test/demo session.

Two modes, picked automatically:
  1. SUPABASE_DB_URL set (postgresql://...)  → re-run seed.sql wholesale (full clean reset).
  2. Otherwise                                → REST date-shift: move reservations.reserved_for
     and availability.date to today via PostgREST with the service key. Statuses are kept.

    python reseed.py            # refresh dates to today
    python reseed.py --clean    # also wipe call logs, scheduled calls, and decided reservations
"""
import argparse
import os
import sys
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import httpx
from dotenv import load_dotenv

HERE = Path(__file__).resolve().parent
load_dotenv(HERE.parent / ".env", override=True)

TZ = ZoneInfo("Asia/Jerusalem")
RID = os.environ.get("RESTAURANT_ID", "11111111-1111-1111-1111-111111111111")


def full_reseed(db_url: str):
    import psycopg  # pip install "psycopg[binary]"
    sql = (HERE / "seed.sql").read_text()
    with psycopg.connect(db_url, autocommit=True) as conn:
        conn.execute(sql)
        n = conn.execute(
            "select count(*) from reservations where reserved_for::date = (now() at time zone 'Asia/Jerusalem')::date"
        ).fetchone()[0]
    print(f"Full reseed done — {n} reservations dated today.")


def rest_date_shift():
    base = os.environ["SUPABASE_URL"].rstrip("/")
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    h = {"apikey": key, "Authorization": f"Bearer {key}",
         "Content-Type": "application/json", "Prefer": "return=minimal"}
    today = datetime.now(TZ).date()

    with httpx.Client(timeout=20) as c:
        r = c.get(f"{base}/rest/v1/reservations?select=id,reserved_for&restaurant_id=eq.{RID}", headers=h)
        r.raise_for_status()
        moved = 0
        for row in r.json():
            local = datetime.fromisoformat(row["reserved_for"]).astimezone(TZ)
            if local.date() != today:
                new_local = local.replace(year=today.year, month=today.month, day=today.day)
                pr = c.patch(f"{base}/rest/v1/reservations?id=eq.{row['id']}",
                             headers=h, json={"reserved_for": new_local.isoformat()})
                pr.raise_for_status()
                moved += 1

        r = c.get(f"{base}/rest/v1/availability?select=id,date&restaurant_id=eq.{RID}", headers=h)
        r.raise_for_status()
        moved_av = 0
        for row in r.json():
            if row["date"] != str(today):
                pr = c.patch(f"{base}/rest/v1/availability?id=eq.{row['id']}",
                             headers=h, json={"date": str(today)})
                pr.raise_for_status()
                moved_av += 1

    print(f"REST date-shift done — {moved} reservations + {moved_av} availability rows → {today}. "
          f"(Statuses untouched; for a full clean reset set SUPABASE_DB_URL and re-run.)")


def rest_clean():
    """Demo hygiene: drop call logs, scheduled calls, and non-pending reservations."""
    base = os.environ["SUPABASE_URL"].rstrip("/")
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    h = {"apikey": key, "Authorization": f"Bearer {key}", "Prefer": "return=representation"}
    with httpx.Client(timeout=20) as c:
        n_att = len(c.delete(f"{base}/rest/v1/call_attempts?started_at=gte.1970-01-01", headers=h).json())
        n_sch = len(c.delete(f"{base}/rest/v1/scheduled_calls?restaurant_id=eq.{RID}", headers=h).json())
        n_res = len(c.delete(f"{base}/rest/v1/reservations?restaurant_id=eq.{RID}&status=neq.pending", headers=h).json())
    print(f"cleaned — {n_att} call_attempts, {n_sch} scheduled_calls, {n_res} decided reservations deleted.")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--clean", action="store_true", help="wipe logs + scheduled calls + decided reservations first")
    args = ap.parse_args()
    if args.clean:
        rest_clean()
    db_url = (os.environ.get("SUPABASE_DB_URL") or "").strip()
    if db_url.startswith(("postgres://", "postgresql://")):
        full_reseed(db_url)
    else:
        if db_url:
            print("SUPABASE_DB_URL doesn't look like a postgres URI — falling back to REST date-shift.")
        rest_date_shift()
