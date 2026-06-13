# agent/ — Mika Voice Agent outbound caller (ElevenLabs Conversational AI)

ElevenLabs Conversational AI owns the entire voice stack: telephony (a Twilio number imported into
ElevenLabs), STT, LLM, TTS, turn-taking, and tool-calling. There is **no audio server in this repo**
— our code only *triggers* calls and owns the data the agent reads/writes (Supabase).

The agent (מאיה, hostess of מסעדת לבונטין) calls a guest with a reservation today, confirms /
cancels / changes it, and writes the outcome back to Supabase through webhook tools that hit
PostgREST RPCs directly.

## Files
- `outbound_elevenlabs.py` — place an outbound confirmation call. Reads the reservation from
  Supabase and passes `customer_name` / `reservation_time` / `party_size` / `reservation_id` /
  `today` / `now_local` as dynamic variables, so מאיה greets the right guest from the first word.

Source of truth for the agent config (system prompt, first message, all 6 tools):
`../docs/elevenlabs-tools-config.md`.

## Prerequisites
- Supabase schema + seed loaded (migrations `0001`–`0003` + `seed.sql`).
- `.env` at the repo root filled with: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
  `ELEVENLABS_API_KEY`, `ELEVENLABS_AGENT_ID`, `ELEVENLABS_PHONE_NUMBER_ID`.
- A Twilio number imported into ElevenLabs (Phone Numbers → Import) and attached to the agent.

## Place a test call (use YOUR OWN number)
```bash
cd agent
pip install -r requirements.txt

python outbound_elevenlabs.py --list                                  # today's pending reservations
python outbound_elevenlabs.py --reservation <uuid> --to +9725XXXXXXXX # it calls you
```

After the call, the reservation flips to `confirmed` / `cancelled` / `needs_human` via the
`apply_call_result` RPC. Seed phone numbers are FAKE — `--to` is mandatory by design.

## Gotchas
- **Demo data must be "today"**: shift both `reservations.reserved_for` AND `availability.date`
  before testing, or `check_availability` / `change_reservation` return `no_such_slot`.
- Twilio trial accounts play an English preamble and can only call verified numbers.
