# Project History — Maître (Hebrew Restaurant Voice Agent)

A session-by-session narrative of how this project evolved, written for new collaborators.
Maître is the GenAI course final project: a Hebrew-only voice agent for restaurants
(מסעדת לבונטין in the demo) that **outbound**-calls today's reservations to confirm/cancel
(updating a Supabase DB) and answers **inbound** FAQ. Team: Re'i Biton, Haim Toledano, Tomer Elzam.

The deeper "why" behind each decision lives in `docs/knowledge/` — linked throughout.

---

## Session 1 — 2026-06-08: Kickoff and the first architecture

The project kicked off with a 15-agent research workflow plus adversarial verification focused on
the make-or-break constraint: **natural Israeli Hebrew, real-time, over the phone, ~$20–100 budget**.

**Decision:** voice runtime = **OpenAI Realtime (gpt-realtime), speech-to-speech**, bridged to the
phone via Twilio Media Streams. A cascaded LiveKit stack (Soniox STT + dedicated Hebrew TTS) was
deferred to a later A/B in case Realtime's Hebrew wasn't natural enough. Full rationale:
[knowledge/decisions/maitre-voice-agent-architecture.md](knowledge/decisions/maitre-voice-agent-architecture.md).

**Built** (commit `ee745b0`):
- Twilio↔Realtime FastAPI bridge (barge-in + function-calling; compiled, not yet live-tested)
- Supabase 8-table schema + in-call RPCs + Hebrew mock seed (verified on pgvector)
- Hebrew prompts with a hard no-upsell guardrail (legal: the call must stay strictly
  transactional — [knowledge/decisions/israeli-outbound-call-legality.md](knowledge/decisions/israeli-outbound-call-legality.md))
- TTS audition harness, phase-0 + legal docs

Supabase cloud project `ezxlnlpcppvqqmeqcswm` was created (keys in `.env`; schema not yet loaded).
Open question at this point: does gpt-realtime Hebrew clear the naturalness bar (MOS ≥ 3.5, clean
number/name pronunciation) over 8kHz telephony?

---

## Session 2 — 2026-06-10 (consolidation): Two runtimes, one fork

Two parallel sessions had each built a **complete runtime on the same Supabase backend**:

1. **OpenAI Realtime path, expanded** (commit `8ba10d6`): grew from confirm/cancel into a
   6-function in-call handler — change-time/party (`change_reservation` RPC: atomic,
   availability-validated, party 1–12, locks + rebalances `availability.booked`),
   transfer-to-human (default = callback: marks `needs_human` + schedules an ASAP
   `scheduled_calls` row, then hangs up; live `<Dial>` wired but OFF behind
   `HUMAN_TRANSFER_NUMBER`), call-back-later (`schedule_callback` — model resolves spoken Hebrew
   time to ISO-8601, bridge validates future ≤14 days), and end-call (play-then-hangup —
   [knowledge/patterns/twilio-play-then-hangup-timing.md](knowledge/patterns/twilio-play-then-hangup-timing.md)).
   New SQL in migration `0003_incall.sql`; passed 3 Codex review rounds.
2. **ElevenLabs Conversational AI runtime** (commit `7906c27`), built independently.

This left an unresolved **runtime fork** — which path is canonical? Documented as an open
question in [knowledge/decisions/runtime-fork-openai-vs-elevenlabs.md](knowledge/decisions/runtime-fork-openai-vs-elevenlabs.md).

Other outcomes:
- The first Next.js dashboard (commits `d73beee`/`16ba107`) was **scrapped** — throwaway, to be
  redone from scratch.
- Gotcha discovered: demo data rolls stale at midnight mid-session, making all availability return
  `[]` — [knowledge/gotchas/demo-data-date-drift-no-such-slot.md](knowledge/gotchas/demo-data-date-drift-no-such-slot.md).

---

## Session 3 — 2026-06-10 (later that day): Fork resolved — ElevenLabs only

