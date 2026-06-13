-- Maître — tool_events: per-tool-call telemetry for the live stage dashboard («מיקה — במה»).
-- Each in-call RPC logs itself on entry; Supabase Realtime pushes INSERTs to the UI.
-- Demo-grade anon read policies for the localhost stage (no auth). Whole file is one
-- transaction when applied via supabase/apply_sql.py.

create table if not exists tool_events (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid references restaurants(id) on delete cascade,
  reservation_id uuid references reservations(id) on delete set null,
  tool_name      text not null,
  payload        jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);
create index if not exists idx_tool_events_created on tool_events (created_at desc);

alter table tool_events enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='tool_events' and policyname='anon_read') then
    create policy "anon_read" on tool_events for select to anon using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='reservations' and policyname='anon_read') then
    create policy "anon_read" on reservations for select to anon using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='scheduled_calls' and policyname='anon_read') then
    create policy "anon_read" on scheduled_calls for select to anon using (true);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_publication_tables
                  where pubname='supabase_realtime' and tablename='tool_events') then
    alter publication supabase_realtime add table tool_events;
  end if;
  if not exists (select 1 from pg_publication_tables
                  where pubname='supabase_realtime' and tablename='reservations') then
    alter publication supabase_realtime add table reservations;
  end if;
end $$;

-- One-line logger used by every in-call RPC. security definer → runs as table owner,
-- so RLS on tool_events never blocks the write path.
create or replace function log_tool_event(
  p_tool text, p_reservation_id uuid, p_restaurant_id uuid, p_payload jsonb
) returns void language sql security definer as $$
  insert into tool_events(tool_name, reservation_id, restaurant_id, payload)
  values (p_tool, p_reservation_id, p_restaurant_id, coalesce(p_payload,'{}'::jsonb));
$$;

-- ── check_availability: sql/stable → plpgsql so it can log. Result shape UNCHANGED
--    (slot, available, fits) — the EL tool contract depends on it.
drop function if exists check_availability(uuid, date, time, int);
create function check_availability(
  p_restaurant_id uuid,
  p_date          date,
  p_time          time,
  p_party_size    int default 2
) returns table(slot time, available int, fits boolean)
language plpgsql
security definer
as $$
begin
  perform log_tool_event('check_availability', null, p_restaurant_id,
    jsonb_build_object('date', p_date, 'time', p_time, 'party_size', p_party_size));
  return query
  select a.time_slot, a.available, (a.available >= p_party_size) as fits
    from availability a
   where a.restaurant_id = p_restaurant_id
     and a.date = p_date
     and a.time_slot between (p_time - interval '1 hour') and (p_time + interval '1 hour')
   order by abs(extract(epoch from (a.time_slot - p_time)));
end;
$$;

-- ── apply_call_result: identical body to 0002 + one logging line after `begin`.
create or replace function apply_call_result(
  p_reservation_id uuid,
  p_decision       reservation_status,
  p_direction      call_direction,
  p_intent         text default null,
  p_confidence     numeric default null,
  p_transcript     jsonb default '[]'::jsonb,
  p_recording_url  text default null,
  p_duration       int default null,
  p_cost_usd       numeric default null,
  p_provider       text default 'livekit',
  p_provider_call_id text default null
) returns uuid
language plpgsql
security definer
as $$
declare
  v_customer uuid;
  v_outcome  call_outcome;
  v_call_id  uuid;
begin
  perform log_tool_event('apply_call_result', p_reservation_id, null,
    jsonb_build_object('decision', p_decision));

  if p_decision not in ('confirmed','cancelled','needs_human') then
    raise exception 'apply_call_result: invalid decision %', p_decision;
  end if;

  update reservations
     set status = p_decision
   where id = p_reservation_id
  returning customer_id into v_customer;

  if v_customer is null then
    raise exception 'apply_call_result: reservation % not found', p_reservation_id;
  end if;

  v_outcome := case p_decision
                 when 'confirmed' then 'confirmed'::call_outcome
                 when 'cancelled' then 'cancelled'::call_outcome
                 else 'needs_human'::call_outcome
               end;

  insert into call_attempts(
    reservation_id, customer_id, direction, outcome, intent, confidence,
    transcript, recording_url, ended_at, duration_seconds, cost_usd, provider, provider_call_id)
  values (
    p_reservation_id, v_customer, p_direction, v_outcome, p_intent, p_confidence,
    coalesce(p_transcript,'[]'::jsonb), p_recording_url, now(), p_duration, p_cost_usd,
    p_provider, p_provider_call_id)
  returning id into v_call_id;

  return v_call_id;
