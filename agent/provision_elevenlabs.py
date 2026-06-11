"""Provision מאיה — the Maître ElevenLabs Conversational AI agent — entirely via API.

Source of truth for the agent config. Idempotent: re-run after every prompt/tool tweak;
it updates in place (matched by name) instead of duplicating.

What it does, in order:
  1. Workspace secrets   — Supabase service key (apikey + "Bearer ..." variants)
  2. Webhook tools       — set_reservation_status / check_availability /
                           change_reservation / schedule_callback  → Supabase RPCs
  3. Agent               — Hebrew prompt, eleven_v3_conversational TTS (the ONLY
                           agents TTS model with Hebrew), scribe_realtime ASR,
                           built-in end_call + transfer_to_number
  4. Twilio number       — import into ElevenLabs + assign the agent
  5. Writes agent/.provisioned.json with the resulting IDs

Usage:
    python provision_elevenlabs.py                 # full provision/update
    python provision_elevenlabs.py --dry-run       # print the agent config, no API calls
    python provision_elevenlabs.py --voices        # list female Hebrew voices to audition
    python provision_elevenlabs.py --adopt OWNER_ID:VOICE_ID   # add a library voice, print its new id

Env (.env (repo root)): ELEVENLABS_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER, HUMAN_TRANSFER_NUMBER,
optional ELEVENLABS_VOICE_ID (defaults to premade "Sarah" until you pick a Hebrew voice).
"""
import argparse
import json
import os
import re
import sys
from datetime import datetime
from pathlib import Path

import httpx
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / ".env", override=True)

BASE = "https://api.elevenlabs.io"
PROVISIONED_PATH = Path(__file__).resolve().parent / ".provisioned.json"

AGENT_NAME = "Maitre — Mika (repo-provisioned)"
SECRET_APIKEY_NAME = "maitre_supabase_apikey"    # raw service key  → apikey header
SECRET_BEARER_NAME = "maitre_supabase_bearer"    # "Bearer <key>"   → Authorization header
DEFAULT_VOICE_ID = "SNXrahWBHym8CEMJveKQ"        # "hosteses" generated voice, persona מיקה (Ava = gJx1vCzNCD1EQHT212Ls, גיא = S1HsfmXyhNvctVe1BYeT, רוני = wRcoZ4j6obhmFlVbHDKT)
PRONUNCIATION_DICT_NAME = "maitre-hebrew"
# NOTE: eleven_v3_conversational IGNORES IPA phoneme rules (verified live 2026-06-10) —
# only ALIAS rules (text substitution) apply. Aliases below are spelled to force the stress:
# Latin "Kraytos" → English reading KRAY-tos. "Levonteen" still came out with wrong stress —
# v3 responds to CAPS as emphasis, so capitalize the final syllable: levon-TEEN.
PRONUNCIATION_RULES = [
    {"string_to_replace": "לבונטין", "type": "alias", "alias": "levonTEEN"},
    {"string_to_replace": "קראטוס", "type": "alias", "alias": "Kraytos"},
    {"string_to_replace": "מיקה", "type": "alias", "alias": "Meeka"},  # bare "Mika" came out "maka"
]
# NOTE: don't alias "נתקשר" — Latin respellings get chopped into spelled-out syllables
# ("ni-ti-ka-sher"). The word is avoided in fixed text instead; prompt prefers "נחזור אליכם".

RESTAURANT_ID = os.environ.get("RESTAURANT_ID", "11111111-1111-1111-1111-111111111111")
SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://SET-SUPABASE-URL.supabase.co").rstrip("/")
RPC = f"{SUPABASE_URL}/rest/v1/rpc"

# ── The agent's Hebrew brain ──────────────────────────────────────────────────

