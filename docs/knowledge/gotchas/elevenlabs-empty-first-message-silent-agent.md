# ElevenLabs: Empty first_message + Interruption Guard = Totally Silent Agent

Setting `first_message=""` (the documented "user speaks first" recipe) while
`disable_first_message_interruptions=true` produces an agent that NEVER speaks: user audio is
transcribed but no agent turn is ever generated.

## Context
Mika Voice Agent switched to a user-speaks-first outbound flow (2026-06-10). First live test: Tomer spoke
for 15s ("כן. כן. כן? הלו?" — transcribed fine, one user turn at t=0), agent silent until hangup.
`initial_wait_time=4` fallback never fired either.

## Root cause + fix
With an empty first message, the "first message being delivered" window appears never to close,
so all user speech is classified as a suppressed interruption and never committed as a turn —
the LLM is never invoked. Undocumented interaction (deep-research 2026-06-10 found no official
or community doc of this combo); confirmed empirically — flipping the flag fixed it instantly.

**Fix:** `"disable_first_message_interruptions": bool(FIRST_MESSAGE)` — only guard a real spoken
opener. See `provision_elevenlabs.py`.

Related facts from the same research (see
[elevenlabs-outbound-research-2026-06-10](../research/elevenlabs-outbound-research-2026-06-10.md)):
- Empty `first_message` IS documented: "If empty, the agent waits for the user to start the discussion."
- `initial_wait_time`: how long to wait for the user to start when first message is empty (else turn_timeout).
- Community footgun: overrides passed without Security-tab toggles are silently dropped (200 OK).

## Related
[user-speaks-first-outbound](../decisions/user-speaks-first-outbound.md),
[elevenlabs-provisioning-as-code](../patterns/elevenlabs-provisioning-as-code.md),
[elevenlabs-conversational-ai-outbound](../services/elevenlabs-conversational-ai-outbound.md)
