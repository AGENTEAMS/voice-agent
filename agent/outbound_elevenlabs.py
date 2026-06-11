"""Place outbound confirmation calls via ElevenLabs Conversational AI (over your Twilio number).

ElevenLabs owns the telephony + the voice agent (מאיה). Before each call we read the
reservation from Supabase and pass customer_name / reservation_time / party_size / reservation_id
as dynamic variables, so the agent greets the right guest from the first word.

SAFETY: the seed phone numbers are FAKE. ALWAYS pass --to with your own / consenting test number.

Setup (.env at projects/final/): ELEVENLABS_API_KEY required. ELEVENLABS_AGENT_ID and
ELEVENLABS_PHONE_NUMBER_ID are optional — they fall back to agent/.provisioned.json,
which provision_elevenlabs.py writes.

Examples:
    python outbound_elevenlabs.py --list                                 # today's pending reservations
    python outbound_elevenlabs.py --reservation <uuid> --to +9725XXXXXXXX
"""
import argparse
import json
import os
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import httpx
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / ".env", override=True)  # .env wins over stale shell vars

SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
SERVICE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
RESTAURANT_ID = os.environ.get("RESTAURANT_ID", "11111111-1111-1111-1111-111111111111")

ELEVEN_API_KEY = os.environ["ELEVENLABS_API_KEY"]

# .provisioned.json (written by provision_elevenlabs.py) WINS over .env — stale env ids
# from previous accounts have already caused calls from the wrong Twilio number.
_prov_path = Path(__file__).resolve().parent / ".provisioned.json"
_prov = json.loads(_prov_path.read_text()) if _prov_path.exists() else {}
ELEVEN_AGENT_ID = _prov.get("agent_id") or os.environ.get("ELEVENLABS_AGENT_ID", "")
ELEVEN_PHONE_NUMBER_ID = _prov.get("phone_number_id") or os.environ.get("ELEVENLABS_PHONE_NUMBER_ID", "")
ELEVEN_OUTBOUND_URL = "https://api.elevenlabs.io/v1/convai/twilio/outbound-call"

TZ = ZoneInfo("Asia/Jerusalem")
_SB = {"apikey": SERVICE_KEY, "Authorization": f"Bearer {SERVICE_KEY}", "Content-Type": "application/json"}

_HOURS_HE = {0: "שתים עשרה", 1: "אחת", 2: "שתיים", 3: "שלוש", 4: "ארבע", 5: "חמש", 6: "שש",
             7: "שבע", 8: "שמונה", 9: "תשע", 10: "עשר", 11: "אחת עשרה"}
_PARTY_HE = {1: "סועד אחד", 2: "שני סועדים", 3: "שלושה סועדים", 4: "ארבעה סועדים",
             5: "חמישה סועדים", 6: "שישה סועדים", 7: "שבעה סועדים", 8: "שמונה סועדים",
             9: "תשעה סועדים", 10: "עשרה סועדים"}


def spoken_time_he(dt) -> str:
    """20:00 → 'שמונה בערב', 21:30 → 'תשע וחצי' — how an Israeli hostess says it."""
    hour12 = _HOURS_HE[dt.hour % 12]
    if dt.minute == 0:
        base = hour12
    elif dt.minute == 30:
        base = f"{hour12} וחצי"
    elif dt.minute == 15:
        base = f"{hour12} ורבע"
    elif dt.minute == 45:
        base = f"רבע ל{_HOURS_HE[(dt.hour + 1) % 12]}"
    else:
        base = f"{hour12} {dt.minute:02d}"
    if dt.minute == 0:  # add daypart only on round hours, keeps it short otherwise
        if 12 <= dt.hour < 17:
            return f"{base} בצהריים"
        if dt.hour >= 17:
            return f"{base} בערב"
        return f"{base} בבוקר"
    return base


def spoken_party_he(n: int) -> str:
    return _PARTY_HE.get(n, f"{n} סועדים")


def todays_pending():
    r = httpx.post(
        f"{SUPABASE_URL}/rest/v1/rpc/todays_pending_reservations",
        json={"p_restaurant_id": RESTAURANT_ID}, headers=_SB, timeout=10,
    )
    r.raise_for_status()
    return r.json()


def reservation_context(reservation_id: str) -> dict:
    """Read the one reservation we're about to call about → dynamic variables for the agent."""
    r = httpx.get(
        f"{SUPABASE_URL}/rest/v1/reservations"
        f"?id=eq.{reservation_id}&select=reserved_for,party_size,customers(name,phone)",
        headers=_SB, timeout=10,
    )
    r.raise_for_status()
    rows = r.json()
    if not rows:
        raise SystemExit(f"Reservation {reservation_id} not found.")
    row = rows[0]
    cust = row.get("customers") or {}
    local_dt = datetime.fromisoformat(row["reserved_for"]).astimezone(TZ)
    now = datetime.now(TZ)
    return {
        "customer_name": cust.get("name", "אורח"),
        "reservation_time": local_dt.strftime("%H:%M"),
        "reservation_time_spoken": spoken_time_he(local_dt),
        "party_size": str(row["party_size"]),
        "party_size_spoken": spoken_party_he(int(row["party_size"])),
        "reservation_id": reservation_id,
        # date/time context for change_reservation, check_availability, schedule_callback
        "today": now.strftime("%Y-%m-%d"),
        "now_local": now.strftime("%Y-%m-%dT%H:%M:%S%z"),
    }


def place_call(reservation_id: str, to_number: str):
    if not ELEVEN_AGENT_ID or not ELEVEN_PHONE_NUMBER_ID:
        raise SystemExit("No agent/phone ids — run provision_elevenlabs.py first "
                         "(or set ELEVENLABS_AGENT_ID / ELEVENLABS_PHONE_NUMBER_ID in .env).")
    dyn = reservation_context(reservation_id)
    print(f"→ {dyn['customer_name']}  {dyn['reservation_time']}  party={dyn['party_size']}")
    r = httpx.post(
        ELEVEN_OUTBOUND_URL,
        headers={"xi-api-key": ELEVEN_API_KEY, "Content-Type": "application/json"},
        json={
            "agent_id": ELEVEN_AGENT_ID,
            "agent_phone_number_id": ELEVEN_PHONE_NUMBER_ID,
            "to_number": to_number,
            "conversation_initiation_client_data": {"dynamic_variables": dyn},
        },
        timeout=20,
    )
    if r.status_code >= 300:
        raise SystemExit(f"ElevenLabs error {r.status_code}: {r.text}")
    body = r.json()
    print(f"Calling {to_number} → conversation {body.get('conversation_id')} (callSid {body.get('callSid')})")
    return body


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--reservation", help="reservation uuid")
    ap.add_argument("--to", help="OVERRIDE phone (use your own number for the POC)")
    ap.add_argument("--list", action="store_true", help="list today's pending reservations")
    args = ap.parse_args()

    if args.list:
        for row in todays_pending():
            print(f"  {row['reservation_id']}  {row['customer_name']:12s}  "
                  f"{row['reserved_for']}  party={row['party_size']}  {row['phone']}")
        return

    if not args.reservation:
        raise SystemExit("Pass --reservation <uuid> (and --to <your number>), or --list.")
    if not args.to:
        raise SystemExit("Refusing to dial the seed (fake) number. Pass --to <your own number>.")
    place_call(args.reservation, args.to)


if __name__ == "__main__":
    main()
