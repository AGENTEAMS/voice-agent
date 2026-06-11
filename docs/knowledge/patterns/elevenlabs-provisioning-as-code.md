# ElevenLabs Agent Provisioning-as-Code (idempotent, repo = source of truth)

One Python script (`projects/final/agent/provision_elevenlabs.py`) creates/updates the ENTIRE
ElevenLabs agent via API: secrets, webhook tools, agent config, phone number, pronunciation
dictionary. Re-run after every prompt tweak. Born from the failure mode of UI clicking: a previous
session "configured" 6 tools in the EL UI and only 1 actually saved.

## Context
Maître (Hebrew restaurant voice agent), ElevenLabs Conversational AI, 2026-06-10. ~10 provision
runs in one evening, each followed by a live test call — iteration cycle of ~2 minutes.

## Pattern body
Order matters; everything upserts:
1. **Secrets** (`POST /v1/convai/secrets`): store the Supabase service key TWICE — raw (for the
   `apikey` header) and **with the `Bearer ` prefix baked in** (for `Authorization`) — because a
   header value is a single secret locator `{"secret_id": ...}`; you cannot concatenate
   `"Bearer " + secret` in the tool schema.
2. **Webhook tools** (`POST/PATCH /v1/convai/tools`, standalone — inline `prompt.tools` is dead):
   match by name → PATCH else POST; collect `tool_ids`. Body params: `constant_value` (fixed),
   `dynamic_variable` (from call context), bare `description` (LLM-filled), `enum` for decisions.
   `disable_interruptions: true`, `force_pre_tool_speech: true`, timeout 10s.
3. **Pronunciation dictionary**: upsert by name, **remove-rules then add-rules** (append-only
   drifts), pass the new `version_id` in the agent's `tts.pronunciation_dictionary_locators`.
4. **Agent** (`POST /v1/convai/agents/create` / `PATCH .../{id}`): match by **stored id from
   `.provisioned.json` first** (lets you rename without duplicating), then by name. Send the FULL
   `conversation_config` every run. System tools live in `prompt.built_in_tools` (end_call,
   transfer_to_number w/ `transfers[].transfer_destination`). Hebrew essentials: `language: "he"`,
   `tts.model_id: "eleven_v3_conversational"` (only agents model with Hebrew), `asr.provider:
   scribe_realtime`, both audio formats `ulaw_8000`, ASR `keywords` for domain Hebrew words.
5. **Phone number**: `POST /v1/convai/phone-numbers` (provider twilio + sid/token) → PATCH
   `{agent_id}` to assign. Match by `phone_number` string for idempotency.
6. **Write `agent/.provisioned.json`** (agent_id, phone_number_id, voice_id) — downstream scripts
   read it with PRIORITY over `.env`
   ([stale-env-overrides-provisioned-ids](../gotchas/stale-env-overrides-provisioned-ids.md)).

**Iteration driver** (`call_and_verify.py`): place outbound call (`POST
/v1/convai/twilio/outbound-call` with `conversation_initiation_client_data.dynamic_variables`) →
poll `GET /v1/convai/conversations/{id}` until done → print transcript WITH per-turn
`tool_calls`/`tool_results` → query Supabase rows. One command = full evidence per iteration.

Hosting note: nothing here needs a server — EL owns the call; Vercel/cron fits the trigger side.

## Related
[runtime-fork-openai-vs-elevenlabs](../decisions/runtime-fork-openai-vs-elevenlabs.md),
[elevenlabs-llm-tool-calling-ladder](../gotchas/elevenlabs-llm-tool-calling-ladder.md),
[elevenlabs-v3-pronunciation-alias-only](../gotchas/elevenlabs-v3-pronunciation-alias-only.md),
[maitre-callback-executor-loop](./maitre-callback-executor-loop.md),
[elevenlabs-conversational-ai-outbound](../services/elevenlabs-conversational-ai-outbound.md)
