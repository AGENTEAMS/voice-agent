# ElevenLabs Intermittent Silent Generation (agent never speaks, no error surfaced)

Call connects, ASR hears the caller fine, but the agent never produces a single utterance —
the caller gets dead air and hangs up. Platform-side, intermittent, config-innocent.
Surfaced 2026-06-11 midday: 2 of 4 answered calls failed; the identical config went 4/4
overnight (00:20–00:26) and worked again at 12:31 and 12:40.

## Context
First hit during post-migration test calls (conv_9001ktv0043afn98gcr6nygbp2jt @12:25,
conv_5601ktv0hkamf97atc23v5mcxmf1 @12:35). Initially misattributed to missing
`interruption_ignore_terms` — the 12:31 success right after that fix was coincidence: the
12:25 failure happened on the untouched overnight config, and 12:35 failed WITH the fix live.

## Root cause + evidence
The conversation's `metadata.charging` tells the story:

| field | silent call | working call (12:31) |
|---|---|---|
| `llm_usage.*.model_usage` | `{}` — 0 tokens, $0 | gpt-4o 4454 in / 67 out |
| `tts_usage.total_characters` | 74 | 168 |
| `tts_usage.total_audio_output_seconds` | **0.0** | 11.87 |
| `asr_usage` | fine (14 calls, 4.16s in) | fine |
| `error` / `warnings` | null / [] | null / [] |

A generation is *initiated*, zero LLM tokens are ever recorded, a partial first chunk reaches
TTS, and zero audio seconds are synthesized — ElevenLabs surfaces no error anywhere. The
failure lives in EL's gpt-4o pool / TTS streaming path, possibly load-correlated (midday vs
off-peak).

## Triage pattern (reusable)
`GET /v1/convai/conversations/{id}` → `metadata.charging`:
- llm tokens **0** + tts audio **0.0s** + asr normal → platform generation failure (this page)
- llm tokens normal + tts audio 0.0s → TTS/voice/dictionary problem
- no user turns at all + `disable_first_message_interruptions=true` + empty first_message →
  the [empty-first-message config trap](elevenlabs-empty-first-message-silent-agent.md) instead

## Mitigations
- **Auto-redial watchdog** in `call_and_verify.py` (detect 0 agent turns / 0.0s TTS → redial
  once) — designed, NOT yet implemented.
- Support ticket with the two conv IDs above (Creator tier, paid).
- Manual redial works — failure is per-call, not sticky.
- The [agent-speaks-first opener](../decisions/agent-speaks-first-opener.md) shrinks the blast
  radius: the opener is a fixed `first_message` (no LLM roundtrip), so at minimum the caller
  hears the greeting even if a later generation dies.

## Related
[elevenlabs-empty-first-message-silent-agent](elevenlabs-empty-first-message-silent-agent.md),
[agent-speaks-first-opener](../decisions/agent-speaks-first-opener.md),
[elevenlabs-llm-tool-calling-ladder](elevenlabs-llm-tool-calling-ladder.md)