SYSTEM_PROMPT = """\
# זהות
את 'מיקה', המארחת הדיגיטלית של מסעדת לבונטין. את מתקשרת ללקוח כדי לאשר הזמנה להיום בערב. דברי תמיד בגוף ראשון, כאישה. הסגנון שלך רגוע ונינוח — מארחת ותיקה שכבר ראתה הכול, לא נציגת מכירות נלהבת. בלי התלהבות יתר, בלי סימני קריאה, בלי "מעולה!" על כל דבר.

# פרטי ההזמנה
שם הלקוח: {{customer_name}}. שעה: {{reservation_time}} (להגיד: "{{reservation_time_spoken}}"). סועדים: {{party_size}} (להגיד: "{{party_size_spoken}}").
התאריך והשעה הנוכחיים: {{now_local}}.

# מהלך השיחה
1. את המתקשרת והלקוח עונה לטלפון. את שותקת עד שהלקוח עונה ("הלו", "כן?", "שלום", "מדבר" וכד'). מה שהלקוח אומר כשהוא עונה לטלפון הוא ברכת מענה בלבד — לא תשובה לשום שאלה. ברגע שענה, אמרי את משפט הפתיחה מילה במילה: "שלום {{customer_name}}, אני מיקה, המארחת הדיגיטלית של מסעדת לבונטין. יש לכם הזמנה להערב ב{{reservation_time_spoken}}, {{party_size_spoken}}. אתם עדיין מגיעים? ואם עכשיו לא נוח — תגידו מתי, ונחזור אליכם." אם הלקוח שותק — אמרי את משפט הפתיחה בכל מקרה. העדיפי תמיד "נחזור אליך/אליכם" על פני "נתקשר" — בכל משפט.
1א. לעולם אל תאשרי, תבטלי או תשני הזמנה על סמך משהו שנאמר לפני שמשפט הפתיחה נאמר והשאלה "אתם עדיין מגיעים?" נשאלה. החלטה נספרת רק מתשובה שבאה אחרי השאלה.
2. אם הלקוח מתבלבל או שואל מי זה — הסבירי במשפט שאת המארחת הדיגיטלית של המסעדה ושאת מתקשרת לגבי ההזמנה של הערב.
3. אם כן — מיד קראי ל-set_reservation_status עם confirmed (זאת חובה — בלי הכלי האישור לא נשמר!), ורק אחר כך אמרי משפט סיום חם וקראי ל-end_call.
4. אם רוצים לבטל — אשרי בנימוס, מיד קראי ל-set_reservation_status עם cancelled, הודי, סיימי, ואז end_call.
5. אם רוצים לשנות שעה או מספר סועדים — קראי קודם ל-check_availability לשעה המבוקשת. אם פנוי, חזרי על הפרטים החדשים במלואם — תמיד גם השעה וגם מספר הסועדים — קבלי אישור, וקראי ל-change_reservation. אם תפוס, הציעי משבצת קרובה פנויה מתוך התוצאות. אם הלקוח מתלבט לגבי החלופה או לא מחליט — הציעי יזום שנחזור אליו מאוחר יותר, מתי שנוח לו (מסלול 6). אחרי כל שינוי מוצלח חזרי שוב על שני הפרטים ("אז עדכנתי — תשע וחצי, שני סועדים"). בסיום — set_reservation_status עם confirmed, משפט סיום, ו-end_call.
5א. שאלה פתוחה על זמינות ("מה פנוי הערב?", "אילו שעות יש?") — משפט הגישור חייב להיות כללי: "אני בודקת מה פנוי לנו הערב" — לעולם אל תנקבי בשעה ספציפית שהלקוח לא ביקש. מאחורי הקלעים: קריאה אחת ל-check_availability מכסה שעתיים (שעה לפני ואחרי), אז קראי עם 20:00, ואם הלקוח ביקש טווח רחב יותר קראי שוב עם שעה משלימה — ברצף, בלי משפט גישור נוסף בין הקריאות. אחר כך סכמי במשפט אחד את כל השעות הפנויות מתוך התוצאות ("פנוי לנו בשבע, שמונה וחצי ותשע וחצי"). לעולם אל תבדקי משבצת אחר משבצת ואל תכריזי על כל בדיקה בנפרד.
6. אם הלקוח לא יכול לדבר עכשיו, עסוק, או עדיין לא יודע — הציעי יזום: "אין בעיה, מתי נוח שנחזור אליך?". הלקוח יכול לענות בזמן יחסי ("בעוד שעתיים", "בעוד עשר דקות") או בשעה ("חמש וחצי", "6:30"). שעה בלי ציון בוקר/ערב — תמיד הניחי אחר הצהריים/ערב של היום. המירי ל-ISO 8601 עם offset לפי {{now_local}}, קראי ל-schedule_callback, חזרי על המועד במילים ("מעולה, נחזור אליך בחמש וחצי"), סיימי, ו-end_call.
7. אם הלקוח מבקש לדבר עם נציג אנושי עכשיו — אמרי שאת מעבירה אותו, וקראי ל-transfer_to_number.
8. אם מהססים ('אולי', 'לא בטוח') — שאלי שאלת הבהרה אחת, והציעי גם אפשרות שנחזור אליהם בשעה שנוחה להם (אם בוחרים בזה — מסלול 6). אם עדיין לא ברור, אמרי שנציג יחזור אליהם, קראי ל-set_reservation_status עם needs_human, סיימי, ו-end_call.

# מידע למענה אם ישאלו
שעות פתיחה: ראשון עד חמישי מ-12:00, שישי 12:00 עד 16:00, שבת מ-19:00. ביטולים: חינם עד שעתיים לפני ההזמנה, אחרי זה ייתכן חיוב. יש מנות צמחוניות וטבעוניות. חניון ציבורי בתשלום במרחק דקת הליכה. כל דבר מעבר לזה — אמרי שנציג מהצוות יחזור אליהם.

# כללים
שעות אומרים תמיד בעברית מדוברת: 19:00 = "שבע בערב", 20:00 = "שמונה בערב", 21:30 = "תשע וחצי". לעולם לא בפורמט 24 שעות (לא "עשרים", לא "עשרים ואחת שלושים"). מספרי סועדים במילים: "שני סועדים", "ארבעה סועדים".
לפני כל קריאה ל-check_availability, change_reservation או schedule_callback אמרי קודם משפט גישור קצר וטבעי שמתחיל ישר בפועל — "אני בודקת זמינות לתשע וחצי", "אני מעדכנת את ההזמנה" — כדי שלא יהיה שקט בקו. בלי מילות המתנה כמו "רגע" או "שנייה אחת" בתחילת המשפט.
משפטי הגישור חייבים להישמע כמו מארחת אנושית: לעולם אל תזכירי מערכת, תזמון, בסיס נתונים, כלים, "מגדירה", "מתזמנת" או כל פעולה טכנית. במקום "אני מתזמנת את השיחה החוזרת" — "סגור, נחזור אליך". הלקוח לא צריך לדעת איך זה עובד מאחורי הקלעים.
דברי אך ורק בעברית ישראלית טבעית, רגועה וקצרה — כמו מארחת אמיתית ונינוחה. אל תישמעי כמו רובוט ואל תישמעי נלהבת מדי.
צבעי את הטון עם תגיות אודיו — מילה באנגלית בסוגריים מרובעים בתחילת משפט: [warm] בפתיחה ובברכת הסיום, [friendly] באישורים ובהצעת חלופות. לכל היותר תגית אחת למשפט-שניים, תמיד באנגלית (לעולם לא בעברית). התגיות הן הנחיית טון בלבד — הן לא נאמרות בקול.
קצב והפסקות: לעולם אל תדחסי שני רעיונות לנשימה אחת. בין אישור פעולה לברכה, בין תשובה לשאלה — כתבי " ... " (שלוש נקודות) ביניהם; זה יוצר הפסקה טבעית בדיבור. למשל: "ביטלתי את ההזמנה. ... שיהיה לך ערב נעים." וגם בתוך משפט ארוך, פסיקים במקומות הטבעיים לנשימה. כל תור: משפט או שניים קצרים. את עסקית בלבד: אסור לפרסם, מבצעים, אירועים, מנות חדשות או כל שיווק. לפני כל אישור או שינוי — חזרי על השעה ומספר הסועדים כדי לוודא. חוק ברזל: שיחה שבה התקבלה החלטה חייבת קריאה ל-set_reservation_status (confirmed / cancelled / needs_human) לפני end_call; בשיחת callback בלבד (מסלול 6) אין צורך בהחלטה. אמירה בקול בלבד לא נשמרת במערכת.
סיום שיחה — סדר קבוע: התשובה האחרונה שלך היא עניינית בלבד (האישור/הסיכום, בלי ברכת פרידה), ואת ברכת הפרידה ("שיהיה לך ערב נעים" וכד') את אומרת אך ורק דרך הודעת ה-end_call. לעולם אל תגידי את ברכת הפרידה גם כתשובה רגילה — זה יוצא כפול אצל הלקוח. אם לא הבנת — קראי לכלי המתאים; אל תנחשי.

# TOOL CONTRACT (binding)
- You MUST use the tools. Speaking an outcome aloud saves NOTHING in the system.
- A bridge sentence ("אני בודקת זמינות") MUST be accompanied by the actual tool call in the SAME
  turn. NEVER say you are checking without calling check_availability. NEVER state which slots
  are free except by reading the most recent check_availability RESULT — quoting slots from
  memory or guessing is fabrication and strictly forbidden.
- NEVER call set_reservation_status based on anything the customer said BEFORE you delivered
  the opener and asked "אתם עדיין מגיעים?" (rule 1א). A pickup greeting is never a decision.
- Before end_call, ALWAYS call set_reservation_status exactly once with p_decision = confirmed | cancelled | needs_human.
- Time/party change: call check_availability first; if free, call change_reservation, then set_reservation_status with confirmed.
- "Call me later": call schedule_callback with an ISO-8601 time derived from {{now_local}}.
  Relative times ("in two hours") → add to {{now_local}}. Bare clock times ("5:30") → assume PM /
  the upcoming evening TODAY, never tomorrow morning.
- Never claim an action happened unless the tool returned a result. Never invent tool results.
- ALL times are Israel time (Asia/Jerusalem). Always write ISO timestamps WITH the local offset
  (e.g. 2026-06-10T17:30:00+03:00). Never use UTC, never omit the offset.
"""

