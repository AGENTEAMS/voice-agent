#!/usr/bin/env python3
"""Snapshot read-path RPC response shapes via PostgREST (exactly as the EL tools call them).

Usage: agent/.venv/bin/python supabase/verify_rpc_shapes.py > /tmp/rpc_pre.json
"""
import datetime
import json
import os
import pathlib

from dotenv import load_dotenv
import httpx

ROOT = pathlib.Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")

URL = os.environ["SUPABASE_URL"]
KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
RID = os.environ.get("RESTAURANT_ID", "11111111-1111-1111-1111-111111111111")
H = {"apikey": KEY, "Authorization": f"Bearer {KEY}", "Content-Type": "application/json"}

today = datetime.date.today().isoformat()
out = {}
out["check_availability"] = httpx.post(
    f"{URL}/rest/v1/rpc/check_availability",
    json={"p_restaurant_id": RID, "p_date": today, "p_time": "21:00", "p_party_size": 4},
    headers=H, timeout=15,
).json()
out["todays_pending"] = httpx.post(
    f"{URL}/rest/v1/rpc/todays_pending_reservations",
    json={"p_restaurant_id": RID},
    headers=H, timeout=15,
).json()
print(json.dumps(out, ensure_ascii=False, indent=1, default=str))
