# Stage on Vercel + n8n-driven demo loop — design

**Date:** 2026-06-13
**Goal:** Deploy the `stage/` dashboard to a public Vercel URL (on a *different*
Vercel account, no CLI), and make the dashboard's call button run through the
existing n8n batch workflow — so the demo visibly "runs on n8n" — calling only
Tomer (+972585121998) once, with a clean-slate reset on every run.

## Decisions (locked with Tomer)

| # | Decision |
|---|----------|
| Number | Only `+972585121998` is dialed. The other Tomer number (`+972525898552`) is NOT called. |
| Re-run | Clean repeat only — no config knobs. |
| Reset timing | **On START** of each run (button click resets, then fires), so the call result stays on screen for the audience. |
| Domain | Free `*.vercel.app` subdomain (name TBD by Tomer). |
| Repo access | GitHub work (make public + secret-scrub) **deferred to later**. For now the new Vercel account imports the *private* repo by authorizing the Vercel GitHub app on it. |
| Engine | Reuse existing batch workflow `G7RYSw2BQgqnabJt` — add a webhook trigger, do not rebuild. |
| Vercel CLI | **Not used** — different account. Deploy via Vercel dashboard Git import. |

## Architecture

Three cooperating pieces; the dashboard is the only public surface.

```
[Browser: stage on Vercel]
      │  click "call" button
      ▼
[Vercel route POST /api/run]  (server-side, holds secrets)
      │  1. POST {SUPABASE_URL}/rest/v1/rpc/demo_reset   (service key)  → clean slate
      │  2. POST {N8N_WEBHOOK_URL}                                       → fire batch
      ▼
[n8n batch G7RYSw2BQgqnabJt]
      │  webhook trigger → fetch today's pending (only Tomer) → call +972585121998
      │  → poll status → deterministic reconcile → DB write-back
      ▼
[Supabase]  tool_events + reservations
      ▲
      │  Supabase Realtime (client subscription, source-agnostic)
[Browser: constellation lights up from DB events]
```

The board lights from `tool_events` over Supabase Realtime regardless of *who*
placed the call, so the visualization is identical whether the call came from
n8n, the old direct path, or the scheduler.

### Component 1 — `public.demo_reset()` Postgres RPC

Move the clean-slate logic out of Python and into the database so any caller
(Vercel, n8n, local) can reset over REST with the service key — no
`SUPABASE_DB_URL` secret needed at runtime.

- `SECURITY DEFINER`, uses `current_date` so it is always "today".
- Wipes reservations/customers (and dependent rows) for the restaurant, then
  reseeds:
  - A populated board where **every guest is `confirmed`** EXCEPT
  - **one** Tomer row, `pending`, phone `+972585121998` (the call target).
  - Negotiation props intact: 21:00 **full**, 20:00 + 21:30 have room.
- Idempotent: calling it twice yields the same slate.
- [supabase/demo_reset.py](../../../supabase/demo_reset.py) is rewritten to just
  call this RPC (keeps the one-command local/CI path; drops the duplicate-customer
  REST fallback trap entirely).
- New migration file under `supabase/migrations/`.

### Component 2 — n8n batch: webhook trigger + allowlist tightening

- Add a **Webhook trigger node** to `G7RYSw2BQgqnabJt`, wired into the same
  downstream node the manual trigger feeds. Both triggers coexist.
- Tighten "Build Call Payloads" allowlist to **`+972585121998` only** — a hard
  backstop so even a dirty DB cannot dial a second number.
- ⚠️ `update_workflow` **wipes the 6 HTTP-node credentials.** Plan step:
  re-pick all 6 in the n8n UI after the update, then live-test the webhook path.
- The webhook URL becomes `N8N_WEBHOOK_URL` (server-side env on Vercel). Treated
  as a secret — holding it lets a caller fire the batch.

### Component 3 — Vercel-ready `stage/`

