# Supabase — data layer

Mock Tel-Aviv restaurant + reservations for *today* + inbound FAQ policies. Verified to apply on
Postgres 16 + pgvector.

## Files
- `migrations/0001_init.sql` — 8-table schema, enums, indexes, `updated_at` trigger, RLS, realtime
  publication (only `reservations` + `call_attempts` stream live).
- `migrations/0002_rpc.sql` — in-call RPCs the agent calls directly (latency-critical, bypass n8n):
  - `apply_call_result(...)` — atomically set reservation status (`confirmed`/`cancelled`/`needs_human`)
    **+** log the call. The agent only calls this *after a spoken read-back*.
  - `log_call_outcome(...)` — non-decision outcomes (no_answer/voicemail/failed/answered_inbound).
  - `check_availability(restaurant, date, time, party_size)` — inbound availability lookup (`fits` flag).
  - `todays_pending_reservations(restaurant)` — the daily outbound work-list (Asia/Jerusalem "today").

## Run (cloud project)
```bash
cd projects/final/supabase
supabase link --project-ref <ref>        # one-time
supabase db push                          # applies migrations
psql "$SUPABASE_DB_URL" -f seed.sql       # load mock data
```

## Run (local)
```bash
supabase start                            # local stack (Docker)
supabase db reset                         # applies migrations + seed (if seed wired in config)
```

## Quick local sanity (no Supabase, throwaway PG)
```bash
docker run --rm -d -e POSTGRES_PASSWORD=pw -e POSTGRES_DB=app --name pgcheck pgvector/pgvector:pg16
docker exec -i pgcheck psql -U postgres -d app -c "create publication supabase_realtime;"
for f in migrations/0001_init.sql migrations/0002_rpc.sql seed.sql; do
  docker exec -i pgcheck psql -v ON_ERROR_STOP=1 -U postgres -d app < "$f"; done
docker stop pgcheck
```

## Notes
- Phone numbers in the seed are FAKE. For the POC, **only call your own / consenting test numbers**.
- `policies.embedding` is nullable — populate it only if you add pgvector RAG for inbound FAQ.
- Reservations are seeded relative to `now()::date` in Asia/Jerusalem, so the daily batch always has work.
