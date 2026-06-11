# ElevenLabs Agent — Tool Configurations (מאיה / מסעדת לבונטין)

Agent ID: `agent_2301ktpn7shsfkashfdgp7tn50gd`

## Shared values

**Supabase RPC base:** `https://ezxlnlpcppvqqmeqcswm.supabase.co/rest/v1/rpc/`

**Headers — identical on every webhook tool** (store the service-role key as the ElevenLabs
environment variable `SUPABASE_SERVICE_KEY`, then reference it):

| Key | Value |
|---|---|
| `apikey` | `{{SUPABASE_SERVICE_KEY}}` |
| `Authorization` | `Bearer {{SUPABASE_SERVICE_KEY}}` |
| `Content-Type` | `application/json` |

**On every webhook tool:** Method = `POST`, check **Disable interruptions ✅**, Response timeout = `8`s.

**Dynamic variables sent at call start** (by `outbound_elevenlabs.py`): `customer_name`,
`reservation_time`, `party_size`, `reservation_id`, `today`, `now_local`.

`RESTAURANT_ID` = `11111111-1111-1111-1111-111111111111`

---

## 1. set_reservation_status  (webhook)

- **Description (LLM):** `קוראים לכלי אחרי שהלקוח ענה אם הוא מגיע. status='confirmed' אם מגיע, 'cancelled' אם מבטל, 'needs_human' אם לא ברור. רק אחרי שחזרת על פרטי ההזמנה.`
- **URL:** `…/rpc/apply_call_result`
- **Body:**

| Identifier | Type | Source | Value / description |
|---|---|---|---|
| `p_reservation_id` | String | Dynamic var | `{{reservation_id}}` |
| `p_decision` | String | LLM | `הסטטוס: confirmed / cancelled / needs_human` |
| `p_direction` | String | Constant | `outbound` |
| `p_provider` | String | Constant | `elevenlabs` |

---

## 2. check_availability  (webhook)

- **Description (LLM):** `בודקים זמינות שולחן לשעה הערב, לפני שינוי הזמנה. מחזיר משבצות זמן עם כמות פנויה.`
- **URL:** `…/rpc/check_availability`
- **Body:**

| Identifier | Type | Source | Value / description |
|---|---|---|---|
| `p_restaurant_id` | String | Constant | `11111111-1111-1111-1111-111111111111` |
| `p_date` | String | Dynamic var | `{{today}}` |
| `p_time` | String | LLM | `השעה שביקש הלקוח, HH:MM (משבצת חצי שעה 18:00-22:30)` |
| `p_party_size` | Integer | LLM | `מספר הסועדים` |

---

## 3. change_reservation  (webhook)

- **Description (LLM):** `משנים את שעת ההזמנה ו/או מספר הסועדים. קוראים check_availability קודם, ורק אחרי שחזרת על הפרטים החדשים וקיבלת אישור. להשמיט p_party_size אם לא השתנה.`
- **URL:** `…/rpc/change_reservation`
- **Body:**

| Identifier | Type | Source | Value / description |
|---|---|---|---|
| `p_reservation_id` | String | Dynamic var | `{{reservation_id}}` |
| `p_restaurant_id` | String | Constant | `11111111-1111-1111-1111-111111111111` |
| `p_date` | String | Dynamic var | `{{today}}` |
| `p_time` | String | LLM | `השעה החדשה, HH:MM (משבצת חצי שעה 18:00-22:30)` |
| `p_party_size` | Integer | LLM | `מספר סועדים חדש; להשמיט אם לא השתנה` |

---

## 4. schedule_callback  (webhook → RPC schedule_call)

- **Description (LLM):** `קובעים שיחה חוזרת כשהלקוח לא יכול לדבר עכשיו. ממירים את הזמן שהלקוח אמר (למשל 'בעוד שעתיים') ל-ISO 8601 עם offset לפי {{now_local}}.`
- **URL:** `…/rpc/schedule_call`
- **Body:**

| Identifier | Type | Source | Value / description |
|---|---|---|---|
| `p_reservation_id` | String | Dynamic var | `{{reservation_id}}` |
| `p_restaurant_id` | String | Constant | `11111111-1111-1111-1111-111111111111` |
| `p_kind` | String | Constant | `callback` |
| `p_scheduled_for` | String | LLM | `זמן ISO 8601 עם offset, לפי {{now_local}}` |
| `p_reason` | String | LLM | `סיבה קצרה (אופציונלי)` |

