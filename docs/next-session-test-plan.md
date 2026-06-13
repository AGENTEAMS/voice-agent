# Next-Session Test Plan — Model Decision + Final Verification

**Goal:** run the full battery on the candidate model(s), pick **gpt-4o vs gemini-2.5-flash**,
update the deck's cost slide, then finish submission. Verify **decision-capture integrity**
(tool calls + DB state match the spoken agreement) after EVERY call.

## Context from last session (the model evaluation)
- **gpt-4o-mini** — ❌ fired 0 tools, fabricated checks/updates, no `end_call`.
- **gpt-5-mini** — ❌ checked OK but ~10s dead air (reasoning model), invented offers, never finished; n8n guard caught → `needs_human`.
- **gemini-2.5-flash** — ✅ passed ALL happy paths (change, cancel+why, no-fabrication negotiation, callback time-math, transfer) at **~$0.002/call vs gpt-4o ~$0.18 (≈100× cheaper)**. ❌ failed **F (false-confirm)** on the seamless opener; the greeting-only-opener fix made it F-safe but added a ~1s dead-space gap.
- **Cost source:** EL `GET /v1/convai/conversations/{id}` → `metadata.charging.llm_usage` (exact $ per call, per model). `agent/call_and_verify.py` now prints it.
- **Model swap:** `python agent/provision_elevenlabs.py --model <id>` (default gpt-4o = revert). Live agent currently **gpt-4o (proven)**.

## Two Gemini configs to A/B
- **(A)** Gemini + current seamless opener + "answer 'hello' not 'yes' on pickup" → no gap, F-risk mitigated by behavior.
- **(B)** Gemini + greeting-only opener + never-act-on-first-turn rules (reverted last session; re-apply to test) → F-safe, ~1s gap.

---

## SIMPLE (single tool / basics)
For each: confirm the ⚙ tool fired AND the DB row matches.
1. **Plain confirm** — "כן, מגיעים" → `set_reservation_status:confirmed` → `end_call`.
2. **Plain cancel** — "אני מבטל" → `cancelled` → asks **why** → `end_call`.
3. **Bare no** — just "לא, לא נגיע" → cancel flow, captured fast.
4. **Callback (relative)** — "תחזרי בעוד שעתיים" → `schedule_callback` (now+2h ISO) → status untouched.
5. **Callback (absolute)** — "תחזרי בחמש וחצי" → `schedule_callback` (today PM).
6. **Transfer** — "אני רוצה נציג" → `transfer_to_number`.
7. **FAQ hours** — "מה שעות הפתיחה?" → answer → continue.
8. **FAQ parking** — "יש חניה?" → חניון לב העיר → continue.
9. **FAQ cancellation policy** — "מה מדיניות הביטול?" → answer.
10. **FAQ vegetarian** — "יש אוכל צמחוני?" → answer.

## COMPLEX (multi-tool / negotiation)
11. **Party change + confirm** — "נהיה שמונה" → `check_availability` → gate "רוצה שאעדכן?" → `change_reservation` → `confirmed`.
12. **Time change (available)** — "תזיזי לשבע" → check → gate → change → confirm.
13. **Negotiation (FULL 21:00)** — "תשע בערב" → check → offer ONLY real free slots (21:30) → change → confirm. *(fabrication check)*
14. **Open availability** — "מה פנוי הערב?" → check → summarize REAL slots only. *(fabrication check)*
15. **Multi-change** — "תשני לשבע וגם נהיה שישה" → change time AND party.
16. **Confirm → reverse → cancel** — "כן" → (confirmed) → "רגע, בעצם תבטלי" → cancel + why. *(last-decision-wins)*
17. **Cancel → reverse → keep** — "תבטלי… לא, השאירי" → cancelled then re-confirmed.
18. **Change → then cancel** — "נהיה שמונה… בעצם תבטלי". *(gemini passed this)*
19. **FAQ mid-flow + confirm** — "כן, אבל יש חניה?" → parking → then confirm.
20. **Hesitation** — "אמ, לא בטוח, אולי" → clarify / offer callback / `needs_human`.

## ADVERSARIAL / ROBUSTNESS (the nasty ones — where cheap models break)
21. **False-confirm (F)** ⚠️ — blurt "כן כן" on pickup *before* the question → must NOT confirm. *(gemini fails on seamless opener; the workaround is to answer "hello")*
22. **Pickup greeting** — "הלו? מי זה?" → treated as greeting, she explains + asks.
23. **Echo immunity** — her opener echoes back as "guest" speech → must ignore (rule 1ב).
24. **Silence after question** — say nothing → she re-asks once, doesn't hang up early.
25. **Noise + decision word** — noisy turn with a clear "לא"/"כן" → act on the word.
26. **No-answer** — don't pick up → call fails → reconciliation keeps `pending`/retry.
27. **Instant hangup** — pick up + hang up → classified.
28. **Mid-call hangup after a tool** — → reconciliation flags `needs_human`.

---

## After testing
- [ ] Pick the model (gpt-4o safe default; gemini if it clears the adversarial set / the workaround is acceptable).
- [ ] Finalize the matching config + `provision_elevenlabs.py --model <chosen>` + verify.
- [ ] Update the deck **tech-stack slide** + add the **model-evaluation / cost slide** (4 models, ~100× cost finding — strong evaluation story for the rubric).
- [ ] Resume submission: README rewrite, scrub n8n webhook URL + IDs for public repo, fill teammate emails in `docs/submission/final-assignment.md`, export PDF.
- [ ] (Optional) real-time transfer lighting on the dashboard; wire `cancel_reason` through the cancel tool so the insights page runs on live data.
