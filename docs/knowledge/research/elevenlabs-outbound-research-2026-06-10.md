# Research: ElevenLabs Outbound Voice Agents — User-Speaks-First, Caller ID, and Platform Handles

**Date**: 2026-06-10 · **Protocol**: deep-research v4 (Round 1: WebSearch + Exa + Tavily; Perplexity lane DOWN — API quota exhausted; Round 2 skipped — coverage solid)
**Trigger**: Mika Voice Agent bug — `first_message=""` on outbound Twilio call → agent totally silent (user speech transcribed, zero agent turns, 19s to hangup).

---

## 1. The silent-agent bug — diagnosis

**Empty `first_message` is the documented user-speaks-first recipe** (only one that exists):
> "If non-empty, the first message the agent will say. If empty, the agent waits for the user to start the discussion."
— Create Agent API schema [elevenlabs.io/docs/api-reference/agents/create, fetched 2026-06-10]

**`turn.initial_wait_time`** (added 2025-11-12 changelog):
> "How long the agent will wait for the user to start the conversation if the first message is empty. If not set, uses the regular turn_timeout."
It is a **fallback re-engagement timer**, not a listening window. With our config the agent should have spoken ~4s in even if the user said nothing. Observed behavior contradicted docs on both paths.

**Prime suspect — `disable_first_message_interruptions: true` with empty first message** (converged by all 3 lanes, undocumented interaction):
> Flag semantics: "If true, the user will not be able to interrupt the agent while the first message is being delivered." (default false; added 2025-09-15 for legal disclaimers)
Hypothesis: with `first_message=""` the "first message being delivered" window never closes → all user speech is classified as a suppressed interruption → transcribed but never committed as a turn → LLM never invoked. Matches our symptom exactly.

**Supporting evidence**: a production case study runs `first_message: ""` on native Twilio outbound successfully — with `disable_first_message_interruptions` left at default false and no `initial_wait_time` [aurahq.ai/blog/building-voice-agents-elevenlabs, 2026-03-06]. The flag is the differentiator between their working config and our silent one.

**Fix applied**: `disable_first_message_interruptions=False` whenever `first_message` is empty.

**Caveat**: official outbound guidance still pushes agent-speaks-first ("ensure your agent has appropriate initial messages configured") [native-integration doc] — user-speaks-first on outbound is off the documented happy path. If the flag fix doesn't cure it, this is a platform bug worth filing.

## 2. The 200-OK footguns (community-documented)

- **Override silently dropped**: any field passed in `conversation_initiation_client_data.conversation_config_override` whose toggle is OFF under Agent → Security → Overrides is silently ignored — API returns 200, call connects, agent uses stored config. #1 cause of "rang but wrong/silent behavior" [agentcookbooks.com/blog/elevenlabs-conversational-ai-four-200-ok-footguns/, 2026-05-26].
- **Never send empty strings in overrides**: "omit any fields you don't want to override rather than setting them to empty strings or null values" [overrides doc]. Empty-as-wait semantics are only documented on the *agent-level* field (where we set it — correct).
- **Missing required dynamic variable** → WS closes code 1008 → dead silent call with NO transcript [github.com/elevenlabs/elevenlabs-examples/issues/138, 2025-02-18]. (Differential: our call HAD a transcript, so not this.)
- **Webhooks are workspace-scoped** — created in the wrong workspace they simply never fire [agentcookbooks, 2026-05-26].

## 3. Caller ID — the answer

- **Twilio Verified Caller IDs can be imported into ElevenLabs as outbound-only phone numbers** [native-integration doc, HIGH confidence]: "Must be verified in Twilio's 'Verified Caller IDs' section… Ideal for using your existing business number for outbound AI calls." Capabilities auto-detected at import; cannot receive inbound / can't be an agent's inbound number.
  → **Mika Voice Agent implication**: import verified +972500000000, pass its `agent_phone_number_id` on outbound calls — callee sees the Israeli number. No need to buy a Twilio +972 number for caller-ID purposes.
- **No per-call `from` override** on `POST /v1/convai/twilio/outbound-call` (full schema: required `agent_id`, `agent_phone_number_id`, `to_number`; optional `conversation_initiation_client_data`, `call_recording_enabled`, `telephony_call_config.ringing_timeout_secs` default 60). Caller ID = the number entity you dial from.
- SIP trunking: caller ID is configured trunk-side; custom SIP headers supported [elevenlabs SIP docs + plivo.com/docs/sip-trunking/ElevenLabs].

## 4. Voicemail / AMD

- Built-in system tool **`voicemail_detection`** — LLM-based (analyzes greeting patterns), NOT Twilio AMD. Optional voicemail message (supports dynamic vars), then auto-terminates. Events logged in conversation history + batch call results. Tool param: required `reason` [voicemail-detection doc].
- **Twilio `MachineDetection` is not exposed** through the native integration (absent from outbound endpoint schema; no doc mention). Can't be combined.
- Voicemail pickup does NOT trigger a `call_initiation_failure` webhook (call counts as successfully initiated).

## 5. transfer_to_number (for the pending live test)

