# Phase B — n8n Cloud Automation (node-by-node build guide)

The bridge (Phase A) handles the live call and writes outcomes to Supabase directly. **n8n cloud is the
control plane**: it places the calls, learns their result via a Twilio status callback, and schedules
retries + callbacks. n8n never touches audio.

> Build these in the n8n cloud editor by hand — do not import JSON. Each workflow below lists the nodes
> in order with the key fields.

## Shared values (store as n8n credentials / variables)
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — Supabase REST + RPC (service role bypasses RLS).
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` — to place calls.
- `BRIDGE_HOST` — the bridge's public host (ngrok for testing, Fly/Render later). No scheme.
- `RESTAURANT_ID` = `11111111-1111-1111-1111-111111111111`.

A call is always placed the same way (Twilio REST `Calls` API):
```
POST https://api.twilio.com/2010-04-01/Accounts/{SID}/Calls.json   (Basic Auth: SID / token)
  To                     = <customer phone, E.164>
  From                   = {TWILIO_PHONE_NUMBER}
  Url                    = https://{BRIDGE_HOST}/outbound-twiml?reservation_id=<uuid>
  StatusCallback         = https://<n8n-webhook-url>/twilio-status?reservation_id=<uuid>&attempt=<n>
  StatusCallbackEvent    = completed
  StatusCallbackMethod   = POST
```
Custom query params on `StatusCallback` (reservation_id, attempt) survive into the callback POST — that's
how the retry workflow knows which reservation/attempt it was.

---

## WF1 — Daily outbound campaign
Calls every still-pending reservation for today, once.

1. **Schedule Trigger** — cron, timezone Asia/Jerusalem, e.g. daily 11:00.
2. **HTTP Request → Supabase RPC** `todays_pending_reservations`
   - POST `={{$env.SUPABASE_URL}}/rest/v1/rpc/todays_pending_reservations`
   - Headers: `apikey` + `Authorization: Bearer {service_role}`, `Content-Type: application/json`
   - Body: `{ "p_restaurant_id": "{RESTAURANT_ID}" }`
   - Returns rows: `reservation_id, customer_name, phone, reserved_for, party_size`.
3. **Loop Over Items** (Split In Batches, batch size 1) — one reservation at a time.
4. **Wait** — 5–10s between calls (avoid a burst).
5. **HTTP Request → Twilio Calls** — the call-creation request above, with
   `To = {{$json.phone}}`, `Url = …?reservation_id={{$json.reservation_id}}`,
   `StatusCallback = …?reservation_id={{$json.reservation_id}}&attempt=1`.

## WF2 — Retry unanswered (max 3, 1h apart)
Twilio POSTs here when a call ends.

1. **Webhook Trigger** — path `/twilio-status` (this URL is the `StatusCallback` above). Method POST.
2. **IF** `CallStatus` ∈ {`no-answer`, `busy`, `failed`} → continue (else → No-op; the bridge already
   logged answered calls).
3. **IF** `{{Number($json.query.attempt)}} < 3` **AND** reasonable hours → continue.
   - Reasonable hours: if `now` (Asia/Jerusalem) hour ≥ 21 or < 9, set `scheduled_for` to the next day 11:00
     instead of now+1h. (Use a Function/Set node to compute it.)
4. **HTTP Request → Supabase RPC** `log_call_outcome`
   - Body: `{ "p_reservation_id": "{{query.reservation_id}}", "p_direction": "outbound", "p_outcome": "no_answer", "p_provider": "twilio" }`
5. **HTTP Request → Supabase RPC** `schedule_call`
   - Body: `{ "p_reservation_id": "{{query.reservation_id}}", "p_restaurant_id": "{RESTAURANT_ID}", "p_kind": "retry", "p_scheduled_for": "<now+1h ISO or next-morning>", "p_attempts": {{Number(query.attempt)}} }`

## WF3 — Scheduled-calls poller (callbacks + retries)
Dials whatever is due — both the in-call callbacks (`schedule_callback`) and WF2's retries.

1. **Schedule Trigger** — every 10 min (every 1–2 min while testing).
2. **HTTP Request → Supabase RPC** `due_scheduled_calls`
   - Body: `{ "p_restaurant_id": "{RESTAURANT_ID}" }`
   - Returns due rows: `id, reservation_id, phone, kind, attempts, scheduled_for`.
3. **Loop Over Items** (batch 1).
4. **HTTP Request → Supabase REST** — mark in-progress (prevents double-dial):
   `PATCH {{SUPABASE_URL}}/rest/v1/scheduled_calls?id=eq.{{$json.id}}` body `{ "status": "in_progress" }`.
5. **HTTP Request → Twilio Calls** — place the call. `StatusCallback` carries
   `reservation_id={{$json.reservation_id}}&attempt={{ Number($json.attempts) + 1 }}` (so a failed
   retry chains correctly through WF2).
6. **HTTP Request → Supabase REST** — mark done:
   `PATCH …/scheduled_calls?id=eq.{{$json.id}}` body `{ "status": "done" }`.

---

## Telephony notes
- `StatusCallbackEvent=completed` gives the final disposition. The terminal `CallStatus` is one of
  `completed | busy | no-answer | failed | canceled`.
- **Machine detection (voicemail):** skip for the POC. If wanted later, add `MachineDetection=DetectMessageEnd`
  to the call params; Twilio then includes `AnsweredBy` in the status callback (`human` / `machine_*`).
- Live human-transfer is handled inside the bridge (`transfer_to_human` mode=live), not n8n.

## Testing fast (don't wait hours)
- n8n cloud reaches the local bridge via ngrok; `StatusCallback` reaches n8n's public webhook URL — all public.
- **Retry loop:** in WF2 temporarily schedule the retry `now()+2 min` and set WF3 to every 1 min. Place a
  call and DON'T answer → Twilio fires `no-answer` → WF2 schedules a retry → WF3 redials. Watch
  `scheduled_calls.attempts` climb and STOP at 3.
- **Callback:** on a live call tell Mika "תחזרי אליי בעוד שתי דקות" → a `scheduled_calls` row appears
  (kind=callback) → WF3 dials it ~2 min later.
- **Watch in Supabase:** `reservations.status`, `call_attempts`, `scheduled_calls`.

## Deploy (end state)
Bridge → Fly/Render (persistent WS; NOT Vercel). Dashboard → Vercel. Point `BRIDGE_HOST` and the Twilio
webhooks at the deployed bridge instead of ngrok.
