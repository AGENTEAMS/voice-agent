-- Maître — public.demo_reset(): ONE authoritative, deterministic demo slate.
-- Single source of truth for the reset used by the stage button (reset-on-START of every run),
-- the local supabase/demo_reset.py, supabase/seed.sql, and any REST caller:
--   POST /rest/v1/rpc/demo_reset
-- Produces a VARIED "tonight" board for realism: most rows pending, some confirmed / needs_human /
-- cancelled. Tomer's row (+972585121998, full name "תומר אלזם" — board shows the full name; the
-- call greets the FIRST name only, via todays_pending_reservations → split_part) is the ONLY one
-- with a real, allowlisted number — so although several rows are pending, the n8n batch's allowlist
-- ("Build Call Payloads") dials only Tomer, once; the fake-number pending rows are display-only.
-- Negotiation props baked in:
-- 20:00 has room (change-to-eight), 21:00 FULL, 21:30 is the alternative she offers.
create or replace function public.demo_reset()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rid   uuid := '11111111-1111-1111-1111-111111111111';
  v_tomer uuid := '22222222-0000-0000-0000-0000000000aa';
begin
  -- ── clean slate (children first; call_attempts has no restaurant_id) ──
  delete from call_attempts
   where reservation_id in (select id from reservations where restaurant_id = v_rid)
      or customer_id   in (select id from customers    where restaurant_id = v_rid);
  delete from tool_events     where restaurant_id = v_rid;
  delete from scheduled_calls where restaurant_id = v_rid;
  delete from reservations    where restaurant_id = v_rid;
  delete from availability    where restaurant_id = v_rid;
  delete from policies        where restaurant_id = v_rid;
  delete from customers       where restaurant_id = v_rid;

  -- ── restaurant (idempotent) ──
  insert into restaurants (id, name, phone, timezone, opening_hours) values
    (v_rid, 'מסעדת קיסו', '+97233334444', 'Asia/Jerusalem',
     '{"sun":["12:00","23:00"],"mon":["12:00","23:00"],"tue":["12:00","23:00"],"wed":["12:00","23:00"],"thu":["12:00","00:00"],"fri":["12:00","16:00"],"sat":["19:00","00:00"]}'::jsonb)
  on conflict (id) do update
     set name = excluded.name, phone = excluded.phone,
         timezone = excluded.timezone, opening_hours = excluded.opening_hours;

  -- ── customers: 15 mock guests + Tomer (the only number we actually dial) ──
  insert into customers (id, restaurant_id, name, phone, notes) values
    ('22222222-0000-0000-0000-000000000001', v_rid, 'נועה פרידמן','+972505550001','קבועה'),
    ('22222222-0000-0000-0000-000000000002', v_rid, 'איתי כהן','+972505550002',null),
    ('22222222-0000-0000-0000-000000000003', v_rid, 'שירה לוי','+972505550003','אלרגיה לאגוזים'),
    ('22222222-0000-0000-0000-000000000004', v_rid, 'דניאל בן דוד','+972505550004',null),
    ('22222222-0000-0000-0000-000000000005', v_rid, 'מאיה אזולאי','+972505550005',null),
    ('22222222-0000-0000-0000-000000000006', v_rid, 'יונתן מזרחי','+972505550006','יום הולדת'),
    ('22222222-0000-0000-0000-000000000007', v_rid, 'תמר שפירא','+972505550007',null),
    ('22222222-0000-0000-0000-000000000008', v_rid, 'עומר ביטון','+972505550008',null),
    ('22222222-0000-0000-0000-000000000009', v_rid, 'רוני גולן','+972505550009',null),
    ('22222222-0000-0000-0000-000000000010', v_rid, 'אורי חדד','+972505550010',null),
    ('22222222-0000-0000-0000-000000000011', v_rid, 'ליאל ששון','+972505550011',null),
    ('22222222-0000-0000-0000-000000000012', v_rid, 'גיא רוזנברג','+972505550012','שולחן ליד החלון'),
    ('22222222-0000-0000-0000-000000000013', v_rid, 'הדר נחום','+972505550013',null),
    ('22222222-0000-0000-0000-000000000014', v_rid, 'אסף קפלן','+972505550014',null),
    ('22222222-0000-0000-0000-000000000015', v_rid, 'יעל אברהם','+972505550015',null),
    (v_tomer,                                v_rid, 'תומר אלזם','+972585121998',null);

  -- ── reservations for TODAY: everyone non-pending EXCEPT Tomer (the only call) ──
  insert into reservations (restaurant_id, customer_id, reserved_for, party_size, status, source)
  select v_rid, c.customer_id,
         ((now() at time zone 'Asia/Jerusalem')::date + c.t) at time zone 'Asia/Jerusalem',
         c.party, c.status::reservation_status, 'seed'
  from (values
    ('22222222-0000-0000-0000-000000000001'::uuid, time '19:00', 2, 'pending'),
    ('22222222-0000-0000-0000-000000000002'::uuid, time '19:30', 4, 'pending'),
    ('22222222-0000-0000-0000-000000000003'::uuid, time '20:00', 2, 'confirmed'),
    ('22222222-0000-0000-0000-000000000004'::uuid, time '20:00', 6, 'confirmed'),
    ('22222222-0000-0000-0000-000000000005'::uuid, time '20:30', 2, 'pending'),
    ('22222222-0000-0000-0000-000000000006'::uuid, time '20:30', 8, 'needs_human'),
    ('22222222-0000-0000-0000-000000000007'::uuid, time '21:00', 3, 'cancelled'),
    ('22222222-0000-0000-0000-000000000008'::uuid, time '21:00', 2, 'pending'),
    ('22222222-0000-0000-0000-000000000009'::uuid, time '21:30', 4, 'confirmed'),
    ('22222222-0000-0000-0000-000000000010'::uuid, time '21:30', 2, 'pending'),
    ('22222222-0000-0000-0000-000000000011'::uuid, time '22:00', 2, 'needs_human'),
    ('22222222-0000-0000-0000-000000000012'::uuid, time '22:00', 5, 'pending'),
    ('22222222-0000-0000-0000-000000000013'::uuid, time '22:30', 2, 'cancelled'),
    ('22222222-0000-0000-0000-000000000014'::uuid, time '18:30', 2, 'pending'),
    ('22222222-0000-0000-0000-000000000015'::uuid, time '18:30', 4, 'confirmed'),
    (v_tomer,                                      time '20:30', 4, 'pending')
  ) as c(customer_id, t, party, status);

  -- ── inbound FAQ policies ──
  insert into policies (restaurant_id, kind, question_he, answer_he) values
    (v_rid,'hours','מה שעות הפתיחה?','אנחנו פתוחים ראשון עד חמישי מ-12:00 בצהריים, שישי 12:00 עד 16:00, ושבת מ-19:00 בערב.'),
    (v_rid,'cancellation','מה מדיניות הביטולים?','אפשר לבטל ללא עלות עד שעתיים לפני מועד ההזמנה. ביטול מאוחר יותר עשוי לחייב דמי ביטול.'),
    (v_rid,'availability','יש מקום הערב?','תלוי בשעה ובגודל הקבוצה — אבדוק עבורך את הזמינות לפי המועד שתבקש.'),
    (v_rid,'general','יש אפשרויות צמחוניות או טבעוניות?','כן, יש לנו מגוון מנות צמחוניות וטבעוניות בתפריט. נשמח להתאים גם לאלרגיות.'),
    (v_rid,'general','יש חניה?','יש חניון ציבורי בתשלום במרחק דקת הליכה מהמסעדה.');

  -- ── availability for today: DETERMINISTIC props so every reset reproduces the flow ──
  insert into availability (restaurant_id, date, time_slot, capacity, booked)
  select v_rid, (now() at time zone 'Asia/Jerusalem')::date, slot, 40,
         case slot
           when time '20:00' then 4    -- 36 free: explicit change-to-eight demo
           when time '21:00' then 40   -- FULL: negotiation prop (ask to move here → 21:30 offered)
           when time '21:30' then 28   -- 12 free: the slot she offers as the alternative
           else 10
         end
  from (values (time '18:00'),(time '18:30'),(time '19:00'),(time '19:30'),(time '20:00'),
               (time '20:30'),(time '21:00'),(time '21:30'),(time '22:00'),(time '22:30')) as s(slot);
end;
$$;

-- Only service_role (server-side: Vercel /api/run, demo_reset.py) may reset.
-- Block anon/public REST callers so a random browser hitting the URL can't wipe the slate.
revoke all on function public.demo_reset() from public;
revoke all on function public.demo_reset() from anon;
grant execute on function public.demo_reset() to service_role;
