# Twilio Play-Then-Hangup Timing (voice agent end_call)

When a voice agent ends a call, hanging up on a fixed `sleep` clips the goodbye. Key the hangup on the
model's `response.done` for the `end_call` response **plus** a Twilio `mark` that fires only after the
audio finishes playing — then hang up. Idempotent finish + two-stage watchdog so long goodbyes survive
but a stuck call still dies.

## Context
Maître's `end_call` (OpenAI Realtime bridge, `agent/bridge.py`, commit `8ba10d6`). Survived 3 Codex
review rounds; this timing was one of the hardened items.

## Pattern
- Agent says goodbye → calls `end_call`. Bridge queues a Twilio `mark` and hangs up **only after**
  Twilio reports the goodbye finished playing (correct "play-then-hangup" pattern), not a fixed sleep.
- `_finish_call` is **idempotent** (multiple triggers can't double-hang or race).
- **Two-stage watchdog**:
  - long gen-fallback ~30s — covers the model never finishing generation,
  - short post-mark playback-fallback ~8s — fires after the mark so long goodbyes aren't cut.
- Teardown is **task-based** (no `asyncio.gather` that can hang); tool-error recovery + connect-failure
  cleanup so a failed connect doesn't leak the call.

## Related
[twilio-openai-realtime-bridge](./twilio-openai-realtime-bridge.md),
[maitre-voice-agent-architecture](../decisions/maitre-voice-agent-architecture.md),
[runtime-fork-openai-vs-elevenlabs](../decisions/runtime-fork-openai-vs-elevenlabs.md)
