# Twilio Media Streams ↔ OpenAI Realtime bridge (GA gpt-realtime)

> Historical: the OpenAI Realtime path was removed 2026-06-10 when ElevenLabs became the runtime of record; kept for reference.

How to put a real phone call on the OpenAI Realtime (speech-to-speech) model: Twilio carries μ-law 8k audio
over a Media Stream WebSocket; a small persistent server relays it to OpenAI Realtime and back.

## Context
The voice runtime for the Maître agent
([maitre-voice-agent-architecture](../decisions/maitre-voice-agent-architecture.md)). Implemented in
`agent/bridge.py` (FastAPI). The GA `gpt-realtime` schema differs from the 2024 beta — the
beta's `input_audio_format: "g711_ulaw"` is gone.

## GA API (verified 2026-06)
- Connect: `wss://api.openai.com/v1/realtime?model=gpt-realtime`, header `Authorization: Bearer <KEY>`
  (server-side; no `OpenAI-Beta` header needed for GA).
- `session.update` → `session`:
  - `type: "realtime"`
  - `audio.input.format = {"type":"audio/pcmu"}`, `audio.input.turn_detection = {"type":"server_vad"}`
  - `audio.output.format = {"type":"audio/pcmu"}`, `audio.output.voice = "marin"` (try marin/cedar for non-EN)
  - `output_modalities: ["audio"]`, `instructions: <short system prompt>`, `tools: [...]`
- After session.update send `{"type":"response.create"}` so the agent **speaks first** (outbound).

## Audio pump
- Twilio → OpenAI: on Twilio `media` event → `{"type":"input_audio_buffer.append","audio": media.payload}`
  (already base64 μ-law).
- OpenAI → Twilio: on `response.output_audio.delta` → `{"event":"media","streamSid":sid,"media":{"payload":delta}}`.
- **Barge-in**: on `input_audio_buffer.speech_started` → send Twilio `{"event":"clear","streamSid":sid}` to
  stop playback + `conversation.item.truncate` (track current `item_id` + ms streamed) so context stays correct.

## Function-calling → your DB
- Define `tools` in session. Model emits `response.function_call_arguments.done` with `{name, call_id, arguments}`.
- Execute (e.g. Supabase RPC) → reply `{"type":"conversation.item.create","item":{"type":"function_call_output",
  "call_id":..., "output":<string>}}` → then `{"type":"response.create"}`.

## Telephony wiring
- Inbound: Twilio number Voice webhook → returns TwiML `<Connect><Stream url="wss://HOST/media-stream"/></Connect>`.
- Outbound: Twilio REST `calls.create(url=".../outbound-twiml?reservation_id=X")`; that TwiML adds
  `<Parameter name="reservation_id" value="X"/>` inside `<Stream>` → read it from the WS `start` event's
  `customParameters` to set per-call context.
- Host: a **persistent** WS server (Fly/Render/Railway) — NOT Vercel serverless (can't hold a websocket).
  Local dev: `uvicorn` + `ngrok http 5050`, put the ngrok host in `PUBLIC_HOST`.

## Gotchas
`websockets` lib: GA uses `additional_headers=` (not `extra_headers=`). Keep the system prompt SHORT —
Realtime re-sends instructions every turn (latency + cost). μ-law in/out avoids transcoding on the phone leg.

## Related
[maitre-voice-agent-architecture](../decisions/maitre-voice-agent-architecture.md),
[hebrew-tts-landscape](../services/hebrew-tts-landscape.md),
[hebrew-stt-landscape](../services/hebrew-stt-landscape.md),
[israeli-972-telephony-provisioning](../services/israeli-972-telephony-provisioning.md)
