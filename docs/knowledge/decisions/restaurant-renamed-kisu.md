# Restaurant Renamed: לבונטין → קיסו (Kisu)

2026-06-11: the demo restaurant is now **מסעדת קיסו**. The levonTEEN stress alias never landed
by ear (Tomer corrected the pronunciation live on a call: "אבל זה לבונטין, לבונטין") — renaming
to a phonetically simple name sidesteps the problem instead of fighting v3's stress handling.

## Context
v3 ignores IPA rules; only alias respellings work, and multi-syllable Hebrew names with
non-final stress kept coming out wrong
([alias-only gotcha](../gotchas/elevenlabs-v3-pronunciation-alias-only.md)).

## Decision
Renamed in every layer, same session:
- Alias dict: `קיסו → "KEE-soo"` (caps-stress first syllable); levonTEEN rule removed.
- Prompt (persona line + opener) and ASR keywords in `agent/provision_elevenlabs.py`.
- `supabase/seed.sql` + live `restaurants` row (PATCH).

**Live-verified** immediately after: full negotiation flow (opener → 21:00 full → offered
21:30 → change_reservation → confirmed → end_call) with correct DB write-back. KEE-soo ear
verdict: pending explicit confirmation, but no correction was raised on two post-rename calls.

## Related
[elevenlabs-v3-pronunciation-alias-only](../gotchas/elevenlabs-v3-pronunciation-alias-only.md),
[hebrew-voice-agent-speech-polish](../patterns/hebrew-voice-agent-speech-polish.md)
