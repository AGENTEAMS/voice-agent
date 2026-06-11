# Knowledge Base

Everything we've learned building Maître — decisions, hard-won bugs, reusable patterns, and
vendor research. Migrated from the original project vault on 2026-06-11. If you're new here,
read [PROJECT-HISTORY.md](../PROJECT-HISTORY.md) first for the story, then dip into these by topic.

## Decisions

| Page | What it settles |
|------|-----------------|
| [maitre-voice-agent-architecture](decisions/maitre-voice-agent-architecture.md) | The original system design — control plane, voice plane, data plane |
| [runtime-fork-openai-vs-elevenlabs](decisions/runtime-fork-openai-vs-elevenlabs.md) | Why ElevenLabs Conversational AI won and the OpenAI Realtime path was deleted |
| [agent-speaks-first-opener](decisions/agent-speaks-first-opener.md) | Opener plays immediately on pickup (first_message + flag), phantom-confirm guard kept — NOT yet ear-tested |
| [restaurant-renamed-kisu](decisions/restaurant-renamed-kisu.md) | לבונטין → קיסו (alias KEE-soo) — sidesteps the v3 stress problem; verified live |
| [user-speaks-first-outbound](decisions/user-speaks-first-outbound.md) | *Superseded 2026-06-11* — why the agent used to wait for the callee to speak first |
| [israeli-outbound-call-legality](decisions/israeli-outbound-call-legality.md) | Why the agent is legally *transactional* (no marketing/upsell) under Israeli law |

## Gotchas (bugs we hit so you don't have to)

| Page | The trap |
|------|----------|
| [elevenlabs-empty-first-message-silent-agent](gotchas/elevenlabs-empty-first-message-silent-agent.md) | Empty `first_message` + `disable_first_message_interruptions=true` = completely silent agent |
| [elevenlabs-intermittent-silent-generation](gotchas/elevenlabs-intermittent-silent-generation.md) | Platform-side dead air: 0 LLM tokens + 0.0s TTS audio, `error: null` — triage via `metadata.charging` |
| [elevenlabs-llm-tool-calling-ladder](gotchas/elevenlabs-llm-tool-calling-ladder.md) | gemini-flash goes silent, 4o-mini fakes tool calls, gpt-4o needs a TOOL CONTRACT |
| [elevenlabs-v3-low-stability-chunk-glitches](gotchas/elevenlabs-v3-low-stability-chunk-glitches.md) | Stability < 0.75 on v3 warps/cuts audio at chunk seams |
| [elevenlabs-v3-pronunciation-alias-only](gotchas/elevenlabs-v3-pronunciation-alias-only.md) | v3 ignores IPA — only alias respellings work (levonTEEN, Meeka) |
| [stale-env-overrides-provisioned-ids](gotchas/stale-env-overrides-provisioned-ids.md) | Stale `.env` IDs silently override fresh `.provisioned.json` |
| [demo-data-date-drift-no-such-slot](gotchas/demo-data-date-drift-no-such-slot.md) | Seed data goes stale at midnight → all availability returns empty → `reseed.py --clean` |

## Patterns (how we do things)

| Page | The playbook |
|------|--------------|
| [elevenlabs-provisioning-as-code](patterns/elevenlabs-provisioning-as-code.md) | The whole agent (tools, prompt, voice, phone) provisioned idempotently from Python |
| [elevenlabs-v3-voice-tuning-knobs](patterns/elevenlabs-v3-voice-tuning-knobs.md) | Complaint → knob map: speed, stability, latency, audio tags, pauses + measured costs |
| [hebrew-voice-agent-speech-polish](patterns/hebrew-voice-agent-speech-polish.md) | The Hebrew speech rules that survived ~10 test calls |
| [maitre-callback-executor-loop](patterns/maitre-callback-executor-loop.md) | Self-scheduling callbacks: tool → `scheduled_calls` table → `scheduler.py` redial |
| [twilio-play-then-hangup-timing](patterns/twilio-play-then-hangup-timing.md) | Hanging up only after audio actually finished playing |
| [twilio-openai-realtime-bridge](patterns/twilio-openai-realtime-bridge.md) | *Historical* — the removed OpenAI Realtime bridge, kept for reference |

## Services (vendor landscape & runtime state)

| Page | Covers |
|------|--------|
| [elevenlabs-conversational-ai-outbound](services/elevenlabs-conversational-ai-outbound.md) | Live runtime state: agent/phone/voice IDs, model config, costs, scripts |
| [hebrew-tts-landscape](services/hebrew-tts-landscape.md) | Hebrew TTS engine ranking and the unvowelized-Hebrew problem |
| [hebrew-stt-landscape](services/hebrew-stt-landscape.md) | Hebrew STT vendor ranking (Soniox primary) |
| [israeli-972-telephony-provisioning](services/israeli-972-telephony-provisioning.md) | Getting +972 numbers on Twilio/Telnyx — myths vs real risks |

## Research

| Page | Covers |
|------|--------|
| [elevenlabs-outbound-research-2026-06-10](research/elevenlabs-outbound-research-2026-06-10.md) | Deep-research report: silent-agent diagnosis, webhooks, caller ID, voicemail/AMD, transfers, batch calling |
