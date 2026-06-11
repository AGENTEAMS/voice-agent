# Agent-Speaks-First Opener (reverses user-speaks-first)

2026-06-11: the opener is back to playing IMMEDIATELY on pickup via a non-empty
`first_message`. Reverses [user-speaks-first-outbound](user-speaks-first-outbound.md) — the
wait-for-"הלו" design added a few seconds of dead air after answer (user turn → LLM → TTS
roundtrip), made worse by the
[intermittent silent-generation issue](../gotchas/elevenlabs-intermittent-silent-generation.md).
**Provisioned live but NOT yet ear-tested.**

## Context
User-speaks-first existed to kill phantom confirms (pickup "כן?" counted as "yes I'm coming").
That protection is preserved by different means — the revert does NOT reopen the bug.

## Decision
In `agent/provision_elevenlabs.py`:
- `FIRST_MESSAGE` = the full opener with dynamic vars + `[warm]` tag:
  "[warm] שלום {{customer_name}}, אני מיקה, המארחת הדיגיטלית של מסעדת קיסו. יש לכם הזמנה
  להערב ב{{reservation_time_spoken}}, {{party_size_spoken}}. אתם עדיין מגיעים? ואם עכשיו לא
  נוח — תגידו מתי, ונחזור אליכם."
- `disable_first_message_interruptions` flips to True automatically via the
  `bool(FIRST_MESSAGE)` guard — safe ONLY with a non-empty opener (empty + True = the
  [silent-agent trap](../gotchas/elevenlabs-empty-first-message-silent-agent.md)). Also makes
  the opener immune to the "הלו" echo problem.
- Prompt rule 1 rewritten: opener auto-plays, NEVER repeat it or re-introduce yourself;
  whatever the customer said before/during pickup is greeting only.
- Rule 1א retained — the phantom-confirm guard: no confirm/cancel/change based on anything
  said before the opener's question was asked.
- `interruption_ignore_terms` (הלו variants) kept for mid-call protection.

Side benefit: the opener is fixed text (no LLM roundtrip), so even when the platform's
generation flakes, the caller at least hears the greeting.

## Open
- Ear-test pending: opener latency on pickup, and the "answer with כן?" phantom-confirm probe.
- `initial_wait_time=4` is now moot (opener plays regardless) — left in place, harmless.

## Related
[user-speaks-first-outbound](user-speaks-first-outbound.md) (superseded),
[elevenlabs-empty-first-message-silent-agent](../gotchas/elevenlabs-empty-first-message-silent-agent.md),
[elevenlabs-intermittent-silent-generation](../gotchas/elevenlabs-intermittent-silent-generation.md)