Tomer cut the knot: **"full on with 11Labs, delete everything OpenAI-related."**
The OpenAI Realtime path was deleted (commit `b494949`; recoverable at `8ba10d6`):
`bridge.py`, `tools.py`, `prompts.py`, `outbound.py`, `test_oai.py` all removed. The
gpt-realtime Hebrew-MOS open question became moot.

**The new stack** ([knowledge/decisions/runtime-fork-openai-vs-elevenlabs.md](knowledge/decisions/runtime-fork-openai-vs-elevenlabs.md)):
- ElevenLabs CAI owns the entire voice stack: telephony (imported Twilio number — new Twilio
  account, +13367295695), ASR (scribe_realtime), LLM (gpt-4o), TTS (eleven_v3_conversational —
  the only agents TTS model with Hebrew), turn-taking, system tools (end_call, transfer_to_number).
- **No middle server**: webhook tools hit Supabase PostgREST RPCs directly. The repo holds only
  config-as-code ([knowledge/patterns/elevenlabs-provisioning-as-code.md](knowledge/patterns/elevenlabs-provisioning-as-code.md))
  plus trigger/executor scripts. Canonical prompt lives inside `provision_elevenlabs.py`.
- Vercel back on the table for dashboard + scheduler cron (the "no Vercel" rule applied only to
  the deleted websocket bridge).

**Bugs found / hard-won lessons:**
- **LLM tool-calling ladder**: gemini-2.5-flash went silent → gpt-4o-mini *faked* tool calls →
  gpt-4o actually works
  ([knowledge/gotchas/elevenlabs-llm-tool-calling-ladder.md](knowledge/gotchas/elevenlabs-llm-tool-calling-ladder.md)).
- **v3 ignores IPA** for pronunciation — only alias dictionaries work
  ([knowledge/gotchas/elevenlabs-v3-pronunciation-alias-only.md](knowledge/gotchas/elevenlabs-v3-pronunciation-alias-only.md)).
- Stale `.env` values silently overriding provisioned IDs
  ([knowledge/gotchas/stale-env-overrides-provisioned-ids.md](knowledge/gotchas/stale-env-overrides-provisioned-ids.md)).

**Persona iteration:** מאיה → קראטוס → settled (for now) on **רוני** — male Hebrew clone voice
`wRcoZ4j6obhmFlVbHDKT`, masculine Hebrew prompt.

