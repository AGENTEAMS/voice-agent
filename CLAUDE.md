# Maître — Hebrew Restaurant Voice Agent

Hebrew-only voice agent (persona **מיקה**) for **מסעדת קיסו** that calls guests to confirm
today's reservations over a real phone line. Runtime of record: **ElevenLabs Conversational AI**
(owns telephony/ASR/LLM/TTS/tools); Twilio number imported into it; Supabase holds the data and
in-call RPCs. Team: Re'i Biton · Haim Toledano · Tomer Elzam.

## Read first
- `docs/PROJECT-HISTORY.md` — the story so far + current state and next steps.
- `docs/knowledge/README.md` — decisions, gotchas, patterns, vendor research.
- `docs/elevenlabs-tools-config.md` — agent tools + Hebrew system prompt reference.

## Long-term context (Tomer's machine)
Vault: `~/Development/vaults/voice-agent/` — read `hot.md` for where-we-left-off, `index.md`
for the catalog. Session handoffs route here automatically.

## Key commands (agent/.venv has httpx + python-dotenv)
```bash
python supabase/reseed.py --clean              # ALWAYS before a test/demo session (date drift!)
python agent/provision_elevenlabs.py           # idempotent: apply any prompt/tool/config change
python agent/outbound_elevenlabs.py --list     # today's pending reservations
python agent/call_and_verify.py --reservation <uuid> --to +972585121998   # call + transcript + DB
python agent/scheduler.py                      # executes pending scheduled_calls (callbacks)
```

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
