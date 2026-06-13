# Callback Executor Loop — scheduled_calls → watcher → automatic redial

The agent schedules its own future calls: an in-call webhook tool writes a row, a dumb poller
dials when due. Live-verified end-to-end: guest said "call me in a minute", watcher fired the
callback **14 seconds after due time**, guest answered the new call — and chained another callback
from inside it.

## Context
Mika Voice Agent / ElevenLabs. `schedule_callback` tool → Supabase RPC `schedule_call` → `scheduled_calls`
(status enum pending/in_progress/done/cancelled/failed, `scheduled_for` timestamptz, `attempts`).

## Pattern body
- **Writer (in-call)**: the LLM converts spoken time to ISO-8601. Prompt contract: relative
  ("בעוד שעתיים") → add to `{{now_local}}`; bare clock ("חמש וחצי") → assume PM/upcoming evening
  TODAY; always Israel offset (+03:00). Verified: "עוד שעה" → exactly +1h, "אחת וחצי" → 13:30+03:00.
- **Executor** (`agent/scheduler.py`): SELECT `status=eq.pending&scheduled_for=lte.now` → mark
  `in_progress` (+attempts) → place EL outbound call → `done` / `failed`. One-shot for cron,
  `--watch` (20s poll) for local demos. POC safety: `--to` override redirects every dial to your
  own number (seed phones are fake).
- **Hosting**: local terminal watcher for demos; production = same logic as a Vercel Cron route
  (`vercel.json` crons → API route every 5 min). No server state — EL owns the call leg.
- **Gotchas**: PostgREST filter timestamps must go through `params=` (raw `+03:00` in the URL
  becomes a space → 400); stale pending rows from tests WILL fire when a watcher starts — cancel
  test rows (`status=cancelled`) or run `reseed.py --clean` between demo days.

## Related
[elevenlabs-provisioning-as-code](./elevenlabs-provisioning-as-code.md),
[stale-env-overrides-provisioned-ids](../gotchas/stale-env-overrides-provisioned-ids.md),
[demo-data-date-drift-no-such-slot](../gotchas/demo-data-date-drift-no-such-slot.md),
[maitre-voice-agent-architecture](../decisions/maitre-voice-agent-architecture.md)
