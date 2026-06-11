# Hebrew Voice-Agent Speech Polish — the rules that made Maître sound human

Accumulated from ~10 live test calls with Tomer playing the guest. Each rule fixed a specific
"that sounded wrong/robotic" complaint. Reusable for any Hebrew phone agent.

## Context
Maître / ElevenLabs CAI / gpt-4o / v3 TTS, 2026-06-10 iteration session.

## Pattern body
- **Times in spoken Hebrew, computed in code, not prompted**: pass `reservation_time_spoken`
  ("שמונה בערב", "תשע וחצי") and `party_size_spoken` ("שני סועדים") as dynamic variables for the
  scripted first message; back it with a prompt rule banning 24h speech ("עשרים") for generated
  turns. TTS reads "20:00" as "עשרים" — never let raw HH:MM reach the voice.
- **Opening = full context + escape hatch**: introduce as "המארח הדיגיטלי" (no "can I speak
  with…"), state time + party, ask "still coming?", AND offer upfront "אם עכשיו לא נוח — תגידו
  מתי לחזור אליכם". The upfront offer made hesitant guests self-route to callback.
- **Restate BOTH details after any change** — time AND party size ("אז עדכנתי — תשע וחצי, שני
  סועדים"), guests need the full readback.
- **Goodbye exactly once**: the farewell goes ONLY in the end_call message; the last regular reply
  is content-only. Otherwise the model says it twice (regular turn + end_call speech).
- **Bridge lines verb-first, no waiting words**: "אני בודק זמינות לתשע וחצי", not "רגע, אני
  בודק…". Combined with per-tool `force_pre_tool_speech` → zero dead air during webhooks.
- **No backstage talk**: never "אני מתזמן את השיחה במערכת" — guests get "סגור, נחזור אליך".
- **Voice knobs are per-voice** — full map in
  [elevenlabs-v3-voice-tuning-knobs](./elevenlabs-v3-voice-tuning-knobs.md) (speed range
  used across voices: 0.7–1.2; stability hard floor 0.75; streaming latency 3).
- **Audio tags, now deliberate**: prompt instructs `[warm]` on opener/goodbye, `[friendly]` on
  confirmations — English-only, max one per sentence or two; rendered as tone, never read aloud.
- **Pauses via ellipsis**: never two ideas in one breath — `" ... "` between action-ack and
  farewell ("ביטלתי את ההזמנה. ... שיהיה לך ערב נעים"), v3 renders it as a natural beat.
- **Range availability questions**: generic bridge ("אני בודקת מה פנוי לנו הערב" — never name an
  hour the guest didn't ask for), 1–2 back-to-back tool calls with no extra bridge between them,
  then ONE summary sentence of free slots. Never slot-by-slot with per-check narration.
- **Vocabulary dodges**: prefer "נחזור אליך" over "נתקשר" (TTS mis-stress unfixable by alias —
  see [elevenlabs-v3-pronunciation-alias-only](../gotchas/elevenlabs-v3-pronunciation-alias-only.md)).
- **User speaks first on outbound** — opener only after the pickup "הלו"; see
  [user-speaks-first-outbound](../decisions/user-speaks-first-outbound.md).
- Pronunciation fixes via alias dictionary only — see
  [elevenlabs-v3-pronunciation-alias-only](../gotchas/elevenlabs-v3-pronunciation-alias-only.md).

## Related
[elevenlabs-v3-pronunciation-alias-only](../gotchas/elevenlabs-v3-pronunciation-alias-only.md),
[elevenlabs-provisioning-as-code](./elevenlabs-provisioning-as-code.md),
[hebrew-tts-landscape](../services/hebrew-tts-landscape.md),
[runtime-fork-openai-vs-elevenlabs](../decisions/runtime-fork-openai-vs-elevenlabs.md)
