# ElevenLabs v3 TTS Ignores IPA Pronunciation Rules — Alias Spellings Only

A pronunciation dictionary with IPA phoneme rules attached correctly to the agent did nothing on
`eleven_v3_conversational`. Phoneme alphabets (IPA/CMU) only work on the older flash/turbo v2
models; on v3 the only effective dictionary rule type is **alias** (text substitution).

## Context
Maître agent, Hebrew: "לבונטין" stressed wrong (should be milra — levonTIN) and "קראטוס" read as
kra-TOS instead of KRAY-tos. Created dict `maitre-hebrew` with IPA rules, verified the locator was
attached to the agent's `tts.pronunciation_dictionary_locators` and the version was current —
pronunciation unchanged on live calls.

## Root cause + fix
- v3 doesn't support phoneme tags/rules (a known model limitation; flash v2/turbo v2 do).
- Fix: switch rules to `{"type": "alias", "alias": ...}` with **stress-engineered spellings**:
  - `קראטוס` → `Kraytos` (Latin script makes v3 code-switch to an English reading → KRAY-tos)
  - `לבונטין` → `Levonteen` (English stresses "-een" endings → levon-TEEN)
- When refreshing rules via API, **remove-then-add** (`/remove-rules` + `/add-rules`) — add-rules
  alone appends and the old rule may still win. Then update the agent's locator `version_id`.
- **Ear-confirmed 2026-06-11**: plain "Levonteen" still mis-stressed; **CAPS on the stressed
  syllable fixed it** — `levonTEEN` = "perfect" per Tomer. Same trick: `מיקה` → `Meeka` (bare
  "Mika" came out "maka").
- **Limit found**: the trick works for NAMES but fails for verb respellings — `ונתקשר` →
  "venitkaSHER" was read as spelled-out syllables ("ni-ti-ka-sher like 4 words"). For ordinary
  words, don't alias: rewrite the text to avoid the word (opener now ends "ונחזור אליכם", prompt
  prefers נחזור over נתקשר everywhere).

## Related
[elevenlabs-provisioning-as-code](../patterns/elevenlabs-provisioning-as-code.md),
[hebrew-voice-agent-speech-polish](../patterns/hebrew-voice-agent-speech-polish.md),
[hebrew-tts-landscape](../services/hebrew-tts-landscape.md)