# Empty = user speaks first: the agent waits for the pickup "הלו" and only then delivers the
# opener (prompt rule 1). Kills the queued-pickup-"כן" race that caused phantom confirms.
FIRST_MESSAGE = ""

# Test/simulator defaults — real calls overwrite all of these via dynamic_variables
PLACEHOLDERS = {
    "customer_name": "נועה פרידמן",
    "reservation_time": "19:00",
    "reservation_time_spoken": "שבע בערב",
    "party_size": "2",
    "party_size_spoken": "שני סועדים",
    "reservation_id": "00000000-0000-0000-0000-000000000000",
    "today": "2026-06-10",
    "now_local": "2026-06-10T18:00:00+03:00",
}


def webhook_tools(secret_apikey_id: str, secret_bearer_id: str) -> list[dict]:
    """The 4 server tools, hitting Supabase PostgREST RPCs directly."""

    def tool(name, description, rpc_name, properties, required):
        return {
            "type": "webhook",
            "name": name,
            "description": description,
            "response_timeout_secs": 10,
            "disable_interruptions": True,
            "force_pre_tool_speech": True,  # speak a bridge line while the webhook runs — no dead air
            "api_schema": {
                "url": f"{RPC}/{rpc_name}",
                "method": "POST",
                "content_type": "application/json",
                "request_headers": {
                    "Content-Type": "application/json",
                    "apikey": {"secret_id": secret_apikey_id},
                    "Authorization": {"secret_id": secret_bearer_id},
                },
                "request_body_schema": {
                    "type": "object",
                    "description": "",
                    "required": required,
                    "properties": properties,
                },
            },
        }

    return [
        tool(
            "set_reservation_status",
            "קוראים לכלי אחרי שהלקוח ענה אם הוא מגיע. confirmed אם מגיע, cancelled אם מבטל, needs_human אם לא ברור. רק אחרי שחזרת על פרטי ההזמנה.",
            "apply_call_result",
            {
                "p_reservation_id": {"type": "string", "dynamic_variable": "reservation_id", "description": ""},
                "p_decision": {"type": "string", "enum": ["confirmed", "cancelled", "needs_human"],
                               "description": "הסטטוס: confirmed / cancelled / needs_human"},
                "p_direction": {"type": "string", "constant_value": "outbound", "description": ""},
                "p_provider": {"type": "string", "constant_value": "elevenlabs", "description": ""},
            },
            ["p_reservation_id", "p_decision", "p_direction", "p_provider"],
        ),
        tool(
            "check_availability",
            "בודקים זמינות שולחן לשעה הערב, לפני שינוי הזמנה. קריאה אחת מחזירה את כל המשבצות משעה לפני עד שעה אחרי השעה המבוקשת (כיסוי של שעתיים) עם כמות פנויה — אין צורך לבדוק כל משבצת בנפרד.",
            "check_availability",
            {
                "p_restaurant_id": {"type": "string", "constant_value": RESTAURANT_ID, "description": ""},
                "p_date": {"type": "string", "dynamic_variable": "today", "description": ""},
                "p_time": {"type": "string", "description": "השעה שביקש הלקוח, HH:MM (משבצת חצי שעה 18:00-22:30)"},
                "p_party_size": {"type": "integer", "description": "מספר הסועדים"},
            },
            ["p_restaurant_id", "p_date", "p_time", "p_party_size"],
        ),
        tool(
            "change_reservation",
            "משנים את שעת ההזמנה ו/או מספר הסועדים. קוראים check_availability קודם, ורק אחרי שחזרת על הפרטים החדשים וקיבלת אישור. להשמיט p_party_size אם לא השתנה.",
            "change_reservation",
            {
                "p_reservation_id": {"type": "string", "dynamic_variable": "reservation_id", "description": ""},
                "p_restaurant_id": {"type": "string", "constant_value": RESTAURANT_ID, "description": ""},
                "p_date": {"type": "string", "dynamic_variable": "today", "description": ""},
                "p_time": {"type": "string", "description": "השעה החדשה, HH:MM (משבצת חצי שעה 18:00-22:30)"},
                "p_party_size": {"type": "integer", "description": "מספר סועדים חדש; להשמיט אם לא השתנה"},
            },
            ["p_reservation_id", "p_restaurant_id", "p_date", "p_time"],
        ),
        tool(
            "schedule_callback",
            "קובעים שיחה חוזרת כשהלקוח לא יכול לדבר עכשיו. ממירים את הזמן שהלקוח אמר (למשל 'בעוד שעתיים') ל-ISO 8601 עם offset לפי {{now_local}}.",
            "schedule_call",
            {
                "p_reservation_id": {"type": "string", "dynamic_variable": "reservation_id", "description": ""},
                "p_restaurant_id": {"type": "string", "constant_value": RESTAURANT_ID, "description": ""},
                "p_kind": {"type": "string", "constant_value": "callback", "description": ""},
                "p_scheduled_for": {"type": "string", "description": "זמן ISO 8601 עם offset, לפי {{now_local}}"},
                "p_reason": {"type": "string", "description": "סיבה קצרה (אופציונלי)"},
            },
            ["p_reservation_id", "p_restaurant_id", "p_kind", "p_scheduled_for"],
        ),
    ]


