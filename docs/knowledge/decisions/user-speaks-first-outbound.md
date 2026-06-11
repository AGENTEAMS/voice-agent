# Maître: User-Speaks-First Outbound Opener

> **SUPERSEDED 2026-06-11** by [agent-speaks-first-opener](agent-speaks-first-opener.md) — the
> wait-for-greeting design added seconds of dead air after pickup. The phantom-confirm
> protection this page introduced (rule 1א) survives in the new design. Kept for the reasoning
> and verification record.

The agent stays silent at connect and waits for the callee's pickup greeting ("הלו?"); only then
does it deliver the opener (reservation details + "אתם עדיין מגיעים?"). Replaces the fixed
first_message that fired at t=0.

## Context
With a fixed opener, the customer's pickup greeting ("כן?", "הלו") was transcribed during the
un-interruptible first message, queued, and delivered to the LLM as the "answer" to a question
they never heard — producing phantom confirms (reservation confirmed before the customer said
anything). Prompt guards treated the symptom; the design was backwards: on outbound calls the
callee speaks first.

## Decision
- `first_message = ""` (documented: agent waits for user) + `turn.initial_wait_time = 4`
  (silence fallback — agent opens anyway after ~4s).
- Opener text lives in prompt rule 1, delivered verbatim as the agent's first generated turn.
- Rule 1א: nothing said before the opener + question counts as a decision; TOOL CONTRACT mirrors it.
- CRITICAL companion fix: `disable_first_message_interruptions` must be false when first_message
  is empty — see
  [elevenlabs-empty-first-message-silent-agent](../gotchas/elevenlabs-empty-first-message-silent-agent.md).

Verified live: pickup transcribed as "לא" was correctly ignored; confirm/change/cancel/callback
flows all passed with the new opener.

**Trade-off discovered (OPEN):** the opener is now an ordinary LLM turn = interruptible.
Background noise / repeated "הלו?" barges in and restarts it (observed on the callback redial:
opener restarted 3×). #open-question — interruption handling: protect the opener / ignore
background noise (candidates: `interruption_ignore_terms`, removing `interruption` client event,
turn_eagerness=patient) without resurrecting the silent-agent bug. Tomorrow's first task.

## Related
[elevenlabs-empty-first-message-silent-agent](../gotchas/elevenlabs-empty-first-message-silent-agent.md),
[hebrew-voice-agent-speech-polish](../patterns/hebrew-voice-agent-speech-polish.md),
[elevenlabs-conversational-ai-outbound](../services/elevenlabs-conversational-ai-outbound.md)
