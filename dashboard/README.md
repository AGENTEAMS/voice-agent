# Maître — Live Demo Dashboard

A Hebrew, RTL, dark-mode dashboard for the Maître voice agent. Shows today's reservations,
call outcomes + transcripts, KPIs, and a live "agent calling" view — driven by the project's
Supabase mock data. Built for a live demonstration.

> Design spec: `../../../docs/superpowers/specs/2026-06-09-maitre-demo-dashboard-design.md`

## What it shows

- **KPI bar** — confirmation rate, calls today, pending/confirmed counts, needs-human, avg duration, spend.
- **Reservations board** — today's reservations grouped by status (needs-human · pending · confirmed · cancelled), live-updating.
- **Call log + transcript drawer** — every `call_attempt` with outcome, intent, confidence, duration, cost; click a row for the turn-by-turn Hebrew transcript.
- **Live call panel** — streams an in-progress call's transcript in real time.
- **Simulate call** — the "📞 התקשר עכשיו" button on a pending reservation runs a scripted Hebrew confirmation call (no Twilio needed): it streams transcript turns into Supabase and flips the reservation to *confirmed* — the board, KPIs, and live panel all react live.

## Architecture

- **Next.js 16** (App Router) + Tailwind v4. RTL-first (`dir="rtl"`, Heebo font, numbers in `<bdi>`).
- **Single source of truth = Supabase.** All reads/writes happen **server-side with the service-role key** (Route Handlers); the browser never sees secrets.
- **Live updates via SSE.** The server keeps a snapshot (`src/lib/live-store.ts`) refreshed from Supabase; `GET /api/stream` (Server-Sent Events) pushes it to the browser. The active SSE connection drives refreshes (poll + nudge-on-write), so a simulated call streams live and a real agent call writing the same `call_attempts` shape would render identically.
- Writes: `POST /api/calls/start` · `/api/calls/turn` · `/api/calls/finish`.

```
src/
  app/
    page.tsx                 server: warms the store, hands client the initial snapshot
    api/stream/route.ts      SSE — pushes snapshots
    api/calls/{start,turn,finish}/route.ts
  lib/
    live-store.ts            server snapshot store (Supabase reads + Realtime + poll)
    supabase-admin.ts        service-role client (server only)
    kpis.ts / demo-script.ts pure, unit-tested
    format.ts / types.ts / cn.ts
  components/                dashboard, board, call log, drawer, live panel, KPI bar, ...
scripts/seed-calls.mjs       seeds demo call history (service-role, no psql needed)
```

## Setup

1. **Env** — `.env.local` (gitignored) needs:
   ```
   NEXT_PUBLIC_SUPABASE_URL=...
   NEXT_PUBLIC_SUPABASE_ANON_KEY=...
   SUPABASE_SERVICE_ROLE_KEY=...
   NEXT_PUBLIC_RESTAURANT_ID=11111111-1111-1111-1111-111111111111
   ```
   These mirror the keys in `projects/final/.env`.

2. **Seed demo call history** (one-time; the schema + reservations come from `../supabase/seed.sql`):
   ```bash
   npm run seed:calls
   ```
   Re-runnable. Inserts `provider='seed'` calls and reconciles reservation statuses so the
   demo state is deterministic (1 confirmed, 1 cancelled, 1 needs-human, rest pending).

3. **Run**:
   ```bash
   npm run dev      # http://localhost:3000
   ```

## Test

```bash
npm test           # vitest — kpis + demo-script
```

## Notes

- Reads use the service-role key on the server, so **no anon RLS policies are required**.
  If you ever want the browser to read Supabase directly instead, apply
  `../supabase/extras/anon_read_policies.sql` (needs DB access) and switch the client over.
- The dashboard runs locally for the demo. The SSE + server-side store pattern assumes a
  long-lived Node server (`next dev` / `next start`), not serverless.