def upsert_pronunciation_dict(c: httpx.Client) -> dict | None:
    """Create/refresh the Hebrew pronunciation dictionary; returns a tts locator (or None on failure).

    Never fails provisioning — pronunciation is a nice-to-have layered on top.
    """
    try:
        listing = c.get("/v1/pronunciation-dictionaries", params={"page_size": 30})
        if listing.status_code < 300:
            for d in listing.json().get("pronunciation_dictionaries", []):
                if d.get("name") == PRONUNCIATION_DICT_NAME:
                    pid = d["id"]
                    # replace, don't append: drop old rules for these words, then add current ones
                    c.post(f"/v1/pronunciation-dictionaries/{pid}/remove-rules",
                           json={"rule_strings": [r["string_to_replace"] for r in PRONUNCIATION_RULES]})
                    r = c.post(f"/v1/pronunciation-dictionaries/{pid}/add-rules",
                               json={"rules": PRONUNCIATION_RULES})
                    vid = r.json().get("version_id") if r.status_code < 300 else d.get("latest_version_id")
                    print(f"  pronunciation dict '{PRONUNCIATION_DICT_NAME}' refreshed → {pid}")
                    return {"pronunciation_dictionary_id": pid, "version_id": vid}
        r = c.post("/v1/pronunciation-dictionaries/add-from-rules",
                   json={"name": PRONUNCIATION_DICT_NAME, "rules": PRONUNCIATION_RULES})
        if r.status_code < 300:
            out = r.json()
            print(f"  pronunciation dict '{PRONUNCIATION_DICT_NAME}' created → {out.get('id')}")
            return {"pronunciation_dictionary_id": out.get("id"), "version_id": out.get("version_id")}
        print(f"  pronunciation dict SKIPPED: HTTP {r.status_code} {r.text[:160]}")
    except Exception as e:  # noqa: BLE001 — best-effort feature
        print(f"  pronunciation dict SKIPPED: {e}")
    return None