**Verified live (real phone calls, Tomer's phone), all with Supabase write-back**
(`reservations.status`, `call_attempts`, `scheduled_calls`):
confirm / cancel / change-time with negotiation (full slot → alternative offered) / callback
(row → watcher → automatic redial in +14s via `scheduler.py`, even chained twice —
[knowledge/patterns/maitre-callback-executor-loop.md](knowledge/patterns/maitre-callback-executor-loop.md)) /
needs_human.

Open at end of session: transfer_to_number untested (Twilio trial only dials verified numbers);
the "Levonteen" pronunciation alias unconfirmed by ear. Next planned: Twilio upgrade → live
transfer test → dashboard rebuild + Vercel cron + n8n.

---

## Session 4 — 2026-06-11: Voice/UX iteration marathon + the user-speaks-first opener

A long iteration session on voice quality and conversation UX, backed by a deep-research run
(Perplexity lane was down — API quota exhausted; report:
[knowledge/research/elevenlabs-outbound-research-2026-06-10.md](knowledge/research/elevenlabs-outbound-research-2026-06-10.md)).

**Voice cycle:** Kratos → ריסה → רוני(f) → גיא → Ava → **"hosteses"**, with the persona becoming
**מיקה** (feminine). Nothing locked in — iteration continues.

**The silent-agent bug, root-caused:** an empty `first_message` combined with
`disable_first_message_interruptions=true` suppresses **all** user turns — the agent never speaks
and never hears. Fix: make the flag conditional (false when first_message is empty).
[knowledge/gotchas/elevenlabs-empty-first-message-silent-agent.md](knowledge/gotchas/elevenlabs-empty-first-message-silent-agent.md).

**The user-speaks-first opener** (research-backed redesign,
[knowledge/decisions/user-speaks-first-outbound.md](knowledge/decisions/user-speaks-first-outbound.md)):
with the old fixed opener firing at t=0, the customer's pickup greeting ("הלו?", "כן?") was
transcribed during the un-interruptible first message and delivered to the LLM as the "answer" to
a question they never heard — phantom confirms. New design: the agent waits for the callee's
pickup greeting, then delivers the opener (`first_message = ""` + `turn.initial_wait_time = 4`
silence fallback, opener text as prompt rule 1). **Live-verified:** a pickup transcribed as "לא"
was correctly ignored; confirm/change/cancel/callback (including the autonomous redial via
scheduler) all passed on the new opener.

**Other findings and changes:**
- gpt-4o caught **fabricating slot lists without calling the tool** → added a same-turn TOOL
  CONTRACT to the prompt
  ([knowledge/gotchas/elevenlabs-llm-tool-calling-ladder.md](knowledge/gotchas/elevenlabs-llm-tool-calling-ladder.md),
  [knowledge/patterns/hebrew-voice-agent-speech-polish.md](knowledge/patterns/hebrew-voice-agent-speech-polish.md)).
- **Twilio upgraded to Full**; verified caller ID +972585121998 (the old one deleted); IL call
  rates measured. This unblocks the live transfer_to_number test.
- **v3 stability floor = 0.75** — below that the voice warps/cuts
  ([knowledge/gotchas/elevenlabs-v3-low-stability-chunk-glitches.md](knowledge/gotchas/elevenlabs-v3-low-stability-chunk-glitches.md)).
  Voice tuning knob map (speed / stability / latency / audio tags / "..." pauses):
  [knowledge/patterns/elevenlabs-v3-voice-tuning-knobs.md](knowledge/patterns/elevenlabs-v3-voice-tuning-knobs.md).
- Pronunciation: caps-stress aliases work ("levonTEEN", "Meeka"); verb respellings chop
  ("ni-ti-ka-sher") → avoid respelling that word.

**New trade-off discovered (open):** the opener is now an ordinary LLM turn = **interruptible**.
Background noise / repeated "הלו?" barges in and restarts it — on the callback redial the opener
restarted 3×. This became the #1 next task.

Commit `9514427`.

---

## Where we are now + next steps

**Current state:** persona **מיקה** (feminine), voice **"hosteses"** `SNXrahWBHym8CEMJveKQ`.
**NOTHING locked in** — voice/sound iteration continues. All 5 flows (confirm / cancel /
change-time with negotiation / callback / needs_human) re-verified on the new user-speaks-first
opener, including the autonomous callback redial.

**Next steps:**
1. **Interruption handling** (explicit #1 priority): background noise / repeated "הלו" cuts the
   opener mid-sentence and restarts it (callback call restarted it 3×). Candidates:
   `interruption_ignore_terms`, dropping the `interruption` client event, turn_eagerness=patient —
   WITHOUT resurrecting the silent-agent bug. Then re-test on good cellular reception.
2. Import verified caller ID **+972585121998** into ElevenLabs → dial FROM it (test calls then go
   to main **+972525898552**). Live transfer_to_number test (now unblocked — Full Twilio account).
3. Ear-verdicts pending good reception: stability 0.75 + [warm]/[friendly] audio tags + "..."
   pauses.
4. Later: post-call webhook → persist transcripts into `call_attempts.transcript` (the research
   report has the payload spec); dashboard rebuild; Vercel cron scheduler; n8n daily batch.

**Operational gotchas to know:**
- Demo data rolls stale at MIDNIGHT mid-session → all availability returns `[]` → run
  `supabase/reseed.py --clean`
  ([knowledge/gotchas/demo-data-date-drift-no-such-slot.md](knowledge/gotchas/demo-data-date-drift-no-such-slot.md)).
- The 21:00 slot is artificially FULL — it's a negotiation demo prop, not a bug.
- Test dials go to +972585121998.
- An old ElevenLabs agent `agent_2301k...` (the מאיה persona) is orphaned in the dashboard —
  delete whenever.
