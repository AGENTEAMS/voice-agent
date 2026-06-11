# Demo Data Date-Drift → check_availability / change_reservation return no_such_slot

In the Maître POC, `check_availability` and `change_reservation` match on date. If the seeded demo data
rolls past "today" (clock moves to a new day), those RPCs return `no_such_slot` and the agent can't
confirm or change anything — even though rows exist.

## Context
Hit in Session A (commit `8ba10d6`). `availability` rows were stuck on 2026-06-08 while the demo ran on
a later day; both in-call functions broke until re-seeded.

## Root cause + fix
- **Cause**: capacity/availability is keyed on `date`. Reservations and `availability` are seeded
  independently, so they drift apart as the day rolls.
- **Fix**: before any demo, shift **both** `reservations.reserved_for` **and** `availability.date`
  forward to today. Shifting only reservations is the trap — `check_availability`/`change_reservation`
  still miss because the `availability` row is on the old date.
- Note: `availability.booked` is **advisory** in the POC (seeded independently); capacity gating uses
  derived `available`. Documented in migration `0003_incall.sql`. Tighten before production.
- **Midnight rollover (2026-06-11)**: this recurs mid-session when the clock passes 00:00 —
  `make_reservation.py` creates rows for the NEW day while `availability` still sits on yesterday.
  Symptom: every `check_availability` returns `[]` ("אין מקום" for everything) and the agent
  falls into a slot-by-slot hunting loop. Fix: `supabase/reseed.py --clean` (REST date-shift).

## Related
[maitre-voice-agent-architecture](../decisions/maitre-voice-agent-architecture.md),
[runtime-fork-openai-vs-elevenlabs](../decisions/runtime-fork-openai-vs-elevenlabs.md)
