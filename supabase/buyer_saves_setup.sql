-- Run once in the Supabase dashboard: SQL Editor -> New query -> paste -> Run. Safe to re-run.
-- Buyers' saved search criteria and bookmarked flats. Each user can only see and change their own rows.

-- Saved searches: the buyer form's inputs, so a search can be re-run later
create table if not exists public.saved_searches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  criteria jsonb not null,
  created_at timestamptz not null default now()
);

-- Bookmarked flats: a block on the map, with the details shown when it was saved
create table if not exists public.bookmarks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  town text not null,
  block text not null,
  street text not null,
  flat_type text not null,
  median_price integer,
  transactions integer,
  lat double precision,
  lng double precision,
  nearest_mrt jsonb,
  nearest_bus jsonb,
  data_year integer,
  created_at timestamptz not null default now(),
  unique (user_id, block, street, flat_type)
);

alter table public.saved_searches enable row level security;
alter table public.bookmarks enable row level security;

drop policy if exists "Users manage their own saved searches" on public.saved_searches;
create policy "Users manage their own saved searches"
  on public.saved_searches for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users manage their own bookmarks" on public.bookmarks;
create policy "Users manage their own bookmarks"
  on public.bookmarks for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