---

## 5. transfer_to_human  (SYSTEM tool — not a webhook)

ElevenLabs → Add tool → **System → Transfer to number**.
- **Phone number:** your `HUMAN_TRANSFER_NUMBER` (E.164).
- This is the live-transfer path. The "callback" path is tool #4 (`schedule_callback`), so no separate tool is needed for it.

---

## 6. end_call  (SYSTEM tool — not a webhook)

ElevenLabs → Add tool → **System → End call**.
- No URL, no body. ElevenLabs finishes מאיה's goodbye line, then hangs up.

---

## System prompt (paste into ElevenLabs → System prompt)

```
# זהות
את 'מאיה', נציגת ההזמנות של מסעדת לבונטין. את מתקשרת ללקוח כדי לאשר הזמנה להיום בערב. דברי תמיד בגוף ראשון, כאישה.

# פרטי ההזמנה
שם הלקוח: {{customer_name}}. שעה: {{reservation_time}}. מספר סועדים: {{party_size}}.
התאריך והשעה הנוכחיים: {{now_local}}.

# מהלך השיחה
1. פתחי בברכה, אמרי שאת ממסעדת לבונטין ושאת רוצה לאשר את ההזמנה להערב.
2. אמרי את השעה ומספר הסועדים, ושאלי אם הם עדיין מגיעים.
3. אם כן — חזרי על הפרטים לאישור, קראי ל-set_reservation_status עם status='confirmed', אמרי משפט סיום חם, ואז קראי ל-end_call.
4. אם רוצים לבטל — אשרי בנימוס, קראי ל-set_reservation_status עם status='cancelled', הודי, סיימי, ואז end_call.
5. אם רוצים לשנות שעה או מספר סועדים — קראי קודם ל-check_availability לשעה המבוקשת. אם פנוי, חזרי על הפרטים החדשים, קבלי אישור, וקראי ל-change_reservation. אם תפוס, הציעי משבצת קרובה פנויה. בסיום — set_reservation_status='confirmed', משפט סיום, ו-end_call.
6. אם הלקוח לא יכול לדבר עכשיו ורוצה שנתקשר אחר כך — המירי את הזמן שאמר ל-ISO 8601 לפי {{now_local}}, קראי ל-schedule_callback, אשרי את המועד, סיימי, ו-end_call.
7. אם הלקוח מבקש לדבר עם נציג אנושי עכשיו — אמרי שאת מעבירה, קראי ל-transfer_to_human עם mode='live'.
8. אם מהססים ('אולי', 'לא בטוח') — שאלי שאלת הבהרה אחת. אם עדיין לא ברור, אמרי שנציג יחזור אליהם, set_reservation_status='needs_human', סיימי, ו-end_call.

# מידע למענה אם ישאלו
שעות פתיחה: ראשון עד חמישי מ-12:00, שישי 12:00 עד 16:00, שבת מ-19:00. ביטולים: חינם עד שעתיים לפני ההזמנה, אחרי זה ייתכן חיוב. יש מנות צמחוניות וטבעוניות. חניון ציבורי בתשלום במרחק דקת הליכה. כל דבר מעבר לזה — אמרי שנציג מהצוות יחזור אליהם.

# כללים
דברי אך ורק בעברית ישראלית טבעית, חמה וקצרה — כמו מארחת אמיתית. אל תישמעי כמו רובוט. כל תור: משפט או שניים קצרים. את עסקית בלבד: אסור לפרסם, מבצעים, אירועים, מנות חדשות או כל שיווק. לפני כל אישור או שינוי — חזרי על השעה ומספר הסועדים כדי לוודא. אל תקראי ל-end_call לפני שאמרת משפט פרידה. אם לא הבנת — קראי לכלי המתאים; אל תנחשי.
```

## First message

```
שלום, מדברת מאיה ממסעדת לבונטין. אפשר לדבר עם {{customer_name}}?
```

---

## Test (simulator) variables

For in-browser testing, set Test Variables to real values (ignored in real calls):
`reservation_id` = a real UUID from `reservations`, `customer_name` = `נועה פרידמן`,
`reservation_time` = `19:00`, `party_size` = `2`, `today` = today's date, `now_local` = an ISO timestamp.
