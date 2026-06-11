# Handoff — Agent + Tools session

## Goal
Wire the Maître voice agent (מאיה / מסעדת לבונטין) to run on **ElevenLabs Conversational AI**
(over the Twilio number) and place real outbound reservation-confirmation calls that write back to Supabase.

## What was built this session
- **Outbound caller**: `projects/final/agent/outbound_elevenlabs.py` — places calls via the
  ElevenLabs Twilio outbound API. Before each call it reads the reservation from Supabase and passes
  dynamic vars: `customer_name`, `reservation_time`, `party_size`, `reservation_id`, `today`, `now_local`.
  `--list` shows today's pending reservations; `--reservation <uuid> --to <e164>` dials.
  Uses `load_dotenv(override=True)` so `.env` beats a stale shell `ELEVENLABS_API_KEY`.
- **Tool config reference**: `projects/final/docs/elevenlabs-tools-config.md` (also copied to ~/Downloads).
  Maps all 6 agent tools to ElevenLabs:
  - Webhooks → direct to Supabase RPC: `set_reservation_status`→apply_call_result,
    `check_availability`, `change_reservation`, `schedule_callback`→schedule_call.
    Headers: apikey + Bearer `{{SUPABASE_SERVICE_KEY}}`. Base URL:
    `https://ezxlnlpcppvqqmeqcswm.supabase.co/rest/v1/rpc/`. RESTAURANT_ID 11111111-...-111111111111.
  - System tools (native, no webhook): `transfer_to_human`→Transfer to number (HUMAN_TRANSFER_NUMBER),
    `end_call`→End call.
  - Full Hebrew **system prompt** covering all 6 tools + **first message** are in that doc.
- **Demo call script**: `projects/final/docs/demo-call-script-he.md` (Hebrew, 3 scenarios).
- **.env.example**: added `ELEVENLABS_AGENT_ID` (= agent_2301ktpn7shsfkashfdgp7tn50gd) and
  `ELEVENLABS_PHONE_NUMBER_ID`.

## Current state
- A **real test call succeeded**: conversation `conv_1001ktprwt5wfs6bvjkd5ee0cdej`,
  Twilio SID `CA8df3976ed56e688bb7a9eea267be1230`, to +972537227016 for נועה פרידמן (19:00, party 2).
- ElevenLabs agent id: `agent_2301ktpn7shsfkashfdgp7tn50gd`. Twilio number imported into ElevenLabs.
- `ELEVENLABS_API_KEY` + `ELEVENLABS_PHONE_NUMBER_ID` now live in `projects/final/.env`.

## Pending / next steps
1. **Verify the DB write** after that call — did `set_reservation_status` flip נועה to `confirmed`
   and add a `calls` row? (Check ElevenLabs Conversations log + dashboard.)
2. Confirm all 6 tools are actually saved in the ElevenLabs UI (only set_reservation_status was
   confirmed done; check_availability/change/schedule + the 2 system tools per the doc).
3. The ElevenLabs system prompt is a hand-adapted copy of `agent/prompts.py` — decide whether
   ElevenLabs is now the runtime of record and keep the two in sync (or retire the OpenAI bridge path).
4. Tune voice (female Hebrew, not "Eric"), language=Hebrew, interruptions disabled.
5. Inbound branch (no reservation_id) not handled in the ElevenLabs prompt yet.

## Files I touched (commit scope for this session)
- projects/final/agent/outbound_elevenlabs.py (new)
- projects/final/docs/elevenlabs-tools-config.md (new)
- projects/final/docs/demo-call-script-he.md (new)
- projects/final/.env.example (modified)

NOTE: `agent/bridge.py` (modified) and `agent/test_oai.py` (untracked) were already present at the
start of this session and are NOT mine — left untouched for their owner.
