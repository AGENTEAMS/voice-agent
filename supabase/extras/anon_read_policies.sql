-- Dashboard read access — the demo dashboard uses the public anon key from the browser.
-- 0001 enabled RLS and only added an "auth_all" policy for the 'authenticated' role,
-- so anon currently reads NOTHING. This adds read-only anon SELECT on every table the
-- dashboard renders. Writes still go through service_role (Route Handlers), never anon.
--
-- Demo scope only: a single mock restaurant with fake phone numbers. Tighten to
-- per-restaurant ownership before any real multi-tenant use.

do $$
declare t text;
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    foreach t in array array['restaurants','customers','reservations','call_attempts','policies','availability']
    loop
      execute format('drop policy if exists "anon_read" on %I;', t);
      execute format('create policy "anon_read" on %I for select to anon using (true);', t);
    end loop;
  end if;
end $$;
