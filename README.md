# Maître — Hebrew Restaurant Voice Agent

Team: Re'i Biton · Haim Toledano · Tomer Elzam
(Started as the final project of GenAI & LLM Applications, Reichman × Google AI Tech School — now a standalone project.)

A **Hebrew-only voice agent for restaurants** that calls guests to confirm today's reservations —
natural Israeli Hebrew, real-time, over a real phone line.

- **Outbound** — call every guest with a reservation *today* and ask (in Hebrew) "still coming?"
  → confirm / cancel / change time & party size / schedule a callback / transfer to a human →
  write the outcome to the reservation DB. **All 5 flows live-verified end-to-end**, including
  the agent autonomously scheduling and executing its own callback redial.
- **Inbound FAQ** — answer policy questions (hours, kashrut, parking) from the same agent.
- **Dashboard** — live reservations + call outcomes (previous attempt scrapped; to be rebuilt).

> Scope is deliberately narrow: the agent **only** confirms/cancels/changes and answers policy
> questions. It never markets, upsells, or makes the final decision — that keeps it legally
> *transactional* under Israeli law (see [docs/legal.md](docs/legal.md) and
> [docs/knowledge/decisions/israeli-outbound-call-legality.md](docs/knowledge/decisions/israeli-outbound-call-legality.md)).

## New here? Read these first

1. **[docs/PROJECT-HISTORY.md](docs/PROJECT-HISTORY.md)** — the full story: every decision,
   bug, and verified milestone, session by session.
2. **[docs/knowledge/](docs/knowledge/README.md)** — the knowledge base: architecture decisions,
   hard-won gotchas (silent-agent trap, LLM tool-calling ladder, v3 stability floor), voice-tuning
   playbooks, and vendor research.
3. **[docs/elevenlabs-tools-config.md](docs/elevenlabs-tools-config.md)** — source of truth for
   the agent's tools + Hebrew system prompt.

## Architecture

**Runtime of record: ElevenLabs Conversational AI** (decided 2026-06-10; the earlier OpenAI
Realtime bridge was removed — see
[docs/knowledge/decisions/runtime-fork-openai-vs-elevenlabs.md](docs/knowledge/decisions/runtime-fork-openai-vs-elevenlabs.md)).

```
VOICE      ElevenLabs CAI   owns telephony + STT + LLM + TTS + turn-taking + tools.
                            Webhook tools call Supabase PostgREST RPCs DIRECTLY (no middle server).
TELEPHONY  Twilio           number imported into ElevenLabs; ElevenLabs dials through it.
CONTROL    script / n8n     pick today's pending reservations → trigger one outbound call each
                            (agent/outbound_elevenlabs.py + agent/scheduler.py now; n8n daily batch later).
DATA       Supabase         Postgres — mock restaurant, 8-table schema, in-call RPCs
                            (apply_call_result, check_availability, change_reservation, schedule_call).
UI         Next.js (later)  dashboard only — no audio anywhere near it.
```

The 6 agent tools: `set_reservation_status`, `check_availability`, `change_reservation`,
`schedule_callback` (webhooks → Supabase RPC) + `transfer_to_human`, `end_call` (ElevenLabs
system tools).

## Layout

```
voice-agent/
├── agent/          # provisioning-as-code + outbound call trigger + callback scheduler
├── dashboard/      # SCRAPPED — will be rebuilt from scratch; do not build on it
├── supabase/       # migrations (0001 schema, 0002 RPCs, 0003 in-call), seed, reseed.py
├── eval/           # Hebrew TTS audition harness + scoring
└── docs/           # PROJECT-HISTORY, knowledge base, tools config, call script, legal, n8n guide
```

## Setup

1. Copy `.env.example` → `.env` and fill in the keys (Supabase, ElevenLabs, Twilio).
   `.env` is gitignored — ask Tomer for the working values.
2. Agent scripts: `cd agent && python -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt`.
   Start with [agent/README.md](agent/README.md).
3. Demo data: `python supabase/reseed.py --clean` — **run this whenever availability comes back
   empty**; the seed dates drift stale at midnight
   ([why](docs/knowledge/gotchas/demo-data-date-drift-no-such-slot.md)).
4. Test calls dial **+972585121998**. The 21:00 slot is intentionally FULL (negotiation demo prop).

## Status / next

1. ✅ ElevenLabs agent provisioned as code; all 5 flows live-verified with DB write-back,
   incl. autonomous callback redial. Twilio account upgraded to Full.
2. ▶ Voice iteration ongoing — current persona **מיקה**, voice "hosteses"; nothing locked in.
   User-speaks-first opener live-verified.
3. ▶ **Next up: interruption handling** — background noise / repeated "הלו" cuts the opener
   mid-sentence and restarts it. Candidates: `interruption_ignore_terms`, dropping the
   `interruption` client event, `turn_eagerness=patient` — without resurrecting the
   [silent-agent bug](docs/knowledge/gotchas/elevenlabs-empty-first-message-silent-agent.md).
4. ◻ Verified caller ID import (+972585121998) · live `transfer_to_number` test ·
   post-call webhook → transcripts into `call_attempts.transcript` · dashboard rebuild ·
   Vercel cron scheduler · n8n daily batch ([docs/n8n-automation-guide.md](docs/n8n-automation-guide.md)).