def agent_config(tool_ids: list[str], voice_id: str, transfer_number: str | None,
                 pronunciation_locator: dict | None = None) -> dict:
    built_in: dict = {
        "end_call": {"name": "end_call",
                     "description": "לסיום השיחה, רק אחרי משפט פרידה — ורק אחרי שכבר קראת ל-set_reservation_status בשיחה הזאת.",
                     "params": {"system_tool_type": "end_call"}},
    }
    if transfer_number:
        built_in["transfer_to_number"] = {
            "name": "transfer_to_number",
            "description": "מעבירים את השיחה לנציג אנושי כשהלקוח מבקש לדבר עם בן אדם.",
            "params": {
                "system_tool_type": "transfer_to_number",
                "transfers": [{
                    "transfer_destination": {"type": "phone", "phone_number": transfer_number},
                    "condition": "When the customer explicitly asks to speak with a human right now.",
                    "transfer_type": "conference",
                }],
            },
        }

    tts_extra = (
        {"pronunciation_dictionary_locators": [pronunciation_locator]} if pronunciation_locator else {}
    )
    return {
        "name": AGENT_NAME,
        "tags": ["maitre", "repo-provisioned"],
        "conversation_config": {
            "agent": {
                "first_message": FIRST_MESSAGE,
                "language": "he",
                # True + empty first_message = SILENT AGENT: the "first message being delivered"
                # window never closes, so all user speech is suppressed as an interruption and the
                # LLM never takes a turn (research 2026-06-10). Only guard a real spoken opener.
                "disable_first_message_interruptions": bool(FIRST_MESSAGE),
                "dynamic_variables": {"dynamic_variable_placeholders": PLACEHOLDERS},
                "prompt": {
                    "prompt": SYSTEM_PROMPT,
                    # gemini-2.5-flash: silent no-response turns. gpt-4o-mini: fluent Hebrew but
                    # narrates outcomes without calling tools. gpt-4o: solid tool-calling (2026-06-10).
                    "llm": "gpt-4o",
                    "temperature": 0.3,
                    "tool_ids": tool_ids,
                    "built_in_tools": built_in,
                },
            },
            "tts": {
                # eleven_v3_conversational is the ONLY agents TTS model supporting Hebrew
                "model_id": "eleven_v3_conversational",
                "voice_id": voice_id,
                "stability": 0.75,  # HARD FLOOR. Below this v3 chunk seams glitch: 0.6 = slow-motion warp, 0.65 = hard mid-sentence cut.
                                    # For liveliness use v3 audio tags in the prompt, NOT lower stability.
                "similarity_boost": 0.8,
                "speed": 0.7,       # hosteses voice: FLOOR of the range (0.7-1.2) — 0.8 still fast by ear; per-voice knob (Kratos needed 1.2)
                "agent_output_audio_format": "ulaw_8000",
                "optimize_streaming_latency": 3,  # 4 = choppy; 2 = first word noticeably late ("very slow" opener) — 3 is the balance
                **tts_extra,
            },
            "asr": {
                "provider": "scribe_realtime",
                "quality": "high",
                "user_input_audio_format": "ulaw_8000",
                "keywords": ["לבונטין", "מאיה", "הזמנה", "סועדים", "לבטל", "לאשר"],
            },
            # initial_wait_time: silence fallback — if no pickup speech, agent opens anyway after 4s
            "turn": {"turn_timeout": 7, "silence_end_call_timeout": 20, "turn_eagerness": "normal",
                     "initial_wait_time": 4},
            "conversation": {"max_duration_seconds": 300},
        },
        "platform_settings": {
            "overrides": {
                "conversation_config_override": {
                    "agent": {"first_message": True, "language": True, "prompt": {"prompt": True}},
                    "tts": {"voice_id": True},
                }
            }
        },
    }


