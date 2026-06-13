# Maître — Hebrew Restaurant Voice Agent

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
Batch workflow «Maître — Call Today's Pending Reservations» (`G7RYSw2BQgqnabJt`) on
asher13.app.n8n.cloud, built/updated via the instance-level n8n MCP (server "n8n" in local
claude config). Manual trigger only. Hard allowlist in "Build Call Payloads": +972525898552;
+972585121998 is the human-transfer target (`HUMAN_TRANSFER_NUMBER`). `update_workflow`
WIPES node credentials — after any update, re-pick on the 6 HTTP nodes.

## Long-term context (Tomer's machine)
Vault: `~/Development/vaults/voice-agent/` — read `hot.md` for where-we-left-off, `index.md`
for the catalog. Session handoffs route here automatically.

## Key commands (agent/.venv has httpx + python-dotenv)
```bash
python supabase/demo_reset.py                  # ONE-COMMAND demo slate: full reset + both תומר test rows + verify (READY ✅)
python supabase/reseed.py --clean              # lower-level reseed. SUPABASE_DB_URL set (Session pooler) ⇒ true full reset; else REST date-shift fallback
python agent/provision_elevenlabs.py           # idempotent: apply any prompt/tool/config change
python agent/outbound_elevenlabs.py --list     # today's pending reservations
python agent/call_and_verify.py --reservation <uuid> --to +972585121998   # call + transcript + DB
python agent/scheduler.py                      # executes pending scheduled_calls (callbacks)
cd stage && npm run dev                        # live demo dashboard «מיקה — במה» → localhost:3000
```

## Live demo dashboard (`stage/`)
`stage/` is a Next.js 16 app — the constellation visualization of a live call (tools + DB
writes), click-to-call, `/tonight` results, 10 scene styles, `?sim=1` fallback. Listens to
the DB (`tool_events` + Supabase Realtime), so n8n batch / CTA / scheduler all light it. Run
from `stage/`. Demo flow + test ladder: `docs/stage-demo-runbook.md`. (The old `dashboard/`
is the scrapped prototype — `stage/` replaces it.)

## Rules
- **Provisioning-as-code**: never hand-edit the agent in the ElevenLabs dashboard — change
  `provision_elevenlabs.py` and re-run it.
- `.provisioned.json` beats `.env` for resource IDs (stale-env trap — see knowledge/gotchas).
- LLM must stay **gpt-4o** (gemini-flash goes silent, 4o-mini fakes tool calls).
- v3 TTS: stability **0.75 is a hard floor**; pronunciation via **alias respellings only**.
- `first_message` non-empty ⇄ `disable_first_message_interruptions=True` move together —
  empty + True = silent agent.
- Test dials go to **+972585121998**. The 21:00 slot is intentionally FULL (negotiation prop).
- `dashboard/` is a scrapped prototype — do not build on it.

## Secrets
`.env` at repo root (gitignored) — ask Tomer. `.env.example` documents the keys.
