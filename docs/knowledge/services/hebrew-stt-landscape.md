# Hebrew STT Landscape (2026) — Soniox wins, Deepgram Hebrew refuted

Real-time Hebrew speech-to-text for a phone voice agent. Key result: the popular default (Deepgram) has
**no real Hebrew evidence**; the best-documented hosted Hebrew is **Soniox**.

## Context
The "ear" half of the Maître agent ([maitre-voice-agent-architecture](../decisions/maitre-voice-agent-architecture.md)); the "mouth" is
[hebrew-tts-landscape](hebrew-tts-landscape.md). Researched + adversarially verified 2026-06-04.

## Ranking (by real Israeli-Hebrew evidence)
- **Soniox** ✅ primary — best independently-documented hosted Hebrew WER (**7.5%** vs OpenAI 16.1% on real
  audio), native low-latency streaming, built for voice agents, ~$0.12/hr. Has a LiveKit telephony path.
- **ivrit.ai** (Whisper-large-v3-turbo) — strongest *proven* Israeli-Hebrew (WER ~0.05–0.07 on conversational/
  WhatsApp audio), free/open weights — but NOT turn-key streaming (self-host + VAD wrapper). Accuracy ceiling.
- **Deepgram Nova-3 Hebrew** — ⚠️ **REFUTED**: published a Hebrew WER *chart with no number*; Soniox's
  benchmark doesn't even list Deepgram-Hebrew; a dev reports high WER on the exact LiveKit+telephony stack.
  Don't adopt blind — measure on your own phone clips first.
- **ElevenLabs Scribe v2 Realtime** — sub-150ms, Hebrew "Good" (3.1% FLEURS) but clean-benchmark only; nice
  if you're already single-vendor on ElevenLabs.
- **Speechmatics / Google / Azure** — Hebrew supported but unproven for conversational/telephony; slower or
  mid-tier.
- **AssemblyAI** — ❌ no Hebrew in *streaming* (real-time) — disqualified for a live agent.

## Caveats that bite
All vendor Hebrew numbers are clean read-speech (FLEURS/Common Voice). Telephony = 8kHz narrowband + codec
loss + Israeli accent + code-switching (English brand names, Arabic food terms) → real WER is materially
worse. Mitigate: **keyterm/context prompting** (Soniox/Deepgram support it), and for confirm/cancel add a
**DTMF fallback + spoken read-back** so a single STT miss can't flip a reservation.

## In a speech-to-speech model, STT disappears
If you use OpenAI Realtime (s2s, the Maître pick), the model does its own internal STT → you don't use
Soniox at all. Soniox is for the **cascaded** path. Trade-off: lose best-in-class Hebrew STT, gain one-model
simplicity + lowest latency.

## Related
[hebrew-tts-landscape](hebrew-tts-landscape.md),
[maitre-voice-agent-architecture](../decisions/maitre-voice-agent-architecture.md),
[twilio-openai-realtime-bridge](../patterns/twilio-openai-realtime-bridge.md)
