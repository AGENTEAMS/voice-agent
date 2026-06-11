# ElevenLabs v3: Stability Below 0.75 Causes Chunk-Seam Audio Glitches

On `eleven_v3_conversational` telephony calls, stability values below 0.75 produce mid-sentence
audio artifacts: slow-motion warps and hard cuts at generation-chunk seams. 0.75 is the floor.

## Context
Maître voice tuning (2026-06-10/11). Chasing "less monotone" we lowered stability and hit two
distinct glitches on two different voices.

## Root cause + fix
v3 generates speech in chunks; stability is the consistency glue between them. Low stability lets
each chunk's prosody drift, and the seams surface as audible artifacts:
- stability 0.6 (Ava voice): mid-sentence slow-motion warp ("said it in very slow motion")
- stability 0.65 (hosteses voice): hard cut mid-opener ("cut off really hard")
- stability 0.75–0.9: zero artifacts across ~15 calls (0.9 = monotone, 0.75 = acceptable)

**Fix:** treat 0.75 as a HARD FLOOR. For liveliness use v3 audio tags in the prompt
(`[warm]`, `[friendly]` — English-only, not spoken aloud) instead of lowering stability.
Caveat: poor cellular reception produces similar-sounding artifacts — confirm on good signal
before blaming config.

## Related
[elevenlabs-v3-voice-tuning-knobs](../patterns/elevenlabs-v3-voice-tuning-knobs.md),
[hebrew-voice-agent-speech-polish](../patterns/hebrew-voice-agent-speech-polish.md)
