-- Mika Voice Agent — Hebrew restaurant voice agent
-- Schema: restaurants, customers, reservations, call_attempts, policies, availability
-- Postgres has no Hebrew FTS dictionary; all human text is plain UTF-8 (RTL-safe).

-- ── Extensions ────────────────────────────────────────────────────────────────
create extension if not exists "pgcrypto";   -- gen_random_uuid()
create extension if not exists "vector";      -- pgvector for policy RAG (optional)

-- ── Enums ─────────────────────────────────────────────────────────────────────
create type reservation_status as enum (
  'pending', 'confirmed', 'cancelled', 'no_show', 'arrived', 'needs_human'
);
create type call_direction as enum ('outbound', 'inbound');
create type call_outcome as enum (
  'confirmed', 'cancelled', 'no_answer', 'voicemail', 'failed', 'answered_inbound', 'needs_human'
);
create type policy_kind as enum ('cancellation', 'hours', 'availability', 'general');

-- ── Tables ────────────────────────────────────────────────────────────────────
create table restaurants (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  phone         text,                              -- the restaurant's own +972 line
  timezone      text not null default 'Asia/Jerusalem',
  opening_hours jsonb not null default '{}'::jsonb, -- { "sun": ["12:00","23:00"], ... }
  created_at    timestamptz not null default now()
);

create table customers (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  name          text not null,
  phone         text not null,                     -- E.164, e.g. +9725...
  language      text not null default 'he-IL',
  notes         text,
  created_at    timestamptz not null default now()
);

create table reservations (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  customer_id   uuid not null references customers(id) on delete cascade,
  reserved_for  timestamptz not null,              -- date+time of the booking
  party_size    int not null default 2,
  status        reservation_status not null default 'pending',
  source        text,                              -- 'phone' | 'web' | 'walk-in' | seed
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table call_attempts (
  id               uuid primary key default gen_random_uuid(),
  reservation_id   uuid references reservations(id) on delete set null, -- null for cold inbound
  customer_id      uuid references customers(id) on delete set null,
  direction        call_direction not null,
  outcome          call_outcome,
  intent           text,                            -- classified caller intent
  confidence       numeric(4,3),                    -- 0.000..1.000
  transcript       jsonb not null default '[]'::jsonb, -- [{role,text,ts_ms,intent,confidence}]
  recording_url    text,
  started_at       timestamptz not null default now(),
  ended_at         timestamptz,
  duration_seconds int,
  cost_usd         numeric(8,4),
  provider         text,                            -- 'livekit'|'twilio'|...
  provider_call_id text
);

create table policies (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  kind          policy_kind not null default 'general',
  question_he   text not null,
  answer_he     text not null,
  embedding     vector(1536),                       -- optional; null until embedded
  created_at    timestamptz not null default now()
);

create table availability (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  date          date not null,
  time_slot     time not null,
  capacity      int not null,
  booked        int not null default 0,
  available     int generated always as (capacity - booked) stored,
  unique (restaurant_id, date, time_slot)
);

-- ── Indexes ───────────────────────────────────────────────────────────────────
create index idx_reservations_today on reservations (restaurant_id, reserved_for);
create index idx_reservations_status on reservations (status);
create index idx_call_attempts_reservation on call_attempts (reservation_id, started_at);
create index idx_customers_phone on customers (restaurant_id, phone);

-- ── updated_at trigger ────────────────────────────────────────────────────────
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_reservations_updated
  before update on reservations
  for each row execute function set_updated_at();

-- ── RLS (enable before adding to realtime publication) ────────────────────────
alter table restaurants  enable row level security;
alter table customers    enable row level security;
alter table reservations enable row level security;
alter table call_attempts enable row level security;
alter table policies     enable row level security;
alter table availability enable row level security;

-- POC policy: authenticated users can read/write everything (single mock restaurant).
-- Tighten to per-restaurant ownership before any real multi-tenant use.
-- (service_role bypasses RLS automatically — used by the agent + n8n.)
-- Guarded so the migration also applies on a vanilla Postgres that lacks the Supabase 'authenticated' role.
do $$
declare t text;
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    foreach t in array array['restaurants','customers','reservations','call_attempts','policies','availability']
    loop
      execute format('create policy "auth_all" on %I for all to authenticated using (true) with check (true);', t);
    end loop;
  end if;
end $$;

-- ── Realtime: only the live-changing tables ───────────────────────────────────
alter publication supabase_realtime add table reservations;
alter publication supabase_realtime add table call_attempts;
