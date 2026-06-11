# Handoff — Maître/Mika voice agent: in-call functions expansion (Phase A)

_Session date: 2026-06-10. Project: `projects/final/` — Hebrew restaurant voice agent (מסעדת לבונטין,
hostess "מיקה"). Voice runtime = Twilio Media Streams ↔ OpenAI Realtime (`gpt-realtime`), speech-to-speech._

## What was built
Expanded the agent from a 2-function confirm/cancel bot into a **6-function** reservation handler, plus the
Supabase + Twilio plumbing for callbacks/retries. The audio bridge already worked end-to-end before this
session (confirm/cancel verified on a real call to +972537227016); this session added:

1. **change time / party** — `check_availability` → new `change_reservation` RPC (atomic, availability-validated, party 1–12, locks + rebalances `availability.booked`).
2. **transfer to human** — default = **callback** (marks `needs_human` + schedules an ASAP callback row, then hangs up). Live `<Dial>` transfer is wired but OFF behind `HUMAN_TRANSFER_NUMBER` (user chose "callback now, live later").
3. **call back later** — `schedule_callback`: the model resolves spoken Hebrew time ("בעוד שעתיים") to ISO-8601; bridge validates (future, ≤14 days) and inserts a `scheduled_calls` row for n8n to dial.
4. **end call** — agent says goodbye, calls `end_call`; bridge queues a Twilio `mark` and hangs up only after Twilio reports the goodbye finished playing (so it's never clipped), with watchdog fallbacks.
5. Reworked Hebrew **prompt** — new opening line, off-topic refusal + redirect, spoken Hebrew times (20:00→"שמונה בערב"), read-back-before-write.

## Current state
- **Bridge running** locally: `uvicorn bridge:app` on :5050 (PID via `/tmp/maitre-uvicorn.log`), exposed by **ngrok** at `https://melony-brannier-prospectively.ngrok-free.dev` (free tier — host changes on restart).
- **Supabase** project `ezxlnlpcppvqqmeqcswm` (region `aws-1-eu-central-1`, pooler): migration 0003 loaded; `scheduled_calls` + `change_reservation`/`schedule_call`/`due_scheduled_calls` all DB-tested.
- **Demo data** re-seeded to *today*: reservations shifted forward AND `availability` rows shifted to today (they were stuck on 2026-06-08, which broke `check_availability`/`change_reservation` until fixed).
- **Codex review loop ran 3 rounds** (user-requested "review with codex, fix with claude, up to 3x or until clean"): R1 found 6 (2 HIGH), R2 found 6 (0 HIGH), R3 confirmed all fixes correct + 1 last MEDIUM fixed. **No HIGH/MEDIUM remaining.** Fixes covered: SQL race/locking + party validation, async task teardown (no gather hang), idempotent hangup, two-stage watchdog (long gen-fallback 30s → short post-mark playback-fallback 8s, so long goodbyes aren't cut), tool-error recovery, connect-failure cleanup, live-transfer callerId guard.
- **Tooling present**: `psql` at `/opt/homebrew/opt/libpq/bin/psql`; `codex` CLI 0.124.0; agent venv at `projects/final/agent/.venv`.

## Files changed (committed this session)
- `projects/final/supabase/migrations/0003_incall.sql` — NEW: `scheduled_calls` table (callbacks+retries) + `change_reservation` / `schedule_call` / `due_scheduled_calls` RPCs.
- `projects/final/agent/prompts.py` — rewrote `outbound_instructions` (now takes `now_he`), `_he_time`/`_he_party` helpers, off-topic rule, +4 tool schemas (change_reservation, transfer_to_human, schedule_callback, end_call).
- `projects/final/agent/tools.py` — added `change_reservation`, `schedule_call`, `mark_needs_human`, `log_outcome`.
- `projects/final/agent/bridge.py` — Twilio client + `call_sid` capture; new `_handle_tool` branches; `end_call` terminal flow (goodbye → mark → hangup) with `_finish_call` (idempotent) + `_finish_after` watchdogs; task-based teardown; tool-error recovery.
- `projects/final/agent/test_oai.py` — NEW: standalone OpenAI Realtime connectivity test (isolates the OpenAI half from Twilio; used to prove the model/session config was correct).
- `projects/final/docs/n8n-automation-guide.md` — NEW: Phase B node-by-node build guide.
- `projects/final/.env.example` — added `HUMAN_TRANSFER_NUMBER` (NOTE: gitignored in this repo, so not in the commit).

## Key decisions
- **Bridge can't run on n8n or Vercel.** It's a persistent bidirectional WebSocket → must deploy to Fly/Render. n8n = control plane only; Vercel = dashboard only. (Corrected a user assumption.)
- **n8n cloud** is the automation layer (daily campaign, retry-unanswered ≤3×/1h, callback poller) — built node-by-node, never JSON (per user rule). Not built yet.
- **Did NOT widen** `reservation_status` enum or `apply_call_result`; callbacks/retries live in the new `scheduled_calls` table; `needs_human` + `log_call_outcome` cover transfers.
- **Hangup timing** keyed on the `response.done` of the `end_call` response + a Twilio `mark` (correct "play-then-hangup" pattern), not a fixed sleep.
- **`availability.booked` is advisory** in the POC (seeded independently); capacity gating uses derived `available`. Documented in the migration; tighten before production.

## Verified vs NOT verified
- VERIFIED (DB-level): change_reservation (move + party + invalid-party reject + revert), schedule_call, due_scheduled_calls, check_availability. Bridge compiles + imports (6 tools, Twilio client ready), health OK.
- NOT verified: **live voice test of the new functions** (needs a human on the phone — change-time / callback / transfer / auto-hangup). n8n workflows. Live `<Dial>` transfer path.

## What's left / next steps
1. **Live-test Phase A**: `cd projects/final/agent && source .venv/bin/activate && PUBLIC_HOST=<ngrok-host> python outbound.py --reservation <uuid> --to +972537227016` (press `1` at Twilio trial gate). Try: confirm→auto-hangup, "אפשר לשנות לתשע וחצי", "תחזרי בעוד 5 דקות". Watch `/tmp/maitre-uvicorn.log` + Supabase rows.
2. **Build Phase B** in n8n cloud per `docs/n8n-automation-guide.md` (3 workflows). Test fast with short retry/poller intervals.
3. **Upgrade Twilio** off trial ($20) to drop the "press any key" gate before any real demo; then can dial unverified numbers.
4. Deploy: bridge → Fly/Render, dashboard → Vercel.

## Gotchas for next session
- ngrok host is ephemeral — re-check `curl -s localhost:4040/api/tunnels` and pass it as `PUBLIC_HOST`.
- Twilio account is **Trial**: only the verified number **+972537227016** is callable; trial plays an English "press any key" preamble before the bridge runs.
- DB pooler URL (psql): `postgresql://postgres.ezxlnlpcppvqqmeqcswm:<DB_PASSWORD>@aws-1-eu-central-1.pooler.supabase.com:5432/postgres` (direct `db.<ref>.supabase.co` is IPv6-only, won't resolve locally).
- Demo data must be "today": if dates roll, shift both `reservations.reserved_for` AND `availability.date` to today, or `check_availability`/`change_reservation` return `no_such_slot`.
- A parallel ElevenLabs Conversational AI path appeared in `.env.example` (`outbound_elevenlabs.py`, `ELEVENLABS_AGENT_ID`) — user exploring it separately; not part of this Phase A work.
