-- Run once in the Supabase dashboard: SQL Editor -> New query -> paste -> Run. Safe to re-run.
-- Run after auth_setup.sql. Adds an admin flag and an audit trail that only admins can read.

-- Admin flag on profiles. The account with username admin123 is the admin.
alter table public.profiles add column if not exists is_admin boolean not null default false;

-- Users may only change their own username, never is_admin (the update policy from
-- auth_setup.sql otherwise allows changing any column of their own row)
revoke update on public.profiles from anon, authenticated;
grant update (username) on public.profiles to authenticated;

-- Sign-ups with the username admin123 become admin automatically
create or replace function public.mark_admin_account()
returns trigger
language plpgsql
as $$
begin
  new.is_admin := lower(new.username) = 'admin123';
  return new;
end;
$$;

drop trigger if exists profiles_mark_admin on public.profiles;
create trigger profiles_mark_admin
  before insert or update of username on public.profiles
  for each row execute function public.mark_admin_account();

update public.profiles set is_admin = (lower(username) = 'admin123');

-- True if the signed-in user is an admin
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer set search_path = ''
as $$
  select coalesce((select p.is_admin from public.profiles p where p.id = auth.uid()), false);
$$;

grant execute on function public.is_admin() to authenticated;

-- Audit trail: who did what, and when
create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  event text not null,
  details jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_log_created_at on public.audit_log (created_at desc);

alter table public.audit_log enable row level security;

-- Anyone signed in can add events about themselves; nobody can edit or delete them
drop policy if exists "Users log their own events" on public.audit_log;
create policy "Users log their own events"
  on public.audit_log for insert
  to authenticated
  with check (auth.uid() = user_id);

-- Only admins can read the trail
drop policy if exists "Admins read the audit trail" on public.audit_log;
create policy "Admins read the audit trail"
  on public.audit_log for select
  to authenticated
  using (public.is_admin());
