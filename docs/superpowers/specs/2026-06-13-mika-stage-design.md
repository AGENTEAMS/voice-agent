# «מיקה — במה» (Mika Stage) — Demo Dashboard Design

**Date:** 2026-06-13 · **Deadline:** presentation 2026-06-14 16:00 (Google Campus TLV)
**Status:** approved by Tomer (layout A "demo theater", animation concept 1 "Constellation", CTA option A "direct single call", full autonomy granted)

## Goal

A single-screen, presentation-grade live demo UI that replaces the rejected cloud-design
prototype. One click places a real outbound call via ElevenLabs; the screen visualizes the
agent's *tool activity and database writes* in real time as an animated constellation.
**No live transcript anywhere** (deliberately dropped — it was the only unverified data
channel; tool/DB events via Supabase Realtime are guaranteed).

The cloud (Claude design) variant chases this same spec via a correction prompt; we keep
whichever turns out better. This spec governs the local build.

## Locked decisions

| Decision | Choice |
|---|---|
| Screen shape | Demo theater — live call is the hero; reservations are a muted side strip |
| Animation | Constellation: מיקה voice-orb center, 5 tool nodes + Supabase node orbiting |
| CTA | «התקשרי לאורח» → direct ElevenLabs outbound call for the selected reservation |
| Transcript | None |
| Palette | bg `#0B0C0F`, surfaces `#111317`, borders `#26292F`, text grays; accent amber `#E8A33D`; green `#5FBF77` ONLY for landed DB writes / resolved states |
| Type | Heebo (Hebrew UI) + IBM Plex Mono (tool names); RTL throughout |
| Motion | Slow, confident: breathing glow, traveling pulses, soft springs. No flashing/spinning |

## Architecture

New `stage/` directory — a minimal Next.js (App Router) app. The scrapped `dashboard/`
prototype stays untouched. No auth (localhost demo). No new deps beyond `next`, `react`,
`@supabase/supabase-js`. Animations in plain CSS keyframes + a small TS event queue.

```
stage/
  app/
    page.tsx               # the stage (client component)
    layout.tsx             # RTL html, fonts, metadata
    globals.css            # palette tokens + all keyframes
    api/call/route.ts      # POST: place outbound call (allowlist enforced)
    api/call/[id]/route.ts # GET: proxy EL conversation status (server holds xi-api-key)
  lib/
    supabase.ts            # browser client (anon key) + Realtime channel helper
    constellation.ts       # event queue → animation state machine
    sim.ts                 # scripted demo event sequence (?sim=1)
  components/
    Stage.tsx              # orb + nodes + wires + pulse renderer
    ReservationsStrip.tsx  # tonight's list, highlight + status-flip animation
    CallButton.tsx         # CTA, state-aware
```

### Data flow (all channels verified-or-guaranteed)

1. **Call start:** CTA → `POST /api/call {reservation_id}` → route loads reservation from
   Supabase (service key, server-side), **rejects unless phone ∈ allowlist**
   (`+972525898552`, `+972585121998`; same discipline as the n8n batch; demo target
   override env `STAGE_CALL_TARGET` may redirect an allowlisted reservation to the test
   phone). Calls `POST https://api.elevenlabs.io/v1/convai/twilio/outbound-call` with the
   exact payload shape of `agent/outbound_elevenlabs.py` (agent_id, agent_phone_number_id,
   to_number, `conversation_initiation_client_data.dynamic_variables`). Response
   `conversation_id` + `callSid` returned to the client. IDs come from `.provisioned.json`
   first, `.env` second (stale-env rule).
2. **Orb state:** client polls `GET /api/call/{conversation_id}` every 2s (server-side
   fetch with `xi-api-key`; never exposed to browser). Status drives:
   `idle → dialing (initiated) → live (in-progress) → resolved (done)`.
3. **Tool events (the star):** new `tool_events` table; each of our 4 RPCs logs itself on
   entry (one INSERT). Browser subscribes via Supabase Realtime (`postgres_changes`,
   INSERT on `tool_events` + UPDATE on `reservations` + INSERT on `scheduled_calls`).
   Constellation fires: pulse → node flare; write events continue pulse → Supabase node
   green flash. One call runs at a time during the demo, so time-window correlation is
   sufficient; `reservation_id` included where the RPC receives it.
4. **Resolution:** `reservations` UPDATE via Realtime flips the strip row
   (pending → confirmed/cancelled/changed) with the single green settle moment; orb
   returns to idle.

### Tool-node ↔ event mapping

| Node (label) | Source |
|---|---|
| `check_availability` | `tool_events` INSERT (RPC converted `sql stable` → `plpgsql volatile` to allow logging; PostgREST POST path unaffected — must re-verify EL tool still gets identical response shape) |
| `change_reservation` | `tool_events` INSERT + `reservations` UPDATE |
| `set_reservation_status` (RPC `apply_call_result`) | `tool_events` INSERT + `reservations` UPDATE |
| `schedule_callback` (RPC `schedule_call`) | `tool_events` INSERT + `scheduled_calls` INSERT |
| `transfer_to_human` | EL system tool, no DB write — best-effort from EL status poll; not in demo script |
| Supabase node | any write event (green) |

### Migration (`supabase/migrations/0004_tool_events.sql`)

- `tool_events(id, restaurant_id, reservation_id nullable, tool_name text, payload jsonb,
  created_at)` + `alter publication supabase_realtime add table tool_events` (and
  `reservations`, `scheduled_calls` if not already published).
- Add logging INSERT to `apply_call_result`, `change_reservation`, `schedule_call`;
  rewrite `check_availability` as plpgsql with logging + identical `return query`.
- **Risk control:** these RPCs are live-verified the night before the demo. After applying,
  re-verify each via direct REST calls (response-shape diff) and finally one live call
  (`agent/call_and_verify.py`) — gated on Tomer's go (his phone rings).

### Simulation mode

`?sim=1`: `sim.ts` replays a scripted negotiation call (dial 4s → live → check_availability
(fits=false) → check_availability (21:30 fits) → change_reservation → apply_call_result
confirmed → resolved) through the same event queue the Realtime channel feeds. Used for
rehearsal, screenshot verification, and as stage fallback alongside the backup video.

## States & micro-interactions

- **idle:** orb breathes (3s cycle); CTA enabled; strip quiet.
- **dialing:** orb pulse 1.2s; CTA disabled with «מחייגת…»; called guest's row highlighted.
- **live:** equalizer bars in orb; wires faintly energized; pulses fire per event.
- **resolved:** one green settle on orb + row flip; after 2.5s back to idle.
- Pulse choreography: 600ms wire travel → 900ms node flare → (writes) 400ms continue to DB
  node → 700ms green flash. Queue serializes overlapping events 250ms apart.

## Out of scope (YAGNI)

Transcript UI, stats cards, funnel charts, n8n batch trigger, auth, mobile layout
(stage runs on a laptop + projector, 16:9), multi-restaurant switcher.

## Verification

1. `npm run build` clean; dev server up.
2. Playwright screenshots: idle / sim-live / sim-resolved — checked against this spec
   (palette, spacing, RTL, type) per the screenshot-verification rule.
3. RPC response-shape diff pre/post migration (direct REST).
4. Live call end-to-end (gated on Tomer): reseed --clean → recreate test reservation →
   call from CTA → constellation traces real events → DB state verified via
   `call_and_verify.py` printout.