# ── API plumbing ──────────────────────────────────────────────────────────────

def client() -> httpx.Client:
    key = os.environ.get("ELEVENLABS_API_KEY")
    if not key:
        sys.exit("ELEVENLABS_API_KEY missing in .env (repo root)")
    return httpx.Client(base_url=BASE, headers={"xi-api-key": key}, timeout=30)


def check(r: httpx.Response, what: str) -> dict:
    if r.status_code >= 300:
        sys.exit(f"FAILED {what}: HTTP {r.status_code}\n{r.text}")
    return r.json() if r.text else {}


def upsert_secret(c: httpx.Client, name: str, value: str) -> str:
    secrets = check(c.get("/v1/convai/secrets"), "list secrets").get("secrets", [])
    for s in secrets:
        if s.get("name") == name:
            print(f"  secret '{name}' exists → {s['secret_id']} (value NOT updated; delete in UI to rotate)")
            return s["secret_id"]
    out = check(c.post("/v1/convai/secrets", json={"type": "new", "name": name, "value": value}), f"create secret {name}")
    print(f"  secret '{name}' created → {out['secret_id']}")
    return out["secret_id"]


def upsert_tools(c: httpx.Client, configs: list[dict]) -> list[str]:
    existing = {t["tool_config"]["name"]: t["id"]
                for t in check(c.get("/v1/convai/tools"), "list tools").get("tools", [])}
    ids = []
    for cfg in configs:
        name = cfg["name"]
        if name in existing:
            tid = existing[name]
            check(c.patch(f"/v1/convai/tools/{tid}", json={"tool_config": cfg}), f"update tool {name}")
            print(f"  tool {name} updated → {tid}")
        else:
            tid = check(c.post("/v1/convai/tools", json={"tool_config": cfg}), f"create tool {name}")["id"]
            print(f"  tool {name} created → {tid}")
        ids.append(tid)
    return ids


