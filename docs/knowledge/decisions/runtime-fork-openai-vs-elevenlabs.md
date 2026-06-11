# Maître — Runtime Fork RESOLVED: ElevenLabs Conversational AI

**Decided 2026-06-10: ElevenLabs CAI is the agent of record.** The OpenAI Realtime path was
deleted from the repo the same day (commit `b494949`; recoverable at `8ba10d6`). By end of session,
all 5 conversational flows were live-verified on real phone calls with Supabase write-back.

## Context
Two parallel sessions had built two complete runtimes (OpenAI Realtime bridge vs ElevenLabs CAI)
on the same Supabase backend — see the history of this page in the source vault (commit before
2026-06-10). Tomer cut the knot: "full on with 11Labs, delete everything OpenAI-related."

## Decision
- **ElevenLabs owns the entire voice stack**: telephony (imported Twilio number), ASR
  (scribe_realtime), LLM (gpt-4o), TTS (eleven_v3_conversational — the only agents TTS model with
  Hebrew), turn-taking, system tools (end_call, transfer_to_number).
- **No middle server**: webhook tools hit Supabase PostgREST RPCs directly. The repo only holds
  config-as-code ([elevenlabs-provisioning-as-code](../patterns/elevenlabs-provisioning-as-code.md))
  + trigger/executor scripts.
- Vercel is BACK on the table for hosting (dashboard + scheduler cron) — the "no Vercel" rule
  applied only to the deleted websocket bridge.
- Deleted: `bridge.py`, `tools.py`, `prompts.py`, `outbound.py`, `test_oai.py`. Canonical prompt
  now lives inside `provision_elevenlabs.py`. The old gpt-realtime Hebrew-MOS open question is moot.
- Persona settled (after מאיה → קראטוס experiments): **רוני** — male Hebrew clone voice
  `wRcoZ4j6obhmFlVbHDKT`, masculine Hebrew prompt.

## Verified live (2026-06-10, Tomer's phone)
confirm / cancel / change-time with negotiation (full slot → alternative offered) / callback
(row → watcher → automatic redial in +14s, even chained twice) / needs_human. Every decision
written to Supabase (`reservations.status`, `call_attempts`, `scheduled_calls`).

- #open-question **transfer_to_number is the one untested tool** — Twilio trial only dials
  verified numbers and the second (transfer target) number isn't verified yet. Test right after
  the Twilio upgrade.

## Related
[maitre-voice-agent-architecture](maitre-voice-agent-architecture.md),
[elevenlabs-conversational-ai-outbound](../services/elevenlabs-conversational-ai-outbound.md),
[elevenlabs-provisioning-as-code](../patterns/elevenlabs-provisioning-as-code.md),
[elevenlabs-llm-tool-calling-ladder](../gotchas/elevenlabs-llm-tool-calling-ladder.md),
[maitre-callback-executor-loop](../patterns/maitre-callback-executor-loop.md)
