-- The demo slate now lives in ONE source of truth: public.demo_reset()
-- (supabase/migrations/0005_demo_reset.sql). This file just invokes it, so every reset path
-- — `supabase db reset`, reseed.py full mode, demo_reset.py, the stage button — produces the
-- identical deterministic slate: a varied demo board (all fake numbers); negotiation props baked.
-- Requires migration 0005 to be applied first.
select public.demo_reset();
