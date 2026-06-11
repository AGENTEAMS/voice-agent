# ElevenLabs Agents — LLM Tool-Calling Ladder (gemini silent → 4o-mini fakes → gpt-4o works)

Three LLM failures/fixes discovered in one live-call iteration loop on the Maître Hebrew agent.
The model choice dominates tool reliability; prompt hardening alone did not fix the weaker models.

## Context
Same agent config (Hebrew prompt, 4 webhook tools, 2 system tools) on eleven_v3_conversational,
tested by real Twilio calls with transcript + DB verification after each call (2026-06-10).

## Root cause + fix
1. **`gemini-2.5-flash` (EL default): total silence after the first message.** First message is
   pre-scripted (no LLM), so the call "starts fine" — then the LLM never produces a turn. ASR was
   fine (user words transcribed). No error surfaced anywhere. Swap model.
2. **`gpt-4o-mini`: fluent Hebrew, zero tool calls.** It *narrates* outcomes ("רגע, אני מבטל...
   ההזמנה בוטלה") without invoking anything — DB untouched. Hebrew-only iron rules didn't help.
3. **`gpt-4o`: reliable.** Two changes together fixed everything: the model upgrade + a bilingual
   **TOOL CONTRACT** block appended to the Hebrew prompt (English, explicit: "You MUST use the
   tools. Speaking an outcome aloud saves NOTHING. Before end_call ALWAYS call
   set_reservation_status exactly once…"). After this: 100% correct tool chains across ~8 calls.

Diagnosis pattern: GET `/v1/convai/conversations/{id}` → transcript shows `tool_calls`/`tool_results`
per turn; "agent narrated but no ⚙ entries" = case 2; "no agent turns at all" = case 1.

4. **gpt-4o relapse (2026-06-11): bridge line without the call.** Even on gpt-4o, an open-ended
   availability question produced "אני בודקת זמינות" + a plausible **fabricated** slot list with
   NO check_availability call behind it (twice in one call; the real call only fired on the third
   user nudge). Fix that held: TOOL CONTRACT addition — bridge sentence MUST carry the tool call
   in the SAME turn; slots may only be quoted from the most recent tool RESULT. The "narrated but
   no ⚙" diagnosis applies to single turns, not just whole models.

## Related
[elevenlabs-provisioning-as-code](../patterns/elevenlabs-provisioning-as-code.md),
[runtime-fork-openai-vs-elevenlabs](../decisions/runtime-fork-openai-vs-elevenlabs.md),
[elevenlabs-conversational-ai-outbound](../services/elevenlabs-conversational-ai-outbound.md)
