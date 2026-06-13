# Pitch Deck Brief - מיקה (5 slides) · paste-ready for Claude Design

Matches the hand-built HTML deck (`pitch-deck.html`) 1:1 in content + aesthetic, so you can
compare the two renderings. Grounded in `final-assignment.md` (measured numbers) + the course
Project Breakdown rules (large fonts, minimal text, evaluation-with-numbers, challenges+solutions,
"convince us it deserves a pilot"). Language: **Hebrew, RTL**. Target: ~6 min.

> Note on structure: your spoken flow was *overview → problem+savings → tech+struggles →
> results*. I split **tech stack** and **struggles** into two slides (3 & 4) so neither is
> cramped - that's 5 clean slides. Merge them back to 4 if you prefer fewer.

---

## ▶ PASTE THIS INTO CLAUDE DESIGN

> Design a **5-slide pitch deck**, **Hebrew (RTL)**, 16:9, for a live class pitch.
> **Aesthetic: refined editorial on warm cream paper** - NOT corporate, NOT a dark dashboard.
> Background a soft warm cream (#F4EDDD) with a faint paper grain; ink is a warm near-black
> (#241F18); ONE sharp accent - ember/terracotta (#C0542A) - used only on the single hero number
> or key phrase per slide; a quiet secondary olive (#6E6A45). Add a tiny, elegant **constellation
> motif** in fine ink linework (a nod to a live voice-assistant), small in a corner - never busy.
> Typography: a beautiful **Hebrew serif for headlines** (Frank Ruhl Libre, heavy weights) paired
> with a clean **Hebrew sans for body** (Heebo). Huge headlines, **min 24px body, ≤3 bullets per
> slide**, generous whitespace, hairline rules, tabular numerals for stats. A thin running header
> ("מיקה - המארחת הדיגיטלית · מסעדת קיסו") and footer (page no. · "רעי · חיים · תומר").
> Use the exact Hebrew copy below; English lines are speaker notes, NOT on the slide.
> Make the **section header (eyebrow) on every slide LARGE and prominent** (~30px+), not a tiny
> label. In RTL, any "leads to" flow arrow must point **left (←)**, never right.

---

## Slide 1 - מה מיקה עושה (overview + DEMO)  *(~1.5 min)*
**Eyebrow:** פיץ׳ · 6 דקות · דמו חי
**Headline (huge serif):** מיקה - המארחת הדיגיטלית
**Sub:** מתקשרת לכל הזמנה, מדברת עברית טבעית, ומעדכנת את המערכת - עוד לפני שניתקה.
**Badge (ink pill, pulsing ember dot):** ▶ דמו חי - מתקשרים עכשיו
*Speaker note:* This slide IS the demo - show מיקה live, don't describe her. Backup video ready.

## Slide 2 - הבעיה והחיסכון (problem + ROI calc)  *(~1.5 min)*
**Headline:** כל ערב, שעתיים על הטלפון. ושולחנות ריקים שאף אחד לא ידע עליהם.
**Right - the problem (3 bullets):**
- מארחת מתקשרת לכל ההזמנות - ידנית, כל יום
- בימים עמוסים לא מתקשרים ← **10-20% אי-הגעה**  *(RTL: arrow points LEFT)*
- SMS לא פותר: אי אפשר להתמקח עם תזכורת
**Left - ROI cards (ember numbers):**
- **~45 שע׳** - זמן צוות שמשתחרר בחודש (~90%)
- **~₪2,000** - חיסכון חודשי בעלות שיחות (~80%)
- **פי ~5** - זול יותר לאישור (מ-₪2.5 ל-₪0.5)
- **17:00** *(dark card)* - ביטול ידוע מבעוד מועד → השולחן נמכר מחדש (הרווח הגדול)
**Footnote (small):** הערכה: ~40 הזמנות/ערב · ~26 ערבים/חודש ≈ ~1,000 שיחות · 3 דק׳/שיחה ידנית · עלות מארחת ~₪50/שעה · ₪0.5/שיחה (נמדד: 39 שנ׳).
*Speaker note:* Lead with hours freed (robust); the ₪ depends on the wage assumption - adjust if needed.

## Slide 3 - הסטאק הטכנולוגי (tech stack + trade-off)  *(~1 min)*
**Headline:** מה בנינו - והבחירות שמאחורי זה
**Table (component · choice · why):**
- קול · טלפון · ASR · TTS → **ElevenLabs** → הפלטפורמה היחידה עם TTS שיחתי בעברית ברמת ייצור
- מודל בשיחה → **Gemini 3 Flash** → בדקנו 5 מודלים, זה ניצח: אמין וקורא לכלים, ופי ~7 זול מ-GPT-4o (~$0.026 מול ~$0.18 לשיחה)
- טלפוניה → **Twilio** → PSTN אמין לישראל
- נתונים + כלים → **Supabase** → מקור אמת; הכלים RPC - הלוגיקה ב-SQL, לא בפרומפט
- אורקסטרציה → **n8n** → batch מבוקר + רשת הביטחון הדטרמיניסטית
- דשבורד → **Next.js** → מעקב חי אחרי כלים וכתיבות ל-DB

## Slide 4 - שלושה כשלים (struggles)  *(~1.5 min - the most interesting)*
**Headline:** שלושה כשלים שלימדו אותנו הכי הרבה
**3 cards:**
- 👻 **האורח הפנטום** - הקו החזיר את ההד של מיקה; ה-ASR תמלל אותה כאילו האורח דיבר.
- 🔇 **הרשימה שבלעה את ה"כן"** - פילטר הד גלובלי מחק «כן» של אורח אמיתי מהתמלול.
- 🤥 **הסוכנת ששיקרה** - הכריזה «אישרתי» ומעולם לא קראה לכלי. ה-DB נשאר ממתין.
**Pull-quote (huge serif, centered):** הסוכן הסתברותי. **המערכת - לא.**
*Speaker note:* Each diagnosed with evidence; fix wasn't only the prompt - a deterministic n8n
reconcile guard catches any call that left no DB trace and routes it within seconds.

## Slide 5 - תוצאות · ערך · קריאה לפעולה (results + CTA)  *(~1 min)*
**Eyebrow:** נמדד על שיחות אמיתיות
**3 hero numbers (ember):** **100%** מהשיחות שהוכרעו נכתבו נכון במערכת · **~1.3 שנ׳** זמן תגובה · **22** שיחות · 14 תרחישים
**Before/After table:**
- זמן צוות ביום: ~שעתיים → **~10 דקות** (חריגים)
- כיסוי אישורים: 50-70% → **~100%** + ניסיונות חוזרים
- ביטולים: מתגלים ב-20:00 → **ידועים ב-17:00** - נמכר מחדש
**Closer (serif):** אותו מנוע - הרבה מעבר למסעדה.
**Two lines under it:**
- **עוד כלים לאותה מסעדה:** רשימת המתנה · שיחת משוב אחרי הביקור · אישור פיקדון לקבוצות.
- **אותו דפוס, תחומים אחרים:** מרפאות שיניים · מספרות · שליחויות (חלון מסירה) · זימון מועמדים. כל מי שמתקשר לאשר ולתאם.
*Speaker note:* `restaurant_id` is already a parameter - multi-tenant by design. Treat the room like investors: the restaurant is the proving ground, the engine is domain-agnostic.

---

## Optional backup slides (skip if short on time)
- **סולם ה-LLM** - 5 מודלים: 4o-mini זייף · gpt-5-mini איטי · gemini-2.5-flash השתתק · gpt-4o עובד אך יקר · **gemini-3-flash ניצח**.
- **ארכיטקטורה מלאה** - דיאגרמת בלוקים: n8n ↔ ElevenLabs ↔ Twilio ↔ Supabase ↔ דשבורד.
- **כוונון קול עברית** - רצפת stability 0.75, מהירות 0.7, הגייה דרך respellings.

## Delivery reminders (Project Breakdown)
- 6 min target (8 max) + 4 min Q&A · for a pair, split into two halves - no back-and-forth.
- Don't read slides · don't show endless code · don't skip the numbers · **have the backup video ready.**