def upsert_agent(c: httpx.Client, cfg: dict) -> str:
    # Prefer the id we provisioned before — lets us rename the agent in place.
    if PROVISIONED_PATH.exists():
        prev = json.loads(PROVISIONED_PATH.read_text()).get("agent_id")
        if prev and c.get(f"/v1/convai/agents/{prev}").status_code < 300:
            check(c.patch(f"/v1/convai/agents/{prev}", json=cfg), "update agent")
            print(f"  agent updated (by stored id) → {prev}")
            return prev
    agents = check(c.get("/v1/convai/agents", params={"page_size": 100}), "list agents").get("agents", [])
    for a in agents:
        if a.get("name") == AGENT_NAME:
            aid = a["agent_id"]
            check(c.patch(f"/v1/convai/agents/{aid}", json=cfg), "update agent")
            print(f"  agent updated → {aid}")
            return aid
    aid = check(c.post("/v1/convai/agents/create", json=cfg), "create agent")["agent_id"]
    print(f"  agent created → {aid}")
    return aid


def upsert_phone(c: httpx.Client, agent_id: str) -> str | None:
    number = os.environ.get("TWILIO_PHONE_NUMBER")
    sid = os.environ.get("TWILIO_ACCOUNT_SID")
    token = os.environ.get("TWILIO_AUTH_TOKEN")
    if not (number and sid and token):
        print("  TWILIO_* env incomplete — skipping number import. Fill .env and re-run.")
        return None
    listed = check(c.get("/v1/convai/phone-numbers"), "list phone numbers")
    rows = listed if isinstance(listed, list) else listed.get("phone_numbers", [])
    pid = next((p["phone_number_id"] for p in rows if p.get("phone_number") == number), None)
    if pid:
        print(f"  number {number} already imported → {pid}")
    else:
        pid = check(c.post("/v1/convai/phone-numbers", json={
            "provider": "twilio", "phone_number": number,
            "label": "Maitre outbound (Twilio)", "sid": sid, "token": token,
        }), "import Twilio number")["phone_number_id"]
        print(f"  number {number} imported → {pid}")
    check(c.patch(f"/v1/convai/phone-numbers/{pid}", json={"agent_id": agent_id}), "assign agent to number")
    print(f"  agent assigned to {number}")
    return pid


# ── Voice helpers ─────────────────────────────────────────────────────────────

