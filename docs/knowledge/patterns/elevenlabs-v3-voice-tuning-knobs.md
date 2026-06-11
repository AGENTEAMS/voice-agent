# ElevenLabs v3 Voice-Tuning Knob Map (Telephony)

The per-voice tuning levers for `eleven_v3_conversational` agents on phone calls, with the
values that survived ear-testing — and which knob to reach for per complaint.

## Context
Maître voice iteration marathon (2026-06-10/11): Kratos → ריסה → רוני(f) → גיא → Ava → hosteses
(מיקה). Every knob is PER-VOICE — retune after every voice swap.

## The map
| Complaint | Knob | Evidence |
|---|---|---|
| Talks too fast/slow | `tts.speed` (0.7–1.2) | Kratos needed 1.2; גיא 0.8; hosteses 0.7 (floor) |
| Monotone | v3 audio tags in prompt (`[warm]`, `[friendly]`) — NOT stability | stability <0.75 glitches (see [elevenlabs-v3-low-stability-chunk-glitches](../gotchas/elevenlabs-v3-low-stability-chunk-glitches.md)) |
| Audio warps/cuts | `tts.stability` ≥ 0.75 | 0.6/0.65 glitched, 0.75+ clean |
| Choppy audio | `optimize_streaming_latency` ↓ (4→3) | 4 = choppy |
| First word arrives late | `optimize_streaming_latency` ↑ (2→3) | 2 = "very slow" opener |
| Sentences blitzed together | instruct `" ... "` (ellipsis) between ideas in prompt | v3 renders as a natural beat |
| Wrong word stress | alias dict with CAPS final syllable ("levonTEEN", "Meeka") | works for names; FAILS for verb respellings — "venitkaSHER" was chopped into spelled-out syllables. Then avoid the word in fixed text instead |
| Response lag | `speculative_turn: true`; `soft_timeout_config` filler | lag = gpt-4o + TTS gen, caller-ID/number choice is irrelevant |

## Costs (measured 2026-06-11)
Twilio → Israeli mobile $0.1868/min (landline $0.0659), billed per started minute. Plus EL
conversation minutes (~$0.08–0.12/min plan-dependent). ≈$0.30–0.55 per confirmation call,
~$16–18/talk-hour — ~3× cheaper per talk-minute than a loaded Israeli call-center wage at
realistic utilization.

## Related
[hebrew-voice-agent-speech-polish](./hebrew-voice-agent-speech-polish.md),
[elevenlabs-v3-pronunciation-alias-only](../gotchas/elevenlabs-v3-pronunciation-alias-only.md),
[elevenlabs-conversational-ai-outbound](../services/elevenlabs-conversational-ai-outbound.md)
