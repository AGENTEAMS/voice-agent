# Legal — Israeli outbound-call compliance (summary)

Researched + adversarially verified (2026-06-04). Confidence: medium-high (secondary legal sources +
Israeli case law; not primary statute). **Not legal advice** — confirm wording with counsel before any
real-customer campaign.

## Bottom line
A **pure confirm/cancel** call about an **existing reservation** is **transactional**, so it sits
**outside both**:
- **Section 30A** (anti-spam) — applies to a *davar pirsomet* (advertisement) sent via automatic dialing
  without prior opt-in. A confirmation with no sale element isn't an advertisement.
- **Do-Not-Call registry** (2023) — applies to *marketing* calls (calls to engage in a transaction).
  Confirming an existing booking isn't marketing.

Israeli courts apply a **main-purpose test** (e.g. *Cohen Halala v. AIG*: a service message with an
incidental economic interest was held not an advertisement).

## The hard line that must not be crossed
Courts have grown **stricter** — even "invitations to events" or "holiday greetings" have been ruled
advertisements (*Glasberg v. Psagot*: a free-course offer counted). **One** "come try our specials /
new menu / event" line flips the call into *davar pirsomet*, triggering opt-in + registry obligations.
Exposure: **~₪46,080 per violation** (admin fine) + **₪1,000 per recipient** (statutory civil damages),
with the business liable for its service providers.

## Guardrails (enforced in the build)
1. **Hard prompt rule** — the agent is strictly transactional; it must never market, upsell, or mention
   specials/events/new dishes. (See `agent/prompts.py` `_SHARED_RULES`.)
2. **POC scope** — call only your own / consenting test numbers. No real strangers.
3. **Real +972 caller ID** — for trust + answer rate; respect reasonable calling hours.
4. **Production only** — capture explicit opt-in at booking time ("we may call to confirm"), stored in
   Supabase, which independently satisfies the consent exemption; then run wording past counsel.
