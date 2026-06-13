# Maître (מיקה) - Hebrew Restaurant Voice Agent

**Team:** Re'i Biton · Haim Toledano · Tomer Elzam
Final project, GenAI & LLM Applications - Reichman University × Google AI Tech School.

An autonomous **Hebrew voice agent** that phones restaurant guests to confirm tonight's
reservations over a real phone line - natural Israeli Hebrew, in real time. Built for
**מסעדת קיסו** (Kisu), a Tel-Aviv restaurant whose hosts spend ~2 hours a day on confirmation
calls. Mika makes those calls instead.

## Live demo

- **Dashboard / click-to-call:** https://voice-agent-delta-one.vercel.app/
- **Tonight's results:** https://voice-agent-delta-one.vercel.app/tonight
- **Cancellation insights:** https://voice-agent-delta-one.vercel.app/insights

Press the CTA on the dashboard and it resets the demo slate, fires the n8n batch, and calls the
allowlisted number live - the constellation lights up as tools fire and the database updates.

## What Mika does

On each call she greets the guest in Hebrew, asks "still coming tonight?", and handles:

- **Confirm / cancel** (cancel asks *why*, fed back into the insights page)
- **Change** time and/or party size, with a real **availability check** (no fabrication)
- **Negotiation** - if the requested slot is full she offers the real free alternatives
- **Callback** scheduling (relative or absolute time math) - the system redials itself later
- **Transfer to a human**, and restaurant **FAQs** (hours, parking, policy, vegetarian)

Every decision is written back to the reservation database through tools; a deterministic guard
reconciles anything ambiguous to `needs_human`. **The agent is probabilistic; the system is not.**

## Architecture

```
TELEPHONY   Twilio number imported into ElevenLabs
VOICE       ElevenLabs Conversational AI  - owns ASR (Scribe) + LLM + TTS (v3 Hebrew) + turn-taking
LLM         Gemini 3 Flash (gemini-3-flash-preview)  - in-call model (see "Model choice")
TOOLS       4 webhook tools -> Supabase PostgREST RPCs DIRECTLY (business logic lives in SQL)
            + transfer_to_human + end_call (ElevenLabs system tools)
DATA        Supabase Postgres  - reservations, customers, availability, cancellations, RPCs
ORCHESTR.   n8n batch  - pick today's pending -> call (allowlisted, 5 at a time) -> poll -> reconcile
DASHBOARD   Next.js (stage/) on Vercel  - live constellation, /tonight, /insights
```

The 6 tools: `set_reservation_status`, `check_availability`, `change_reservation`,
`schedule_callback` (webhooks -> Supabase RPC) + `transfer_to_human`, `end_call`.

The **n8n orchestration workflow** (the batch logic - allowlist, status-aware polling, the
deterministic reconcile guard) is exported credential-free at
[`docs/maitre-n8n-workflow.json`](docs/maitre-n8n-workflow.json).

## Model choice (a 5-model evaluation)

The in-call LLM was chosen by testing 5 models on real calls, optimizing for **reliable
tool-calling** then **cost**:

| Model | Verdict |
|---|---|
| gpt-4o-mini | ❌ narrated outcomes without ever calling tools ("fake work") |
| gpt-5-mini | ❌ ~10s latency - too slow for voice |
| gemini-2.5-flash | ❌ silent no-response turns (froze mid-call) |
| gpt-4o | ✅ works, but pricier (~$0.18/call) |
| **gemini-3-flash** | ✅ **winner** - reliable, ~1.3s avg response, **~7× cheaper** (~$0.026/call) |

This is the assignment's "improve at least one dimension (cost/latency/quality)" step: we
**improved cost ~7×** while keeping reliability. gpt-4o stays a one-command fallback
(`provision_elevenlabs.py --model gpt-4o`).

**Measured:** 78 real test calls across 14 scenarios · ~1.3s avg LLM response · 100% of decided
calls written correctly to the database.

## Repo layout

```
voice-agent/
├── agent/     # provisioning-as-code (ElevenLabs), outbound trigger, callback scheduler, eval tooling
├── stage/     # Next.js dashboard (deployed to Vercel) - constellation, /tonight, /insights, /deck.html
├── supabase/  # migrations (schema, in-call RPCs, demo_reset, cancellation-insights), seed, reseed
├── eval/      # Hebrew TTS audition harness + scoring
└── docs/      # PROJECT-HISTORY, knowledge base, n8n workflow JSON, submission/ (assignment + deck)
```

## Setup

1. Copy `.env.example` -> `.env` and fill the keys (Supabase, ElevenLabs, Twilio). `.env` is gitignored.
2. Agent: `cd agent && python -m venv .venv && .venv/bin/pip install httpx python-dotenv`.
3. Provision the agent (idempotent): `python agent/provision_elevenlabs.py` (defaults to gemini-3-flash).
4. Reset the demo slate: `python supabase/demo_reset.py` (one command -> READY).
5. Dashboard: `cd stage && npm install && npm run dev`.

## Submission

- **Write-up:** [`docs/submission/final-assignment.md`](docs/submission/final-assignment.md)
- **Pitch deck:** [`docs/submission/pitch-deck.pdf`](docs/submission/pitch-deck.pdf) (or open `pitch-deck.html` in a browser for the animated version)
- **n8n workflow (logic):** [`docs/maitre-n8n-workflow.json`](docs/maitre-n8n-workflow.json)
- **Full story:** [`docs/PROJECT-HISTORY.md`](docs/PROJECT-HISTORY.md) · **knowledge base:** [`docs/knowledge/`](docs/knowledge/README.md)