- [stage/next.config.ts](../../../stage/next.config.ts): stop reading
  `../.env` via `process.loadEnvFile` (that file does not exist on Vercel).
  Read `NEXT_PUBLIC_*` from real env; keep the local-dev convenience behind a
  guarded try/catch so `npm run dev` still works locally.
- Replace [stage/app/api/call/route.ts](../../../stage/app/api/call/route.ts)
  direct-to-ElevenLabs logic with `POST /api/run`:
  1. `POST /rest/v1/rpc/demo_reset` (service key) — reset to clean slate.
  2. `POST N8N_WEBHOOK_URL` — fire the batch.
  3. Return ok / error to the button.
- ElevenLabs secrets become **optional** on Vercel: the only consumer left is
  [stage/app/api/call/[id]/route.ts](../../../stage/app/api/call/[id]/route.ts)
  transfer-detection poll, which is not demoed. If the key is absent it degrades
  gracefully (returns unknown); the board still lights from Realtime.

## Env var inventory (where each secret lives)

| Var | Vercel | n8n | Supabase | Notes |
|-----|:------:|:---:|:--------:|-------|
| `SUPABASE_URL` | ✅ | ✅ | — | also inlined as `NEXT_PUBLIC_SUPABASE_URL` |
| `SUPABASE_ANON_KEY` | ✅ | — | — | inlined as `NEXT_PUBLIC_SUPABASE_ANON_KEY` (browser Realtime) |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | ✅ | — | server-side only; used for `demo_reset` RPC + reads |
| `RESTAURANT_ID` | ✅ | ✅ | — | inlined as `NEXT_PUBLIC_RESTAURANT_ID` |
| `STAGE_CALL_TARGET` | ✅ | — | — | `+972585121998` |
| `N8N_WEBHOOK_URL` | ✅ | — | — | server-side only |
| `ELEVENLABS_API_KEY` | optional | ✅ | — | n8n needs it to place calls; Vercel only for non-demoed transfer poll |

## Manual steps Tomer must do (in-browser, not scriptable)

1. **Authorize the Vercel GitHub app** on the new account with access to the *private* `AGENTEAMS/voice-agent` repo. (Making the repo public + secret-scrub is deferred — see Decisions; not needed to deploy.)
2. **Import the repo into the new Vercel account** → set **Root Directory = `stage`** (framework auto-detects Next.js).
3. **Paste env vars** into Vercel project settings (I provide the exact list/values).
4. **Pick the `*.vercel.app` subdomain name** in Vercel.
5. **Re-pick the 6 HTTP-node credentials** in the n8n UI after I update the workflow (I'll guide node-by-node).

## Error handling

- `/api/run`: if `demo_reset` fails, do NOT fire the batch (return 502, surface the error) — never call on a dirty slate.
- `demo_reset()` runs in a single transaction; partial reseed cannot leak.
- n8n batch already classifies untouched/failed calls deterministically (reconcile guard) — unchanged.
- Allowlist tightening is the hard guarantee that no non-Tomer number is dialed even if the DB is unexpectedly dirty.

## Testing

- **RPC:** call `demo_reset` twice over REST; assert exactly one pending row at `+972585121998`, all others confirmed, 21:00 full / 20:00 + 21:30 open.
- **Local stage:** `npm run dev`, click button with a stub `N8N_WEBHOOK_URL` (or a test webhook) → assert reset ran then webhook POSTed.
- **n8n live:** fire the webhook → confirm exactly one call to `+972585121998`, DB write-back, board lights via Realtime.
- **Full loop pre-demo:** deployed Vercel URL → button → reset → call → result on screen → second click resets and re-runs.
- Keep existing `stage/lib/callPolicy.test.ts` green (allowlist change reflected).

## Out of scope

- Cancellation-insights feature (separate spec).
- Transfer demo (not shown).
- Per-run config knobs (explicitly declined).
- Custom domain (using free vercel.app subdomain).
- The scrapped `dashboard/` prototype.
