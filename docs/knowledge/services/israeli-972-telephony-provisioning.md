# Israeli +972 telephony provisioning (Twilio / Telnyx)

Getting an Israeli phone number for an automated voice agent. The feared blocker (local-address regulatory
bundle) is **mostly a myth**; the real risk is **number stock + review latency**.

## Context
Telephony for the Mika Voice Agent voice agent ([maitre-voice-agent-architecture](../decisions/maitre-voice-agent-architecture.md)). Adversarially verified 2026-06-04
(the original research assumed a local-address bundle was the killer — that was refuted).

## What's actually true
- **No local Israeli address required.** Twilio and Telnyx both accept a **worldwide/foreign address** for
  Israeli local DIDs. Individual end-user is fine (not business-only). Israel is **not** on Twilio's strict
  address-validation list. Proof of address (<3mo) may be requested; a foreign one satisfies it.
- **Approval is days, not weeks** (Twilio targets 24–72h). Telnyx Israeli local numbers from ~$1/mo;
  Twilio ~$5.50/mo. Outbound to Israeli mobile ~$0.065/min, landline ~$0.03/min, inbound ~$0.01/min.
- **Trial limit is trivially lifted**: Twilio trial restricts outbound to verified numbers — removed
  instantly when you add a payment method (no multi-day approval).

## The real risks
1. **Stock** — Israeli local DIDs aren't always in self-serve inventory. If a search returns zero, file a
   Telnyx Advanced Order / Twilio Private Offering (slow, best-effort), or use a +972 reseller (**DIDWW**,
   **DIDLogic**) for faster stock.
2. **Review latency** can slip to "several weeks" worst case → start day one.

## Practical path for a POC
Buy a +972 local DID on Twilio; bring it into the voice runtime via SIP/Media Streams
([twilio-openai-realtime-bridge](../patterns/twilio-openai-realtime-bridge.md)). If +972 stalls, a **US number works for testing the agent** (you just
lack a local CLI). For inbound only, you can **call-forward an already-owned Israeli line** into a Twilio DID
(no porting). Use a real +972 caller ID for answer-rate/trust.

## Open question
- #open-question Is an Israeli local +972 voice DID in self-serve stock on Twilio/Telnyx right now, or will
  it need an advanced order / reseller? (Resolve on day one by searching both consoles.)

## Related
[maitre-voice-agent-architecture](../decisions/maitre-voice-agent-architecture.md),
[twilio-openai-realtime-bridge](../patterns/twilio-openai-realtime-bridge.md),
[israeli-outbound-call-legality](../decisions/israeli-outbound-call-legality.md)
