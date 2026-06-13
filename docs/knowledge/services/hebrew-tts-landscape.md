# Hebrew TTS Landscape (2026) — naturalness is the bottleneck

Picking a natural-sounding Israeli-Hebrew TTS for a real-time phone agent. The core trap: **vendor
"supports Hebrew" claims are unreliable** — trust blind MOS over 8kHz telephony, not language-count tables.

## Context
For the Mika Voice Agent voice agent ([maitre-voice-agent-architecture](../decisions/maitre-voice-agent-architecture.md)) the make-or-break was natural Hebrew.
Researched + adversarially verified 2026-06-04.

## The unvowelized-Hebrew problem
Modern Hebrew is written without niqqud, so the same letters map to multiple pronunciations (בוקר boker,
בירה bira, דבר davar/daber; gender suffixes שלומך). Small/old TTS fail on this. Fixes: a large model that
learned to disambiguate from context, OR feed nikud-preprocessed text via **Dicta Nakdan** (free API) /
**UNIKUD** / **Phonikud** (G2P→IPA with stress, arXiv 2506.12311). For a fixed script, hand-vocalize once.

## The ElevenLabs streaming trap (most important finding)
- **Eleven v3** = best Hebrew, but **REST-only, NO streaming** → can't drive a live phone turn. Use it only
  to **pre-generate** fixed audio (e.g. the outbound confirm/cancel script).
- **Flash v2.5** = the streaming model (~75ms) but "not designed with Hebrew" → weak.
- **Multilingual v2** = "unintelligible" Hebrew. Avoid.
- New (2026) "Expressive Mode / Eleven v3 Conversational" *might* fix it (real-time v3) — but Hebrew
  unconfirmed in launch demos. Test in dashboard before relying on it.

## Other engines (rank by REAL Hebrew evidence, not marketing)
- **Deepdub Phantom X 3.2** 🇮🇱 — Israeli vendor, native Hebrew, ~125ms streaming. Most credible; pricing
  risk (enterprise, may need sales call).
- **Azure he-IL Hila/Avri** — real neural Hebrew, streaming, production-grade IVR — but older-gen, flatter/
  more robotic. The reliable "floor."
- **Google Chirp 3 HD he-IL** — ⚠️ UNPROVEN: the "good" evidence was actually for the *sibling* Gemini 2.5
  Flash TTS, was WER not MOS, never over phone; and he-IL blocks custom-pronunciation overrides.
- **Gemini Live / Gemini TTS** — ❌ Hebrew NOT in the 24-language TTS output list. Use Gemini only as a text LLM.
- **Cartesia / Inworld** — great latency, Hebrew unverified (no independent samples).
- **OpenAI gpt-4o-mini-tts (cascaded)** — English-accented Hebrew; weak. (But OpenAI **Realtime** s2s Hebrew
  is "much better" — see [hebrew-stt-landscape](hebrew-stt-landscape.md) / [maitre-voice-agent-architecture](../decisions/maitre-voice-agent-architecture.md).)
- PlayHT/Hume/Rime — no real Hebrew.

## How to choose (the gate)
Synthesize ~10 real restaurant utterances (homographs, gender suffixes, foreign dish names, numbers/times)
in each candidate → downsample to 8kHz μ-law → **blind MOS panel, 5+ native speakers, require mean ≥ 3.5**
+ no catastrophic homograph/stress error. Harness built in `eval/tts_audition/`.

## Related
[hebrew-stt-landscape](hebrew-stt-landscape.md),
[maitre-voice-agent-architecture](../decisions/maitre-voice-agent-architecture.md),
[twilio-openai-realtime-bridge](../patterns/twilio-openai-realtime-bridge.md)