end;
$$;

-- ── change_reservation: identical body to 0003 + one logging line after `begin`.
create or replace function change_reservation(
  p_reservation_id uuid,
  p_restaurant_id  uuid,
  p_date           date,
  p_time           time,
  p_party_size     int default null
) returns jsonb
language plpgsql
security definer
as $$
declare
  v_old_for   timestamptz;
  v_old_party int;
  v_old_date  date;
  v_old_slot  time;
  v_party     int;
  v_avail     int;
  v_effective int;
  v_same_slot boolean;
  v_new_for   timestamptz;
begin
  perform log_tool_event('change_reservation', p_reservation_id, p_restaurant_id,
    jsonb_build_object('date', p_date, 'time', p_time, 'party_size', p_party_size));

  select reserved_for, party_size into v_old_for, v_old_party
    from reservations
   where id = p_reservation_id and restaurant_id = p_restaurant_id
   for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  v_old_date := (v_old_for at time zone 'Asia/Jerusalem')::date;
  v_old_slot := (v_old_for at time zone 'Asia/Jerusalem')::time;
  v_party    := coalesce(p_party_size, v_old_party);
  v_new_for  := (p_date + p_time) at time zone 'Asia/Jerusalem';
  v_same_slot := (p_date = v_old_date and p_time = v_old_slot);

  if v_party is null or v_party < 1 or v_party > 12 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_party_size');
  end if;

  perform 1 from availability
   where restaurant_id = p_restaurant_id
     and (date, time_slot) in ((v_old_date, v_old_slot), (p_date, p_time))
   order by date, time_slot
   for update;

  select available into v_avail
    from availability
   where restaurant_id = p_restaurant_id and date = p_date and time_slot = p_time;
  if v_avail is null then
    return jsonb_build_object('ok', false, 'reason', 'no_such_slot');
  end if;

  v_effective := v_avail + (case when v_same_slot then v_old_party else 0 end);
  if v_effective < v_party then
    return jsonb_build_object('ok', false, 'reason', 'full', 'available', v_effective);
  end if;

  update availability set booked = greatest(booked - v_old_party, 0)
   where restaurant_id = p_restaurant_id and date = v_old_date and time_slot = v_old_slot;
  update availability set booked = booked + v_party
   where restaurant_id = p_restaurant_id and date = p_date and time_slot = p_time;

  update reservations
     set reserved_for = v_new_for, party_size = v_party
   where id = p_reservation_id;

  return jsonb_build_object('ok', true, 'reserved_for', v_new_for, 'party_size', v_party);
end;
$$;

-- ── schedule_call: identical body to 0003 + one logging line after `begin`.
create or replace function schedule_call(
  p_reservation_id uuid,
  p_restaurant_id  uuid,
  p_kind           scheduled_call_kind,
  p_scheduled_for  timestamptz,
  p_reason         text default null,
  p_attempts       int default 0
) returns uuid
language plpgsql
security definer
as $$
declare v_id uuid;
begin
  perform log_tool_event('schedule_call', p_reservation_id, p_restaurant_id,
    jsonb_build_object('kind', p_kind, 'scheduled_for', p_scheduled_for));

  insert into scheduled_calls(reservation_id, restaurant_id, kind, scheduled_for, reason, attempts)
  values (p_reservation_id, p_restaurant_id, p_kind, p_scheduled_for, p_reason, coalesce(p_attempts, 0))
  returning id into v_id;
  return v_id;
end;
$$;
