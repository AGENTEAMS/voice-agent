# Mika Voice Agent — Hebrew Restaurant Voice Agent

Hebrew-only voice agent (persona **מיקה**) for **מסעדת קיסו** that calls guests to confirm
today's reservations over a real phone line. Runtime of record: **ElevenLabs Conversational AI**
(owns telephony/ASR/LLM/TTS/tools); Twilio number imported into it; Supabase holds the data and
in-call RPCs. Team: Re'i Biton · Haim Toledano · Tomer Elzam.

## Read first
- `docs/PROJECT-HISTORY.md` — the story so far + current state and next steps.
- `docs/knowledge/README.md` — decisions, gotchas, patterns, vendor research.
- `docs/elevenlabs-tools-config.md` — agent tools + Hebrew system prompt reference.
- `docs/submission/` — course final-assignment doc + Hebrew pitch deck (due 2026-06-13).

## Orchestration (n8n)
Batch workflow «Mika Voice Agent — Call Today's Pending Reservations» (`G7RYSw2BQgqnabJt`) on
YOUR-N8N-INSTANCE.app.n8n.cloud, built/updated via the n8n MCP. Triggers: Manual ("Run Batch") + **Webhook** (POST, path `maitre-run`, Respond
Immediately) → production URL `https://YOUR-N8N-INSTANCE.app.n8n.cloud/webhook/maitre-run`. Hard allowlist
in "Build Call Payloads" = **+972500000000 only** (the stage button dials only Tomer; fake-number
pending rows are skipped/display-only). `update_workflow` WIPES node credentials — so the webhook
trigger was added BY HAND in the UI (not via MCP); for any structural change, prefer a manual UI
edit or expect to re-pick the 6 HTTP-node creds.

## Key commands (agent/.venv has httpx + python-dotenv)
```bash
python supabase/demo_reset.py                  # ONE-COMMAND demo slate: full reset + both תומר test rows + verify (READY ✅)
python supabase/reseed.py --clean              # lower-level reseed. SUPABASE_DB_URL set (Session pooler) ⇒ true full reset; else REST date-shift fallback
python agent/provision_elevenlabs.py           # idempotent: apply any prompt/tool/config change. --model <id> swaps the in-call LLM (default gemini-3-flash-preview; --model gpt-4o = fallback). LLM eval: docs/next-session-test-plan.md
python agent/outbound_elevenlabs.py --list     # today's pending reservations
python agent/call_and_verify.py --reservation <uuid> --to +972500000000   # call + transcript + ⚙tool calls + per-call LLM $ (EL charging) + DB
python agent/cancellation_insights.py          # gpt-4o derive script: cancellations log → /insights themes (needs OPENAI_API_KEY; demo page is seeded, so optional)
python agent/scheduler.py                      # executes pending scheduled_calls (callbacks)
cd stage && npm run dev                        # live demo dashboard «מיקה — במה» → localhost:3000
```

## Live demo dashboard (`stage/`)
`stage/` is a Next.js 16 app — the constellation visualization of a live call (tools + DB
writes), click-to-call, `/tonight` results, `/insights` (cancellation-insights: LLM-derived
themes from `cancellation_insights`, seeded by migration 0007), 10 scene styles, `?sim=1` fallback. Listens to
the DB (`tool_events` + Supabase Realtime), so n8n batch / CTA / scheduler all light it. Run
from `stage/`. Demo flow + test ladder: `docs/stage-demo-runbook.md`. (The old `dashboard/`
is the scrapped prototype — `stage/` replaces it.)
**Deployed (live):** https://voice-agent-delta-one.vercel.app/ (Tomer's Vercel, Root Dir=`stage`).
The CTA → `POST /api/run` → `demo_reset()` RPC (reset-on-START) → n8n webhook → calls Tomer. DB-function
changes need no redeploy (app reads live DB); app/CSS changes do → push to main (Vercel auto-builds;
`NEXT_PUBLIC_*` inlined at BUILD). `demo_reset()` is now a Postgres RPC (migrations 0005/0006) — the
single source for the demo slate; `seed.sql` + `demo_reset.py` just call it.

## Rules
- **Provisioning-as-code**: never hand-edit the agent in the ElevenLabs dashboard — change
  `provision_elevenlabs.py` and re-run it.
- `.provisioned.json` beats `.env` for resource IDs (stale-env trap — see knowledge/gotchas).
- LLM ships **gemini-3-flash-preview** (reliable + ~7× cheaper than gpt-4o; fixed 2.5-flash's
  silent turns). Known weak spot: false-confirms off a pickup "כן" said before the opening
  question lands (gemini-family) → demo habit is to answer "הלו". Fallback one command away:
  `provision_elevenlabs.py --model gpt-4o`. gpt-4o-mini fakes tool calls; gpt-5-mini too slow.
- v3 TTS: stability **0.75 is a hard floor**; pronunciation via **alias respellings only**.
- `first_message` non-empty ⇄ `disable_first_message_interruptions=True` move together —
  empty + True = silent agent.
- Test dials go to **+972500000000**. The 21:00 slot is intentionally FULL (negotiation prop).
- `dashboard/` is a scrapped prototype — do not build on it.

## Secrets
`.env` at repo root (gitignored) — ask Tomer. `.env.example` documents the keys.
