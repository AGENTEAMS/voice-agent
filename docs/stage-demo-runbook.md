# Mika Stage — Test & Demo Runbook

The stage (`stage/`, localhost:3000) listens to **the database, not the caller**. Every
call — stage CTA, n8n batch, scheduler — goes through the same Supabase RPCs, each RPC
logs itself to `tool_events`, and Supabase Realtime pushes those rows to the browser.
So there is **no n8n↔stage configuration**: run the batch, the constellation lights up.
When a tool event arrives and no CTA call is in flight, the orb auto-wakes to "live"
(decays to idle after 25s of silence), and the highlighted guest follows the
`reservation_id` on incoming events.

## Pre-flight (EVERY test/demo session)
```bash
cd ~/Development/personal/voice-agent
agent/.venv/bin/python supabase/reseed.py --clean   # date drift! deletes decided rows + test rows
agent/.venv/bin/python agent/make_reservation.py --name "תומר אלזם" --phone +972585121998 --time 20:30 --party 4
agent/.venv/bin/python agent/make_reservation.py --name "תומר אלזם" --phone +972525898552 --time 19:00 --party 2
cd stage && npm run dev                  # localhost:3000 (+ /tonight in a second tab)
```
- Transfer (`transfer_to_human`) rings **+972525898552** — set so stage-call tests
  (which ring +972585121998) make the *other* device ring. Callbacks never fire on
  their own: `scheduler.py` executes them only when run manually.
- 21:00 is intentionally FULL (negotiation prop) — ask to move there to trigger the
  negotiation; 21:30 has room.
- Never edit the n8n workflow before the demo (`update_workflow` wipes node credentials).

## Test ladder

**Level 0 — Sim (no phone, no DB):** `localhost:3000/?sim=1` — scripted negotiation
through the same animation pipeline. Reload to replay. This is also the stage fallback.

**Level 1 — Realtime smoke (no phone, real DB):** with the stage open, fire one RPC:
```bash
agent/.venv/bin/python supabase/verify_rpc_shapes.py > /dev/null
```
Expected within ~1s: orb wakes to live, pulse → `check_availability` flare, caption
«בודקת זמינות ל־21:00…». Proves the full Realtime chain with zero telephony.
(Verified working 2026-06-13.)

**Level 2 — Single live call (stage CTA):** phone +972585121998 rings.
Click «התקשרי לאורח» → answer → confirm/negotiate → watch pulses + caption + row flip →
`/tonight` updates. Afterwards verify the triplet (transcript / tool calls / DB):
```bash
python agent/call_and_verify.py --reservation <uuid> --to +972585121998
```
(or check the row + `tool_events` in Supabase). The CTA can only dial the two
allowlisted test numbers — enforced server-side, unit-tested.

**CTA always works:** `stage/.env.local` sets `STAGE_CALL_TARGET=+972585121998`, so
clicking ANY guest dials the test phone with that guest's dynamic variables (מיקה
greets the selected guest by name). Pending rows in the strip are clickable to choose
who "answers". Remove that env line only if you want strict per-reservation dialing.

**Level 3 — n8n batch + stage as observer:** phone +972525898552 rings (n8n allowlist).
1. Stage + `/tonight` open on the projector.
2. YOUR-N8N-INSTANCE.app.n8n.cloud → «Maître — Call Today's Pending Reservations» → **Execute
   workflow** (manual trigger; the n8n execution view doubles as the orchestration
   visual).
3. Each batched call streams its tool events to the constellation as it happens;
   reconcile/no-answer outcomes land in `/tonight` (needs_human / retry stays pending).

## Demo-day flow (per pitch deck)
n8n Execute (orchestration story) → phone rings on stage → constellation traces the
negotiation live → flip to «סיכום הערב» → the night's book is updated. Fallbacks:
`?sim=1` + backup video.