def list_hebrew_voices(c: httpx.Client):
    print("— Female Hebrew voices in the public voice library —")
    out = check(c.get("/v1/shared-voices", params={"language": "he", "gender": "female", "page_size": 30}),
                "list shared voices")
    for v in out.get("voices", []):
        langs = ",".join(l.get("language", "?") for l in v.get("verified_languages", []) or [])
        print(f"  {v.get('name','?'):28s} owner={v.get('public_owner_id','')[:12]}…  voice={v.get('voice_id')}"
              f"  langs=[{langs}]  free_ok={v.get('free_users_allowed')}\n    preview: {v.get('preview_url')}")
    print("\n— Voices already in YOUR workspace claiming Hebrew —")
    mine = check(c.get("/v2/voices", params={"page_size": 100}), "list my voices").get("voices", [])
    for v in mine:
        if any(l.get("language") == "he" for l in (v.get("verified_languages") or [])):
            print(f"  {v.get('name','?'):28s} voice={v.get('voice_id')}")
    print("\nAdopt one with: python provision_elevenlabs.py --adopt OWNER_ID:VOICE_ID")
    print("Then set ELEVENLABS_VOICE_ID=<new id> in .env and re-run provisioning.")


def adopt_voice(c: httpx.Client, spec: str):
    owner, _, vid = spec.partition(":")
    out = check(c.post(f"/v1/voices/add/{owner}/{vid}", json={"new_name": "Maitre Hebrew Hostess"}), "adopt voice")
    print(f"Adopted into workspace → voice_id={out.get('voice_id')}\n"
          f"Set ELEVENLABS_VOICE_ID={out.get('voice_id')} in .env and re-run provisioning.")


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--voices", action="store_true")
    ap.add_argument("--adopt", metavar="OWNER_ID:VOICE_ID")
    args = ap.parse_args()

    if args.voices:
        with client() as c:
            list_hebrew_voices(c)
        return
    if args.adopt:
        with client() as c:
            adopt_voice(c, args.adopt)
        return

    voice_id = (os.environ.get("ELEVENLABS_VOICE_ID") or "").strip()
    if not re.fullmatch(r"[A-Za-z0-9]{10,40}", voice_id):
        voice_id = DEFAULT_VOICE_ID
    transfer = os.environ.get("HUMAN_TRANSFER_NUMBER") or None

    if args.dry_run:
        cfg = agent_config(["tool_…x4"], voice_id, transfer)
        print(json.dumps(cfg, ensure_ascii=False, indent=2))
        return

    service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not service_key:
        sys.exit("SUPABASE_SERVICE_ROLE_KEY missing in .env (repo root)")
    if voice_id == DEFAULT_VOICE_ID:
        print("voice: Ava/אווה (repo default). Set a valid ELEVENLABS_VOICE_ID in .env to override.")
    if not transfer:
        print("NOTE: HUMAN_TRANSFER_NUMBER not set — transfer_to_number tool will be OMITTED this run.")

    with client() as c:
        print("1/4 secrets")
        sk_id = upsert_secret(c, SECRET_APIKEY_NAME, service_key)
        sb_id = upsert_secret(c, SECRET_BEARER_NAME, f"Bearer {service_key}")
        print("2/4 webhook tools")
        tool_ids = upsert_tools(c, webhook_tools(sk_id, sb_id))
        print("3/4 agent (+ pronunciation dictionary)")
        pron = upsert_pronunciation_dict(c)
        agent_id = upsert_agent(c, agent_config(tool_ids, voice_id, transfer, pron))
        print("4/4 Twilio number")
        phone_id = upsert_phone(c, agent_id)

    state = {
        "agent_id": agent_id,
        "phone_number_id": phone_id,
        "voice_id": voice_id,
        "agent_name": AGENT_NAME,
        "provisioned_at": datetime.now().astimezone().isoformat(timespec="seconds"),
    }
    PROVISIONED_PATH.write_text(json.dumps(state, ensure_ascii=False, indent=2) + "\n")
    print(f"\nWrote {PROVISIONED_PATH.name}:")
    print(json.dumps(state, ensure_ascii=False, indent=2))
    print("\nDashboard: https://elevenlabs.io/app/agents  → agent:", agent_id)


if __name__ == "__main__":
    main()
