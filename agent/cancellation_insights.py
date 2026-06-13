"""Cancellation Insights — the LLM-analysis step of the cancellation feedback loop.

Reads the raw cancellation log (public.cancellations), asks **gpt-4o** to cluster the
free-text Hebrew reasons into themes and derive, per theme, a business *implication*
and a concrete *recommendation*, then writes the aggregate to
public.cancellation_insights — which the /insights dashboard page renders.

    Mika captures WHY on every cancel  ──►  cancellations (raw log)
                                              │   gpt-4o analysis (this script)
                                              ▼
                                       cancellation_insights  ──►  /insights page

WHY IT'S PRECOMPUTED FOR THE DEMO
  The demo slate seeds cancellation_insights directly (migration 0007) so the page
  renders with zero live-API dependency on stage. This script is the *production*
  path: run it whenever new cancellations accumulate to regenerate the insights.
  It is real, runnable gpt-4o code — it just isn't on the critical path of the live
  demo.

REQUIREMENTS
  • OPENAI_API_KEY in .env (the only extra secret this script needs; the rest of the
    stack reaches gpt-4o through ElevenLabs, so the repo otherwise has no OpenAI key).
  • SUPABASE_DB_URL in .env (Session pooler) for the read/write.

USAGE
    agent/.venv/bin/python agent/cancellation_insights.py            # analyze + write
    agent/.venv/bin/python agent/cancellation_insights.py --dry-run  # print, don't write
"""
import json
import os
import sys
from pathlib import Path

import httpx
import psycopg
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env")

RID = os.environ.get("RESTAURANT_ID", "11111111-1111-1111-1111-111111111111")
MODEL = "gpt-4o"
OPENAI_URL = "https://api.openai.com/v1/chat/completions"

SYSTEM = (
    "אתה אנליסט תפעול מסעדות. בהינתן רשימת סיבות ביטול של הזמנות (בעברית), "
    "קבץ אותן ל-4 עד 6 נושאים עסקיים ברורים. עבור כל נושא החזר: מספר האזכורים, "
    "משמעות עסקית קצרה (implication), והמלצה אחת קונקרטית ופעילה (recommendation), "
    "וציטוט מייצג אחד מתוך הסיבות (sample_quote). כתוב בעברית בלבד. "
    'החזר JSON תקין בלבד בצורה: {"themes":[{"theme":..., "mentions":int, '
    '"implication":..., "recommendation":..., "sample_quote":...}]}'
)


def fetch_reasons(conn) -> list[str]:
    rows = conn.execute(
        "select reason_text from cancellations where restaurant_id = %s order by created_at desc",
        (RID,),
    ).fetchall()
    return [r[0] for r in rows]


def derive_with_gpt4o(reasons: list[str], api_key: str) -> list[dict]:
    user = "סיבות הביטול:\n" + "\n".join(f"- {r}" for r in reasons)
    resp = httpx.post(
        OPENAI_URL,
        headers={"Authorization": f"Bearer {api_key}"},
        json={
            "model": MODEL,
            "temperature": 0.3,
            "response_format": {"type": "json_object"},
            "messages": [
                {"role": "system", "content": SYSTEM},
                {"role": "user", "content": user},
            ],
        },
        timeout=90,
    )
    resp.raise_for_status()
    content = resp.json()["choices"][0]["message"]["content"]
    themes = json.loads(content).get("themes", [])
    if not themes:
        raise ValueError("gpt-4o returned no themes")
    return themes


def write_insights(conn, themes: list[dict]) -> None:
    total = sum(int(t["mentions"]) for t in themes) or 1
    themes = sorted(themes, key=lambda t: int(t["mentions"]), reverse=True)
    with conn.cursor() as cur:
        cur.execute("delete from cancellation_insights where restaurant_id = %s", (RID,))
        for rank, t in enumerate(themes, start=1):
            cur.execute(
                """insert into cancellation_insights
                   (restaurant_id, theme, mentions, share, implication, recommendation,
                    sample_quote, rank, period_label, generated_by)
                   values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                (
                    RID, t["theme"], int(t["mentions"]), round(int(t["mentions"]) / total, 3),
                    t.get("implication"), t.get("recommendation"), t.get("sample_quote"),
                    rank, "30 הימים האחרונים", MODEL,
                ),
            )
    conn.commit()


def main() -> int:
    dry = "--dry-run" in sys.argv
    db_url = os.environ.get("SUPABASE_DB_URL")
    if not db_url:
        print("ERROR: SUPABASE_DB_URL not set in .env (needed for the read/write).")
        return 2
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        print(
            "ERROR: OPENAI_API_KEY not set. The demo page is seeded (migration 0007) so it\n"
            "works without this; set the key only to regenerate insights live via gpt-4o."
        )
        return 2

    with psycopg.connect(db_url) as conn:
        reasons = fetch_reasons(conn)
        if not reasons:
            print("No cancellations to analyze.")
            return 0
        print(f"Analyzing {len(reasons)} cancellation reasons with {MODEL}…")
        themes = derive_with_gpt4o(reasons, api_key)
        total = sum(int(t["mentions"]) for t in themes) or 1
        for t in sorted(themes, key=lambda x: int(x["mentions"]), reverse=True):
            print(f"  • {t['theme']}: {t['mentions']} ({int(t['mentions'])/total:.0%}) — {t.get('recommendation','')[:60]}")
        if dry:
            print("[dry-run] not writing.")
            return 0
        write_insights(conn, themes)
        print(f"Wrote {len(themes)} themes to cancellation_insights.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
