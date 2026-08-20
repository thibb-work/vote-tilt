-- vote-tilt: one live round, one row.
-- Live vote positions never touch Postgres (they ride Realtime Presence).
-- This table holds only what must survive a page refresh: the labels, the
-- frozen flag, and the tally captured at the moment of freezing.

create table if not exists public.sessions (
  slug           text primary key default 'main',
  options        text[] not null,
  frozen         boolean not null default false,
  frozen_tallies jsonb,
  frozen_at      timestamptz,
  round_started  timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint sessions_six_options check (array_length(options, 1) = 6)
);

alter table public.sessions enable row level security;

-- Read-only for the browser. Freeze/reset/label edits go through the host
-- route handlers with the service-role key, so a voter cannot end the round.
drop policy if exists "anon can read sessions" on public.sessions;
create policy "anon can read sessions"
  on public.sessions for select
  to anon, authenticated
  using (true);

insert into public.sessions (slug, options) values ('main', array[
  'Cool data collection',
  'Bulk PDF editor',
  'Dynamic concept explainer',
  'Interactive slides',
  'Animated website',
  'Automated data extraction'
]) on conflict (slug) do nothing;

-- Phones learn about a freeze via postgres_changes on this table.
do $$
begin
  alter publication supabase_realtime add table public.sessions;
exception when duplicate_object then null;
end $$;
