# Israeli outbound automated-call legality — the transactional exemption

A purely transactional automated call (confirming an existing reservation) sits **outside** both Israeli
anti-spam regimes — but a single marketing line flips it and triggers heavy fines.

## Context
Legal basis for the Mika Voice Agent's outbound confirm/cancel calls
([maitre-voice-agent-architecture](maitre-voice-agent-architecture.md)).
Researched + adversarially verified 2026-06-04. Confidence medium-high (secondary legal sources + Israeli
case law, not primary statute). Not legal advice.

## Decision / rule
A **confirm/cancel call about an existing booking** is transactional → outside:
- **Section 30A** (anti-spam): bans a *davar pirsomet* (advertisement) via auto-dialer without opt-in. A
  confirmation with no sale element isn't an advertisement (main-purpose test; *Cohen Halala v. AIG*).
- **Do-Not-Call registry (2023)**: applies to *marketing* calls (to engage in a transaction). Confirming an
  existing reservation isn't marketing.

## The hard line (why it's conditional)
Courts have grown stricter — even "event invitations" / "holiday greetings" have been ruled advertisements
(*Glasberg v. Psagot*: a free-course offer counted). **One** "specials / new menu / event" line → *davar
pirsomet* → opt-in + registry obligations. Exposure: **~₪46,080/violation** + **₪1,000/recipient**, business
liable for its providers.

## Enforced guardrails
1. Hard system-prompt rule: strictly transactional, never market/upsell (`agent/prompts.py` `_SHARED_RULES`).
2. POC: call only own/consenting test numbers.
3. Real +972 caller ID; reasonable hours.
4. Production: capture explicit opt-in at booking (stored in Supabase) + run wording past counsel.

## Related
[maitre-voice-agent-architecture](maitre-voice-agent-architecture.md),
[israeli-972-telephony-provisioning](../services/israeli-972-telephony-provisioning.md)
