# Mika Voice Agent — Hebrew Restaurant Voice Agent (final project)

GenAI course final project: a Hebrew-only voice agent for restaurants that **outbound**-calls today's
reservations to confirm/cancel (updating a DB) and answers **inbound** FAQ (hours, cancellation,
availability). Team: Re'i Biton, Haim Toledano, Tomer Elzam. Lives at the repo root.

## Context
Course assignment wants problem → discovery → GenAI architecture → implementation (50%) → pitch, POC-first.
The make-or-break constraint is **natural Israeli Hebrew, real-time, over the phone, ~$20–100 budget**.
Decided after a 15-agent research sweep + adversarial verification (2026-06-04).

## Decision — voice runtime = OpenAI Realtime (gpt-realtime), speech-to-speech
Chosen over a cascaded LiveKit (STT→LLM→TTS) stack for POC speed, lowest latency, and the most mature
telephony story. Bridged to the phone via **Twilio Media Streams** (see
[twilio-openai-realtime-bridge](../patterns/twilio-openai-realtime-bridge.md)).
The cascaded path (Soniox STT + a dedicated Hebrew TTS, see
[hebrew-stt-landscape](../services/hebrew-stt-landscape.md) /
[hebrew-tts-landscape](../services/hebrew-tts-landscape.md))
is **deferred to a later-stage A/B** if Realtime's Hebrew voice isn't natural enough. Outbound's fixed
confirm/cancel script can also be **pre-generated with ElevenLabs v3** (best Hebrew, streaming-exempt).

## Architecture — three planes, never conflated
- **Control** = n8n: Asia/Jerusalem cron → Supabase SELECT today's reservations → loop one outbound call
  per number → end-of-call webhook → UPSERT → summary.
- **Realtime** = the OpenAI Realtime bridge (persistent host: Fly/Render, **never Vercel** — serverless
  can't hold the audio websocket). In-call DB calls go DIRECT to Supabase RPC (not n8n) to protect turn-taking.
- **UI** = Next.js + shadcn + Supabase Realtime on Vercel (dashboard only).

Telephony = Twilio +972 DID (see
[israeli-972-telephony-provisioning](../services/israeli-972-telephony-provisioning.md)).
Data = Supabase (8-table schema).
Legality = strictly transactional (see [israeli-outbound-call-legality](israeli-outbound-call-legality.md)).

## Hardening (confirm/cancel must survive STT error)
Keyterm-prompted yes/no/cancel + DTMF fallback (press 1/2) + spoken read-back before any DB write;
ambiguous Hebrew ("אולי") → `needs_human`, never a wrong auto-update.

## In-call functions (Phase A — expanded to 6)
Grew from confirm/cancel into a 6-function reservation handler (Session A, commit `8ba10d6`):
change-time/party (`change_reservation` RPC — atomic, availability-validated, party 1–12, locks +
rebalances `availability.booked`), transfer-to-human (**default = callback**: marks `needs_human` +
schedules an ASAP `scheduled_calls` row, then hangs up; live `<Dial>` wired but OFF behind
`HUMAN_TRANSFER_NUMBER`), call-back-later (`schedule_callback` — model resolves spoken Hebrew time to
ISO-8601, bridge validates future ≤14 days), and end-call (play-then-hangup, see
[twilio-play-then-hangup-timing](../patterns/twilio-play-then-hangup-timing.md)). Design choices: did
**not** widen `reservation_status` enum or `apply_call_result` — callbacks/retries live in the new
`scheduled_calls` table; `needs_human` + `log_call_outcome` cover transfers. New SQL in migration
`0003_incall.sql`. Passed 3 Codex review rounds.

## Status
Phase-0/1 foundation committed (`ee745b0`); Phase-A 6-function expansion committed (`8ba10d6`).
Supabase project `ezxlnlpcppvqqmeqcswm` loaded (migration 0003, RPCs DB-tested). A **second runtime**
(ElevenLabs CAI) was built in parallel (`7906c27`) and is unresolved against this OpenAI path — see
[runtime-fork-openai-vs-elevenlabs](runtime-fork-openai-vs-elevenlabs.md). Pending: **live voice test
of the 6 functions**, n8n automation layer (guide written, not built), Twilio off Trial, deploy
bridge → Fly/Render.
The Next.js dashboard (`dashboard/`, commits `d73beee`/`16ba107`) was **scrapped** —
throwaway, will be redone from scratch; do not treat it as current direction.

## Open questions
- #open-question Does `gpt-realtime` Hebrew clear the naturalness bar (MOS ≥ 3.5, clean number/name
  pronunciation) over 8kHz telephony? Being auditioned in the OpenAI Playground. If it fails → trigger the
  cascade A/B.
- #open-question Which voice runtime is canonical — OpenAI Realtime (this page) or ElevenLabs? See
  [runtime-fork-openai-vs-elevenlabs](runtime-fork-openai-vs-elevenlabs.md).

## Related
[runtime-fork-openai-vs-elevenlabs](runtime-fork-openai-vs-elevenlabs.md),
[twilio-openai-realtime-bridge](../patterns/twilio-openai-realtime-bridge.md),
[twilio-play-then-hangup-timing](../patterns/twilio-play-then-hangup-timing.md),
[elevenlabs-conversational-ai-outbound](../services/elevenlabs-conversational-ai-outbound.md),
[hebrew-tts-landscape](../services/hebrew-tts-landscape.md),
[hebrew-stt-landscape](../services/hebrew-stt-landscape.md),
[israeli-972-telephony-provisioning](../services/israeli-972-telephony-provisioning.md),
[israeli-outbound-call-legality](israeli-outbound-call-legality.md),
*technical-discovery-framework*
