-- Server-issued per-entry cursor: viewers cannot load comments created before joining.
create table if not exists public.live_chat_memberships (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.live_sessions(id) on delete cascade,
  viewer_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default clock_timestamp(),
  created_at timestamptz not null default now()
);
create index if not exists live_chat_memberships_viewer_session_idx
  on public.live_chat_memberships(session_id, viewer_id, joined_at desc);
alter table public.live_chat_memberships enable row level security;
revoke all on public.live_chat_memberships from anon, authenticated;
grant all on public.live_chat_memberships to service_role;

create or replace function public.start_live_chat_membership(target_session_id uuid)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare viewer uuid := auth.uid(); membership_id uuid; entry_allowed boolean;
begin
  if viewer is null then raise exception 'Sign in to join Live chat.'; end if;
  select ce.allowed into entry_allowed from public.check_live_entry(target_session_id) ce;
  if not coalesce(entry_allowed, false) then raise exception 'You are not allowed to join this Live.'; end if;
  insert into public.live_chat_memberships(session_id, viewer_id, joined_at)
  values (target_session_id, viewer, clock_timestamp()) returning id into membership_id;
  return membership_id;
end; $$;

drop function if exists public.get_live_chat_messages(uuid, integer);
create function public.get_live_chat_messages(
  target_session_id uuid, message_limit integer default 60, target_membership_id uuid default null
)
returns table (id uuid, user_id uuid, username text, body text, created_at timestamptz, avatar_path text)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare viewer uuid := auth.uid(); host_id uuid; viewer_joined_at timestamptz;
begin
  if viewer is null then raise exception 'Sign in to view Live chat.'; end if;
  select ls.user_id into host_id from public.live_sessions ls
  where ls.id = target_session_id and ls.status = 'live'
    and ls.last_heartbeat_at > now() - interval '90 seconds';
  if host_id is null then raise exception 'This Live has ended.'; end if;
  if viewer <> host_id then
    if not coalesce((select ce.allowed from public.check_live_entry(target_session_id) ce), false) then
      raise exception 'You are not allowed to view this Live.';
    end if;
    if target_membership_id is null then raise exception 'Rejoin this Live to load your new chat feed.'; end if;
    select cm.joined_at into viewer_joined_at from public.live_chat_memberships cm
    where cm.id = target_membership_id and cm.session_id = target_session_id and cm.viewer_id = viewer;
    if viewer_joined_at is null then raise exception 'Invalid Live chat membership. Rejoin this Live.'; end if;
  else
    viewer_joined_at := '-infinity'::timestamptz;
  end if;
  return query
  select m.id, m.sender_id, p.username, m.body, m.created_at, avatar.storage_path
  from public.live_chat_messages m
  join public.profiles p on p.id = m.sender_id
  left join lateral (
    select pm.storage_path from public.profile_media pm
    where pm.user_id = m.sender_id and pm.kind = 'avatar' order by pm.position limit 1
  ) avatar on true
  where m.session_id = target_session_id and m.created_at >= viewer_joined_at
    and not exists (
      select 1 from public.live_moderation_actions a
      where a.creator_id = host_id and a.viewer_id = m.sender_id
        and a.revoked_at is null and (a.expires_at is null or a.expires_at > now())
        and (a.action = 'block' or (a.session_id = target_session_id and a.action in ('mute','kickout')))
    )
  order by m.created_at desc limit greatest(1, least(coalesce(message_limit, 60), 100));
end; $$;

revoke all on function public.start_live_chat_membership(uuid) from public, anon;
revoke all on function public.get_live_chat_messages(uuid, integer, uuid) from public, anon;
grant execute on function public.start_live_chat_membership(uuid) to authenticated;
grant execute on function public.get_live_chat_messages(uuid, integer, uuid) to authenticated;
comment on table public.live_chat_memberships is
  'Server-issued per-entry Live chat cursor. Viewers only fetch messages created at or after their membership joined_at.';
