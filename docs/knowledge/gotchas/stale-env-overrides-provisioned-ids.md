# Stale .env Values Override Fresh Provisioning (and Placeholder Comments Become Values)

Two flavors of `.env` rot broke the Maître ElevenLabs runtime in one session: (1) old resource IDs
from a previous account silently winning over freshly-provisioned ones, and (2) placeholder
comments pasted as values crashing scripts.

## Context
New Twilio account replaced the old one; `provision_elevenlabs.py` imported the new number and
wrote ids to `agent/.provisioned.json`. But `outbound_elevenlabs.py` preferred env vars.

## Root cause + fix
- **Stale ID flavor**: `.env` still had `ELEVENLABS_PHONE_NUMBER_ID` from the OLD Twilio account.
  Calls dialed from the old number → Twilio trial rejected with "number unverified" even though
  the target WAS verified (on the new account). Maddening because the verified-caller-ID API
  query (new creds) said everything was fine.
  **Fix: `.provisioned.json` (written by the provisioning run) takes precedence over `.env`** for
  agent_id / phone_number_id. Env is only a manual override fallback.
- **Placeholder flavor**: lines like `ELEVENLABS_VOICE_ID=# pick a Hebrew voice...` and
  `SUPABASE_DB_URL=# Database → Connection string` make dotenv return the comment as the value →
  EL API "invalid voice_id", psycopg "missing = after #". **Fix: validate format before use**
  (voice id regex `[A-Za-z0-9]{10,40}`, DB URL must start with `postgres`), fall back to defaults.
- Related PostgREST gotcha (same session): timestamps with `+03:00` in hand-built query strings
  arrive as a space → HTTP 400. Always pass filters via `httpx params=` so `+` encodes to `%2B`.

## Related
[elevenlabs-provisioning-as-code](../patterns/elevenlabs-provisioning-as-code.md),
[maitre-callback-executor-loop](../patterns/maitre-callback-executor-loop.md),
*python314-load-dotenv-find-frame-bug*
