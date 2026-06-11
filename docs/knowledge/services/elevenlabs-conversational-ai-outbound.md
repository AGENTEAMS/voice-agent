# ElevenLabs Conversational AI — Maître Runtime (current state)

THE runtime for Maître since 2026-06-10 (fork resolved, OpenAI path deleted). ElevenLabs owns
telephony + ASR + LLM + TTS + tools; repo provisions everything via API. All 5 flows live-verified
with Supabase write-back.

## Context
Account: Tomer's ElevenLabs (tier **creator**, active). Twilio: "Agenteams" account
(SID `ACe1b660bfa3b6de048e4913d809235445`), **upgraded to Full 2026-06-10** ($20) — trial limits
(English preamble, verified-destinations-only) GONE. Number **+1 336 729 5695** imported into EL.
Verified caller ID: **+972585121998** ("Tomer second line", PN56b8079705b695b65f25917c8abaf70f) —
the old +972525898552 verification was deleted. Test calls go TO +972585121998.

## Config + gotchas
- **IDs (current)**: agent `agent_8201ktqbyyqve1d9q8t47a32sd5z` ("Maitre — Mika (repo-provisioned)",
  persona **מיקה**, feminine prompt), phone `phnum_1101ktqbz3g1e7pr5r83s9cvyx6f`, voice "hosteses"
  `SNXrahWBHym8CEMJveKQ` (generated; alternates in workspace: Ava `gJx1vCzNCD1EQHT212Ls`, גיא
  `S1HsfmXyhNvctVe1BYeT`, רוני `wRcoZ4j6obhmFlVbHDKT`). NOTHING locked — voice iteration continues.
  Always in `agent/.provisioned.json` (beats .env).
- **Model constraints**: Hebrew TTS works ONLY on `eleven_v3_conversational` (flash/turbo v2.5
  have no Hebrew); ASR `scribe_realtime` handles Hebrew well; LLM must be `gpt-4o`
  ([elevenlabs-llm-tool-calling-ladder](../gotchas/elevenlabs-llm-tool-calling-ladder.md)). Audio both ways `ulaw_8000`. Current tuning: speed 0.7,
  stability 0.75 (floor), streaming latency 3 — per-voice map in [elevenlabs-v3-voice-tuning-knobs](../patterns/elevenlabs-v3-voice-tuning-knobs.md).
- **Opener**: user-speaks-first (`first_message=""`, `initial_wait_time=4`,
  `disable_first_message_interruptions` MUST be false) — [user-speaks-first-outbound](../decisions/user-speaks-first-outbound.md).
- **Tools**: 4 webhooks → Supabase PostgREST RPCs (headers from workspace secrets; "Bearer "
  prefix baked into a second secret) + built-in end_call + transfer_to_number (conference mode,
  target = HUMAN_TRANSFER_NUMBER). Transfer now unblocked (Full account) — still untested live.
- **Caller ID path (researched, not yet done)**: EL natively imports Twilio Verified Caller IDs
  as outbound-only numbers → import +972585121998, dial from its `agent_phone_number_id`; callee
  sees the Israeli number. Display-only — zero effect on audio quality/lag.
- **Costs (measured)**: Twilio → IL mobile $0.1868/min (landline $0.0659), per started minute;
  ≈$0.30–0.55/confirmation call all-in, ~$16–18 per talk-hour.
- **Old agent** `agent_2301ktpn7shsfkashfdgp7tn50gd` (מאיה, session-B) is orphaned — delete from
  the dashboard whenever.
- Scripts: `provision_elevenlabs.py` (everything), `outbound_elevenlabs.py` (single call),
  `call_and_verify.py` (call + transcript + tool trace + DB), `scheduler.py` (callback executor),
  `make_reservation.py` (demo row under a real name/phone), `supabase/reseed.py [--clean]`.

## Related
[runtime-fork-openai-vs-elevenlabs](../decisions/runtime-fork-openai-vs-elevenlabs.md),
[elevenlabs-provisioning-as-code](../patterns/elevenlabs-provisioning-as-code.md),
[maitre-callback-executor-loop](../patterns/maitre-callback-executor-loop.md),
[hebrew-voice-agent-speech-polish](../patterns/hebrew-voice-agent-speech-polish.md),
[elevenlabs-v3-pronunciation-alias-only](../gotchas/elevenlabs-v3-pronunciation-alias-only.md),
[stale-env-overrides-provisioned-ids](../gotchas/stale-env-overrides-provisioned-ids.md)

## Update 2026-06-11 (post-migration session)
- Restaurant renamed **מסעדת קיסו** ([restaurant-renamed-kisu](../decisions/restaurant-renamed-kisu.md)); ASR keywords updated.
- Opener flipped to **agent-speaks-first**: non-empty `first_message` +
  `disable_first_message_interruptions=True` ([agent-speaks-first-opener](../decisions/agent-speaks-first-opener.md)) — NOT yet ear-tested.
- `interruption_ignore_terms` = הלו variants (pickup echo must not cut speech).
- Intermittent platform-side silent generation observed midday —
  [elevenlabs-intermittent-silent-generation](../gotchas/elevenlabs-intermittent-silent-generation.md) (auto-redial watchdog still TODO).
