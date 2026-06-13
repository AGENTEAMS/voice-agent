-- Mika Voice Agent — in-call function expansion: change-time, callbacks, retries.
-- Adds the scheduled_calls table (drives n8n callbacks + retries) and three RPCs the
-- bridge / n8n call directly. Does NOT touch reservation_status or apply_call_result
-- (their confirmed/cancelled/needs_human contract stays intact).

-- ── Enums ─────────────────────────────────────────────────────────────────────
do $$ begin
  if not exists (select 1 from pg_type where typname = 'scheduled_call_kind') then
    create type scheduled_call_kind as enum ('callback', 'retry');
  end if;
  if not exists (select 1 from pg_type where typname = 'scheduled_call_status') then
    create type scheduled_call_status as enum ('pending', 'in_progress', 'done', 'cancelled', 'failed');
  end if;
end $$;

-- ── scheduled_calls: one row = one future outbound call n8n should place ────────
create table if not exists scheduled_calls (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references restaurants(id)  on delete cascade,
  reservation_id uuid          references reservations(id) on delete set null, -- null = cold retry
  kind           scheduled_call_kind   not null default 'callback',
  status         scheduled_call_status not null default 'pending',
  scheduled_for  timestamptz not null,            -- when n8n should dial (absolute)
  attempts       int  not null default 0,         -- retry bookkeeping
  reason         text,                            -- spoken_time / why-human, audit only
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists idx_scheduled_calls_due on scheduled_calls (status, scheduled_for);
create index if not exists idx_scheduled_calls_reservation on scheduled_calls (reservation_id);

drop trigger if exists trg_scheduled_calls_updated on scheduled_calls;
create trigger trg_scheduled_calls_updated
  before update on scheduled_calls
  for each row execute function set_updated_at();   -- reuse fn from 0001

alter table scheduled_calls enable row level security;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'authenticated')
     and not exists (select 1 from pg_policies where tablename = 'scheduled_calls' and policyname = 'auth_all') then
    create policy "auth_all" on scheduled_calls for all to authenticated using (true) with check (true);
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and tablename = 'scheduled_calls'
  ) then
    alter publication supabase_realtime add table scheduled_calls;
  end if;
end $$;

-- ── change_reservation: availability-validated atomic move of time/party ────────
create or replace function change_reservation(
  p_reservation_id uuid,
  p_restaurant_id  uuid,
  p_date           date,
  p_time           time,
  p_party_size     int default null      -- null = keep existing
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
  -- Lock the reservation row (scoped to the restaurant) to serialize concurrent changes.
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

  -- Lock BOTH the old and new availability rows up-front, in a deterministic order
  -- (date, time_slot) to avoid deadlocks between concurrent changes.
  perform 1 from availability
   where restaurant_id = p_restaurant_id
     and (date, time_slot) in ((v_old_date, v_old_slot), (p_date, p_time))
   order by date, time_slot
   for update;

  -- Read capacity at the NEW slot (rows already locked above).
  select available into v_avail
    from availability
   where restaurant_id = p_restaurant_id and date = p_date and time_slot = p_time;
  if v_avail is null then
    return jsonb_build_object('ok', false, 'reason', 'no_such_slot');
  end if;

  -- If moving within the same slot, this reservation's own booking is already counted.
  v_effective := v_avail + (case when v_same_slot then v_old_party else 0 end);
  if v_effective < v_party then
    return jsonb_build_object('ok', false, 'reason', 'full', 'available', v_effective);
  end if;

  -- Rebalance booked counts: release the old slot, take the new slot. NOTE: availability.booked is
  -- advisory in the POC (seeded independently of reservations, and the old slot may be untracked if a
  -- reservation time isn't a half-hour slot); greatest(...,0) guards underflow. Capacity gating uses
  -- `available` which stays bounded. Tighten to a reservations-derived count before production.
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

-- ── schedule_call: insert one future call (callback or retry) ────────────────────
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
  insert into scheduled_calls(reservation_id, restaurant_id, kind, scheduled_for, reason, attempts)
  values (p_reservation_id, p_restaurant_id, p_kind, p_scheduled_for, p_reason, coalesce(p_attempts, 0))
  returning id into v_id;
  return v_id;
end;
$$;

-- ── due_scheduled_calls: the n8n poller's one-shot query ─────────────────────────
create or replace function due_scheduled_calls(p_restaurant_id uuid)
returns table(id uuid, reservation_id uuid, phone text, kind scheduled_call_kind,
              attempts int, scheduled_for timestamptz)
language sql
stable
as $$
  select sc.id, sc.reservation_id, c.phone, sc.kind, sc.attempts, sc.scheduled_for
    from scheduled_calls sc
    left join reservations r on r.id = sc.reservation_id
    left join customers    c on c.id = r.customer_id
   where sc.restaurant_id = p_restaurant_id
     and sc.status = 'pending'
     and sc.scheduled_for <= now()
   order by sc.scheduled_for;
$$;