Three transfer types [transfer-to-number doc, HIGH confidence]:
- **`conference`** (default): dials destination, adds to conference room, removes AI agent. The only WARM type — `agent_message` is read to the human operator. Native-Twilio-imported numbers only.
- **`blind`**: direct cold handoff; **preserves the original caller ID**; native Twilio only; must be set via JSON editor (`"transfer_type": "blind"`); ignores `agent_message`.
- **`sip_refer`**: SIP URIs, requires trunk REFER support, custom headers allowed (system `X-Conversation-ID`, `X-Caller-ID` auto-win).
LLM params: `transfer_number` (must match a configured rule), `client_message` (read to caller while waiting), `agent_message`, `reason`. Rules support `post_dial_digits` for extensions (`w`=0.5s pause, `W`=1s). Phone calls only.

## 6. Post-call webhooks — transcript persistence (future dashboard feed)

[post-call-webhooks doc, HIGH confidence]
- Types: **`post_call_transcription`** (full `transcript[]` with role/message/tool_calls/tool_results/time_in_call_secs/turn metrics incl. LLM TTFB; `metadata` with duration/cost/termination_reason/phone details; `analysis` with `transcript_summary`, `call_successful`, evaluation results; echoes `dynamic_variables` — round-trip your own reservation_id to match rows), **`post_call_audio`** (base64 MP3), **`call_initiation_failure`** (`failure_reason` ∈ busy|no-answer|unknown + raw Twilio StatusCallback body).
- Auth: HMAC via `ElevenLabs-Signature`; SDK `construct_event()`. Must return 200; auto-disabled after 10+ consecutive failures w/ last success >7 days. Optional static-IP allowlisting (per-region egress IPs).
- → Mika Voice Agent: a tiny webhook endpoint (Vercel route) + UPDATE `call_attempts.transcript` closes the "transcripts in DB" gap.

## 7. Batch calling (for the n8n daily batch)

[batch-calls doc, HIGH confidence]
- CSV/XLS upload; `phone_number` column required; every other column becomes a dynamic variable. Per-row override columns: `language`, `first_message`, `system_prompt`, `voice_id` (each must be override-enabled in agent Security settings or the batch FAILS).
- Scheduling: immediate or date/time + timezone. Concurrency: min(50% workspace limit, 70% agent limit). Works with native Twilio + SIP. No Zero-Retention-Mode. API: batch-calling list/create.

## 8. Turn-taking / latency knob reference (full TurnConfig)

| Field | Default | Semantics |
|---|---|---|
| `turn_timeout` | 7 (range 1–30) | max wait for user reply before re-engaging |
| `initial_wait_time` | null | first-turn wait when first_message empty; falls back to turn_timeout |
| `silence_end_call_timeout` | -1 | max silence since user last spoke before hangup |
| `turn_eagerness` | normal | patient / normal / eager (patient recommended while collecting numbers/addresses) |
| `spelling_patience` | auto | extra patience while user spells entities |
| `speculative_turn` | false (we run true) | generate LLM during silence pre-confidence → lower latency, higher LLM cost |
| `retranscribe_on_turn_timeout` | false | re-transcribe accumulated audio at timeout (rescues missed ASR) |
| `turn_model` | turn_v3 | hybrid VAD + prosody model |
| `soft_timeout_config` | disabled (-1) | filler ("Hhmmmm...yeah.", or LLM-generated) when LLM slow; recommended 3.0s |

Misc: agent starts speaking "after receiving enough words and a comma from the LLM"; `skip_turn` system tool = deliberate agent silence; interruptions require `interruption` in client events; Scribe Hebrew = "Good" tier (10–20% WER — expect ASR misses; `retranscribe_on_turn_timeout` worth enabling).

## 9. Docs meta

Docs moved: `docs/agents-platform/...` → `docs/eleven-agents/...` (product renamed "ElevenAgents", June 2026). Append `.md` to any docs URL for markdown, `/llms.txt` for index. API paths unchanged (`/v1/convai/...`).

## Unresolved gaps

1. `disable_first_message_interruptions` × empty `first_message` interaction — undocumented; our fix is hypothesis-driven (validated empirically post-fix or escalate to EL support).
2. Behavior at `initial_wait_time` expiry (what does the agent say?) — undocumented.
3. `turn.mode` enum (`turn`/`silence`) vs turn_eagerness — relationship unclear in current docs.
4. eleven_v3_conversational Hebrew-specific quirks — nothing published beyond generic v3 language claims.

## Sources (primary)

- https://elevenlabs.io/docs/api-reference/agents/create — field schemas (fetched 2026-06-10)
- https://elevenlabs.io/docs/eleven-agents/api-reference/twilio/outbound-call — outbound endpoint
- https://elevenlabs.io/docs/eleven-agents/phone-numbers/twilio-integration/native-integration — number types, verified caller IDs
- https://elevenlabs.io/docs/eleven-agents/customization/conversation-flow — turn-taking
- https://elevenlabs.io/docs/eleven-agents/customization/personalization/overrides — override rules
- https://elevenlabs.io/docs/eleven-agents/customization/tools/system-tools/{voicemail-detection,transfer-to-number,skip-turn}
- https://elevenlabs.io/docs/eleven-agents/workflows/post-call-webhooks · /phone-numbers/batch-calls
- https://aurahq.ai/blog/building-voice-agents-elevenlabs (2026-03-06) — working empty-first-message production config
- https://agentcookbooks.com/blog/elevenlabs-conversational-ai-four-200-ok-footguns/ (2026-05-26)
- https://github.com/elevenlabs/skills — agent-configuration.md, outbound-calls.md
- https://github.com/elevenlabs/elevenlabs-examples/issues/138 · changelogs 2025-09-15, 2025-11-12
