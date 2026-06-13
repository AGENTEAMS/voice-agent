-- Mika Voice Agent — Cancellation Insights
-- ─────────────────────────────────────────────────────────────────────────────
-- A feedback loop on top of the cancel-asks-why flow: when Mika cancels a
-- reservation she now captures WHY (free Hebrew). Those reasons accumulate in a
-- raw log (`cancellations`), and an LLM-analysis step (agent/cancellation_insights.py,
-- gpt-4o) aggregates them into management-facing themes + implications +
-- recommendations stored in `cancellation_insights`. The /insights dashboard page
-- renders the aggregate.
--
-- DESIGN NOTES
--  • Both tables live OUTSIDE demo_reset()'s blast radius (it only rebuilds
--    today's reservations/customers/etc.) so insights survive every demo reset.
--  • `cancellations.guest_name` is a denormalized snapshot (text), not a customer
--    FK, so the log stays intact when demo_reset() rebuilds customers.
--  • For the demo, both tables are seeded deterministically below (representative
--    of ~30 days of cancellations). Running the gpt-4o script regenerates
--    `cancellation_insights` from whatever is in `cancellations` — no live API
--    call is needed at showtime.
--  • Production wire-up (one remaining step): have the cancel tool pass the spoken
--    reason so apply_call_result logs a `cancellations` row + sets cancel_reason.

-- ── 1. structured reason on the reservation itself (live flow can populate) ──
alter table reservations add column if not exists cancel_reason text;

