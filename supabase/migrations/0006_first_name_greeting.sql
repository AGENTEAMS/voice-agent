-- The outbound work-list the n8n batch reads. It returns customer_name to ElevenLabs as the
-- {{customer_name}} dynamic variable used in the spoken opener ("שלום {{customer_name}}…").
-- We want מיקה to greet the FIRST name only, while the dashboard keeps the FULL name
-- (the dashboard reads customers.name directly via /api/reservations — untouched here).
-- Fix: return split_part(c.name, ' ', 1) (first whitespace-delimited token) as customer_name.
-- Single-word names are returned unchanged. Body otherwise identical to 0002_rpc.sql.
create or replace function todays_pending_reservations(p_restaurant_id uuid)
returns table(reservation_id uuid, customer_name text, phone text, reserved_for timestamptz, party_size int)
language sql
stable
as $$
  select r.id, split_part(c.name, ' ', 1), c.phone, r.reserved_for, r.party_size
    from reservations r
    join customers c on c.id = r.customer_id
   where r.restaurant_id = p_restaurant_id
     and r.status = 'pending'
     and (r.reserved_for at time zone 'Asia/Jerusalem')::date
         = (now() at time zone 'Asia/Jerusalem')::date
   order by r.reserved_for;
$$;
