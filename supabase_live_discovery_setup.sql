-- MEEi live discovery backend.
-- Run in Supabase SQL Editor. Live session writes are intentionally server-only:
-- a streaming provider/Edge Function must confirm a real broadcast before a row
-- is inserted or its heartbeat is refreshed. This prevents clients from faking LIVE status.

create table if not exists public.live_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'live' check (status in ('live','ended')),
  country_code text not null check (char_length(country_code) between 2 and 3),
  country_name text not null check (char_length(trim(country_name)) between 2 and 80),
  title text not null default '' check (char_length(title) <= 120),
  thumbnail_path text,
  playback_url text,
  started_at timestamptz not null default now(),
  last_heartbeat_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  check (playback_url is null or playback_url like 'https://%')
);

create unique index if not exists live_sessions_one_active_per_creator
  on public.live_sessions(user_id)
  where status = 'live';

create index if not exists live_sessions_active_country_idx
  on public.live_sessions(country_code, started_at desc)
  where status = 'live';

alter table public.live_sessions enable row level security;

-- Clients may read only currently-live sessions. No client insert/update/delete
-- policies are created: trusted streaming backend code must manage live presence.
drop policy if exists "live_sessions_read_active" on public.live_sessions;
create policy "live_sessions_read_active" on public.live_sessions
for select to authenticated
using (
  status = 'live'
  and last_heartbeat_at > now() - interval '90 seconds'
);

grant select on public.live_sessions to authenticated;

create or replace function public.get_live_creators(country_filter text default null)
returns table (
  session_id uuid,
  user_id uuid,
  username text,
  display_name text,
  profession_category text,
  country_code text,
  country_name text,
  title text,
  thumbnail_path text,
  avatar_path text,
  playback_url text,
  started_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    ls.id,
    ls.user_id,
    pr.username,
    pr.display_name,
    pr.profession_category,
    ls.country_code,
    ls.country_name,
    ls.title,
    ls.thumbnail_path,
    avatar.storage_path,
    ls.playback_url,
    ls.started_at
  from public.live_sessions ls
  join public.profiles pr on pr.id = ls.user_id
  left join lateral (
    select pm.storage_path
    from public.profile_media pm
    where pm.user_id = ls.user_id
      and pm.kind = 'avatar'
    order by pm.position
    limit 1
  ) avatar on true
  where auth.uid() is not null
    and ls.status = 'live'
    and ls.last_heartbeat_at > now() - interval '90 seconds'
    and (country_filter is null or upper(ls.country_code) = upper(country_filter))
    and (
      pr.is_private = false
      or exists (
        select 1
        from public.follows f
        where f.follower_id = auth.uid()
          and f.followed_id = ls.user_id
          and coalesce(to_jsonb(f)->>'status', 'accepted') = 'accepted'
      )
      or ls.user_id = auth.uid()
    )
  order by ls.started_at desc
  limit 100;
$$;

revoke all on function public.get_live_creators(text) from public;
grant execute on function public.get_live_creators(text) to authenticated;

comment on table public.live_sessions is
  'Verified active MEEi broadcasts. Insert/update/delete must be performed by trusted streaming backend code, not client apps.';
comment on column public.live_sessions.last_heartbeat_at is
  'Streaming backend refreshes this timestamp while the provider confirms the broadcast is live. Discovery hides sessions older than 90 seconds.';

-- Enable Supabase Realtime notifications for live session changes, if not already enabled.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'live_sessions'
  ) then
    alter publication supabase_realtime add table public.live_sessions;
  end if;
exception
  when undefined_object then
    raise notice 'supabase_realtime publication is unavailable; create it in Supabase before enabling live updates.';
end;
$$;