-- ── 2. raw cancellation log (the LLM's input) ──
create table if not exists cancellations (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references restaurants(id) on delete cascade,
  reservation_id uuid references reservations(id) on delete set null,  -- null for historical/seed
  guest_name     text,                          -- denormalized snapshot
  reason_text    text not null,                 -- the free Hebrew reason the guest gave
  theme          text,                          -- categorization (set by the LLM script)
  party_size     int,
  reserved_for   date,                          -- the date the cancelled booking was for
  created_at     timestamptz not null default now()  -- when it was cancelled
);
create index if not exists cancellations_restaurant_idx on cancellations(restaurant_id, created_at desc);

-- ── 3. LLM-derived aggregate (the page's source) ──
create table if not exists cancellation_insights (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references restaurants(id) on delete cascade,
  theme          text not null,                 -- Hebrew theme label
  mentions       int  not null,                 -- how many cancellations fell in this theme
  share          numeric(4,3),                  -- 0.000..1.000 of total cancellations
  implication    text,                          -- LLM: what it means for the business
  recommendation text,                          -- LLM: what to do about it
  sample_quote   text,                          -- a representative guest quote
  rank           int,                           -- display order (1 = biggest driver)
  period_label   text,                          -- e.g. "30 הימים האחרונים"
  generated_by   text default 'gpt-4o',
  created_at     timestamptz not null default now()
);
create index if not exists cancellation_insights_restaurant_idx
  on cancellation_insights(restaurant_id, rank);

-- ── 4. RLS (mirror project convention) ──
alter table cancellations          enable row level security;  -- service-role only (has guest reasons)
alter table cancellation_insights  enable row level security;
do $$ begin
  -- aggregate is non-PII → readable by the dashboard's anon key, like reservations/tool_events
  if not exists (select 1 from pg_policies
                 where tablename='cancellation_insights' and policyname='anon_read') then
    create policy "anon_read" on cancellation_insights for select to anon using (true);
  end if;
end $$;

-- ── 5. deterministic demo seed (idempotent: scoped delete + insert) ──
do $$
declare
  v_rid uuid := '11111111-1111-1111-1111-111111111111';
begin
  delete from cancellations         where restaurant_id = v_rid;
  delete from cancellation_insights where restaurant_id = v_rid;

  -- raw log: 24 cancellations across the last ~30 days, 5 themes
  insert into cancellations (restaurant_id, guest_name, reason_text, theme, party_size, reserved_for, created_at)
  select v_rid, g, r, th, p,
         ((now() at time zone 'Asia/Jerusalem')::date - (d || ' days')::interval)::date,
         (now() at time zone 'Asia/Jerusalem') - (d || ' days')::interval
  from (values
    -- מחיר גבוה (7)
    ('נועה פרידמן','המחירים בתפריט גבוהים לנו לארוחה רגילה','מחיר גבוה',2,3),
    ('איתי כהן','יקר מדי לערב באמצע השבוע','מחיר גבוה',4,5),
    ('שירה לוי','ראינו את המחירים והעדפנו משהו זול יותר','מחיר גבוה',2,8),
    ('דניאל בן דוד','התקציב שלנו לא מתאים לתפריט','מחיר גבוה',3,11),
    ('מאיה אזולאי','המחיר לסועד יצא לנו גבוה מדי','מחיר גבוה',2,14),
    ('יונתן מזרחי','חיפשנו משהו בתקציב נמוך יותר','מחיר גבוה',6,19),
    ('תמר שפירא','המחיר הרתיע אותנו בסוף','מחיר גבוה',2,24),
    -- שינוי תוכניות (6)
    ('עומר ביטון','שינוי תוכניות ברגע האחרון','שינוי תוכניות',2,2),
    ('רוני גולן','החלטנו לדחות את הערב','שינוי תוכניות',4,6),
    ('אורי חדד','מצאנו מקום אחר שהתאים לנו יותר','שינוי תוכניות',2,9),
    ('ליאל ששון','התארגנו אחרת הערב, נצטרך לבטל','שינוי תוכניות',5,13),
    ('גיא רוזנברג','בן הזוג לא מרגיש טוב, נדחה','שינוי תוכניות',2,18),
    ('הדר נחום','נסענו אחרת, לא נגיע','שינוי תוכניות',3,22),
    -- קושי בחניה (4)
    ('אסף קפלן','אין חניה באזור, זה מרתיע','קושי בחניה',2,4),
    ('יעל אברהם','קשה למצוא חניה ליד המסעדה','קושי בחניה',4,10),
    ('רן מור','החניה באזור בעייתית בשבילנו','קושי בחניה',2,16),
    ('דנה שגב','ויתרנו בגלל החניה','קושי בחניה',2,21),
    -- לא נמצאה שעה מתאימה (4)
    ('מיכל ברק','רצינו 20:30 אבל היה תפוס','שעה לא מתאימה',2,7),
    ('עידו לב','לא הייתה שעה שמתאימה לנו','שעה לא מתאימה',4,12),
    ('שני פלד','השעות הפנויות לא התאימו','שעה לא מתאימה',2,17),
    ('ניר חזן','רק שעות מאוחרות היו פנויות','שעה לא מתאימה',3,23),
    -- שינוי במספר הסועדים (3)
    ('טל ויזל','היינו אמורים להיות שישה, עכשיו רק שניים','מספר סועדים',2,15),
    ('אורן גל','חלק מהחבר''ה ביטלו, נוותר','מספר סועדים',3,20),
    ('לירון אש','הקבוצה התפרקה, לא נגיע','מספר סועדים',2,26)
  ) as c(g, r, th, p, d);

  -- LLM-derived aggregate (generated by gpt-4o analysis; precomputed for the demo)
  insert into cancellation_insights
    (restaurant_id, theme, mentions, share, implication, recommendation, sample_quote, rank, period_label)
  values
    (v_rid, 'מחיר גבוה', 7, 0.292,
     'כשליש מהביטולים נובעים מתפיסת מחיר - אורחים מגלים את רמת המחירים רק אחרי ההזמנה, סימן לפער ציפיות כבר בשלב ההזמנה.',
     'להציג טווח מחירים או ''מנה ממוצעת'' כבר בעמוד ההזמנה, ולשקול תפריט ערב באמצע השבוע במחיר מבוסס.',
     'המחירים בתפריט גבוהים לנו לארוחה רגילה', 1, '30 הימים האחרונים'),
    (v_rid, 'שינוי תוכניות', 6, 0.250,
     'רבע מהביטולים הם ''רכים'' - האורח עדיין רוצה לצאת, רק לא הערב. הזדמנות לשמר את ההזמנה במקום לאבד אותה.',
     'לתת למיקה להציע מועד חלופי או שיחה חוזרת בזמן הביטול עצמו, במקום לסגור את ההזמנה.',
     'מצאנו מקום אחר שהתאים לנו יותר', 2, '30 הימים האחרונים'),
    (v_rid, 'קושי בחניה', 4, 0.167,
     'החניה היא חסם חוזר באזור - גורם חיצוני שמבריח אורחים עוד לפני שהגיעו.',
     'לשלב מידע על חניון קרוב בהודעת האישור, ולתת למיקה לציין זאת יזומה כשעולה החשש.',
     'אין חניה באזור, זה מרתיע', 3, '30 הימים האחרונים'),
    (v_rid, 'שעה לא מתאימה', 4, 0.167,
     'חלק מהביטולים הם כשל זמינות - הביקוש מתנקז לשעות שיא ספציפיות שמתמלאות מהר.',
     'לתמרץ שעות שוליים (הנחת early-bird ל-18:00-19:00) ולתת למיקה להציע אקטיבית את החלונות הפנויים.',
     'רצינו 20:30 אבל היה תפוס', 4, '30 הימים האחרונים'),
    (v_rid, 'מספר סועדים', 3, 0.125,
     'קבוצות שמתכווצות נוטות לבטל לגמרי במקום לעדכן - אובדן הזמנה שאפשר היה לשמר כשולחן קטן.',
     'להנחות את מיקה להציע התאמת גודל שולחן (''אפשר לעדכן לשניים'') לפני שמקבלים ביטול מלא.',
     'היינו אמורים להיות שישה, עכשיו רק שניים', 5, '30 הימים האחרונים');
end $$;
