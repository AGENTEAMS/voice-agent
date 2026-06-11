-- In-call RPCs — called DIRECTLY by the LiveKit agent (Supabase service_role) during a live call.
-- These must be fast + atomic so a single STT miss can't corrupt state.
-- The agent only writes a reservation status after a spoken read-back (see prompts/).

-- Update a reservation's status + append the call record in one transaction.
-- p_decision: 'confirmed' | 'cancelled' | 'needs_human'
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

-- Log a non-decision call outcome (no_answer / voicemail / failed / answered_inbound).
create or replace function log_call_outcome(
  p_reservation_id uuid,
  p_direction      call_direction,
  p_outcome        call_outcome,
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
declare v_call_id uuid; v_customer uuid;
begin
  select customer_id into v_customer from reservations where id = p_reservation_id;
  insert into call_attempts(
    reservation_id, customer_id, direction, outcome, transcript, recording_url,
    ended_at, duration_seconds, cost_usd, provider, provider_call_id)
  values (
    p_reservation_id, v_customer, p_direction, p_outcome, coalesce(p_transcript,'[]'::jsonb),
    p_recording_url, now(), p_duration, p_cost_usd, p_provider, p_provider_call_id)
  returning id into v_call_id;
  return v_call_id;
end;
$$;

-- Inbound availability check the agent calls mid-conversation.
create or replace function check_availability(
  p_restaurant_id uuid,
  p_date          date,
  p_time          time,
  p_party_size    int default 2
) returns table(slot time, available int, fits boolean)
language sql
stable
as $$
  select time_slot, available, (available >= p_party_size) as fits
    from availability
   where restaurant_id = p_restaurant_id
     and date = p_date
     and time_slot between (p_time - interval '1 hour') and (p_time + interval '1 hour')
   order by abs(extract(epoch from (time_slot - p_time)));
$$;

-- The daily outbound work-list (n8n cron calls this, scoped to the restaurant's local "today").
create or replace function todays_pending_reservations(p_restaurant_id uuid)
returns table(reservation_id uuid, customer_name text, phone text, reserved_for timestamptz, party_size int)
language sql
stable
as $$
  select r.id, c.name, c.phone, r.reserved_for, r.party_size
    from reservations r
    join customers c on c.id = r.customer_id
   where r.restaurant_id = p_restaurant_id
     and r.status = 'pending'
     and (r.reserved_for at time zone 'Asia/Jerusalem')::date
         = (now() at time zone 'Asia/Jerusalem')::date
   order by r.reserved_for;
$$;
