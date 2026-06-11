# Phase 0 — gates & setup (do these to unblock Phase 1)

> **⚠️ Historical.** Written before the runtime decision. As of 2026-06-10 the runtime of record is
> **ElevenLabs Conversational AI** (OpenAI Realtime bridge removed). Gate A (Supabase schema) is
> done and still valid; ignore OpenAI-specific steps below.

Three things must be true before the full loop works. None require writing more code.

---

## Gate A — Load the schema into Supabase  ⏱️ 5 min

Your project: `ezxlnlpcppvqqmeqcswm`. Pick ONE route.

### Route 1 — SQL editor (no password needed, fastest)
Supabase dashboard → **SQL Editor** → New query → paste & run, **in this order**:
1. `supabase/migrations/0001_init.sql`
2. `supabase/migrations/0002_rpc.sql`
3. `supabase/seed.sql`

(`supabase_realtime` publication and the `authenticated` role already exist in Supabase, so it runs clean.)

### Route 2 — psql one-liner (needs the DB connection string)
Dashboard → Project Settings → Database → **Connection string → URI**, paste it into `SUPABASE_DB_URL`
in `.env`, then:
```bash
cd projects/final/supabase
psql "$SUPABASE_DB_URL" -f migrations/0001_init.sql -f migrations/0002_rpc.sql -f seed.sql
```

### Route 3 — Supabase CLI
```bash
supabase link --project-ref ezxlnlpcppvqqmeqcswm
supabase db push
psql "$SUPABASE_DB_URL" -f supabase/seed.sql
```

**Verify:** SQL editor → `select status, count(*) from reservations group by 1;` → 12 pending + a few others.

> Want me to push it for you? Drop the **Connection string (URI)** into `SUPABASE_DB_URL` and say the word.

---

## Gate B — Twilio +972 number + credentials  ⏱️ long-lead, start now

Research correction: Israel is **not** address-gated the way we feared — a worldwide address + an
individual end-user is accepted, and Israel isn't on Twilio's strict-validation list. The real risk is
**number stock + bundle review latency**, so start day one.

Checklist:
1. Create a Twilio account → upgrade out of trial (add a payment method) so outbound isn't limited to
   verified numbers. (~$15 trial credit is enough for the POC.)
2. **Buy a number** with Voice: Console → Phone Numbers → Buy. Try an **Israeli (+972) local** number;
   if none in stock, a **US** number works fine for testing the agent (you just won't have a local CLI).
3. If +972 requires a Regulatory Bundle: submit it (worldwide address + proof of address < 3 months).
   If it stalls → fall back to a US number for the demo, or DIDWW/DIDLogic for +972 stock.
4. Put into `.env`: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` (E.164).
5. After `ngrok` is up, set the number's **Voice webhook** → `https://<PUBLIC_HOST>/incoming-call` (POST).

**Legal (keep it clean):** the agent is strictly confirm/cancel → transactional, outside Israeli spam +
Do-Not-Call rules. For the POC, **only call your own / consenting test numbers**. Never let it upsell.

---

## Gate C — Realtime Hebrew quality (in progress on the Playground)

You're already auditioning `gpt-realtime` in the OpenAI Playground with our system prompt. The bar:
- Sounds like a real Israeli host (not anglicized), times/numbers/names pronounced cleanly.
- Reads back before confirming, defers out-of-scope, refuses to upsell.

If it passes → ship s2s (current plan). If the accent/naturalness disappoints → trigger the deferred
cascade A/B (Soniox STT + a dedicated Hebrew TTS from the `eval/tts_audition` harness).

---

## After the gates → Phase 1 smoke test
```bash
# terminal 1
cd projects/final/agent && uvicorn bridge:app --port 5050
# terminal 2
ngrok http 5050     # copy host → PUBLIC_HOST in .env → restart uvicorn
# terminal 3
python outbound.py --list
python outbound.py --reservation <uuid> --to +9725XXXXXXXX   # your own number
```
Expected: your phone rings, מאיה greets in Hebrew, confirms/cancels, and the reservation row updates in
Supabase.
