"""Create (or refresh) a demo reservation for a REAL person — so מאיה calls you by your name.

Upserts the customer by phone, cancels any of their older pending reservations today,
and inserts a fresh pending reservation for TODAY at the given time.

    python make_reservation.py --name "תומר" --phone +972525898552 --time 20:00 --party 2
"""
import argparse
import os
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import httpx
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / ".env", override=True)

SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
RID = os.environ.get("RESTAURANT_ID", "11111111-1111-1111-1111-111111111111")
TZ = ZoneInfo("Asia/Jerusalem")
H = {"apikey": KEY, "Authorization": f"Bearer {KEY}", "Content-Type": "application/json",
     "Prefer": "return=representation"}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--name", required=True)
    ap.add_argument("--phone", required=True, help="E.164")
    ap.add_argument("--time", default="20:00", help="HH:MM today, Asia/Jerusalem")
    ap.add_argument("--party", type=int, default=2)
    args = ap.parse_args()

    hh, mm = map(int, args.time.split(":"))
    reserved_for = datetime.now(TZ).replace(hour=hh, minute=mm, second=0, microsecond=0)

    with httpx.Client(timeout=20) as c:
        r = c.get(f"{SUPABASE_URL}/rest/v1/customers?phone=eq.{args.phone}&restaurant_id=eq.{RID}&select=id,name", headers=H)
        r.raise_for_status()
        rows = r.json()
        if rows:
            cust_id = rows[0]["id"]
            if rows[0]["name"] != args.name:
                c.patch(f"{SUPABASE_URL}/rest/v1/customers?id=eq.{cust_id}", headers=H, json={"name": args.name}).raise_for_status()
        else:
            r = c.post(f"{SUPABASE_URL}/rest/v1/customers", headers=H,
                       json={"restaurant_id": RID, "name": args.name, "phone": args.phone})
            r.raise_for_status()
            cust_id = r.json()[0]["id"]

        # avoid duplicate pendings for the same person today
        today0 = datetime.now(TZ).replace(hour=0, minute=0, second=0, microsecond=0)
        c.patch(f"{SUPABASE_URL}/rest/v1/reservations"
                f"?customer_id=eq.{cust_id}&status=eq.pending&reserved_for=gte.{today0.isoformat()}",
                headers=H, json={"status": "cancelled"})

        r = c.post(f"{SUPABASE_URL}/rest/v1/reservations", headers=H, json={
            "restaurant_id": RID, "customer_id": cust_id,
            "reserved_for": reserved_for.isoformat(), "party_size": args.party,
            "status": "pending", "source": "manual",
        })
        r.raise_for_status()
        res = r.json()[0]

    print(f"reservation_id: {res['id']}")
    print(f"  {args.name}  {args.time}  party={args.party}  {args.phone}")
    print(f"\nDial it:\n  python call_and_verify.py --reservation {res['id']} --to {args.phone}")


if __name__ == "__main__":
    main()
