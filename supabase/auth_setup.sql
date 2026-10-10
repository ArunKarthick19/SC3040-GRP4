-- Run once in the Supabase dashboard: SQL Editor -> New query -> paste -> Run

-- Public profile per user, holds the username
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "Profiles are viewable by everyone" on public.profiles;
create policy "Profiles are viewable by everyone"
  on public.profiles for select using (true);

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
  on public.profiles for update using (auth.uid() = id);

-- Create a profile row automatically when someone signs up
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, username)
  values (new.id, new.raw_user_meta_data ->> 'username');
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill profiles for users who signed up before this script was run
insert into public.profiles (id, username)
select id, raw_user_meta_data ->> 'username'
from auth.users
where raw_user_meta_data ->> 'username' is not null
on conflict do nothing;

-- Lets the login page sign in with a username: returns that user's email.
-- Also used by signup to check whether a username is taken.
create or replace function public.get_email_by_username(p_username text)
returns text
language sql
security definer set search_path = ''
as $$
  select u.email
  from public.profiles p
  join auth.users u on u.id = p.id
  where lower(p.username) = lower(p_username)
  limit 1;
$$;

grant execute on function public.get_email_by_username(text) to anon, authenticated;

-- Forgot password without email: sets a new password for the account matching
-- the given email or username. No ownership check (school project only).
-- Returns false if no account matches.
create or replace function public.reset_password(p_identifier text, p_new_password text)
returns boolean
language plpgsql
security definer set search_path = ''
as $$
declare
  v_user_id uuid;
begin
  if length(p_new_password) < 6 then
    raise exception 'Password must be at least 6 characters';
  end if;

  select u.id into v_user_id
  from auth.users u
  left join public.profiles p on p.id = u.id
  where lower(u.email) = lower(p_identifier)
     or lower(p.username) = lower(p_identifier)
  limit 1;

  if v_user_id is null then
    return false;
  end if;

  update auth.users
  set encrypted_password = extensions.crypt(p_new_password, extensions.gen_salt('bf')),
      updated_at = now()
  where id = v_user_id;

  return true;
end;
$$;

grant execute on function public.reset_password(text, text) to anon, authenticated;
