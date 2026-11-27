-- Disposable PostgreSQL fixture for follow/block integration tests.
-- Runs only in the CI postgres service; never point DATABASE_URL at production.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
end
$$;

create schema if not exists auth;
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to public;

drop table if exists public.follows cascade;
drop table if exists public.user_blocks cascade;
drop table if exists public.profiles cascade;

create table public.profiles (
  id uuid primary key,
  username text unique not null,
  display_name text not null,
  is_private boolean not null default false
);

create table public.follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  followed_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'accepted' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  primary key (follower_id, followed_id),
  check (follower_id <> followed_id)
);

create table public.user_blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

alter table public.profiles enable row level security;
alter table public.follows enable row level security;
alter table public.user_blocks enable row level security;

create policy profiles_read_visible on public.profiles
  for select to authenticated using (id = auth.uid() or not is_private);
create policy follows_read_related on public.follows
  for select to authenticated using (follower_id = auth.uid() or followed_id = auth.uid());

create policy follows_delete_self on public.follows
  for delete to authenticated using (follower_id = auth.uid());
create policy user_blocks_read_own on public.user_blocks
  for select to authenticated using (blocker_id = auth.uid());

create or replace function public.is_blocked_for_current_user(other_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null and other_user_id is not null
    and other_user_id <> auth.uid()
    and exists (
      select 1 from public.user_blocks b
      where (b.blocker_id = auth.uid() and b.blocked_id = other_user_id)
         or (b.blocker_id = other_user_id and b.blocked_id = auth.uid())
    );
$$;

grant usage on schema public to anon, authenticated;
grant select on public.profiles, public.follows, public.user_blocks to authenticated;
-- Mirror the deployed table privileges before the hardening migration runs.
grant insert, update, delete on public.follows to authenticated;
revoke insert, update, delete on public.user_blocks from anon, authenticated;

-- Mirror the legacy permissive insert policies found in the live schema.
create policy follows_insert_public_only on public.follows
  for insert to authenticated
  with check (
    follower_id = auth.uid()
    and followed_id <> auth.uid()
    and status = 'accepted'
    and exists (select 1 from public.profiles p where p.id = follows.followed_id and p.is_private = false)
  );
create policy follows_insert_enforce_public_only on public.follows
  for insert to authenticated
  with check (
    follower_id = auth.uid()
    and followed_id <> auth.uid()
    and status = 'accepted'
    and exists (select 1 from public.profiles p where p.id = follows.followed_id and p.is_private = false)
  );
