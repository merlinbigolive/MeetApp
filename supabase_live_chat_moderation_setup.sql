-- MEEi Live chat + Creator moderation security layer.
-- Run AFTER supabase_live_discovery_setup.sql.
-- Chat and moderation writes are RPC-only; clients cannot forge creator actions.

create table if not exists public.live_chat_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.live_sessions(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 500),
  created_at timestamptz not null default now()
);

create index if not exists live_chat_messages_session_created_idx
  on public.live_chat_messages(session_id, created_at desc);

create table if not exists public.live_moderation_actions (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.profiles(id) on delete cascade,
  viewer_id uuid not null references public.profiles(id) on delete cascade,
  session_id uuid references public.live_sessions(id) on delete cascade,
  action text not null check (action in ('mute','kickout','block')),
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  check (creator_id <> viewer_id),
  check (
    (action = 'block' and session_id is null)
    or (action in ('mute','kickout') and session_id is not null)
  )
);

create index if not exists live_moderation_active_lookup_idx
  on public.live_moderation_actions(creator_id, viewer_id, action)
  where revoked_at is null;

alter table public.live_chat_messages enable row level security;
alter table public.live_moderation_actions enable row level security;

-- No direct client reads or writes. Access is mediated by the functions below.
revoke all on public.live_chat_messages from anon, authenticated;
revoke all on public.live_moderation_actions from anon, authenticated;
grant all on public.live_chat_messages to service_role;
grant all on public.live_moderation_actions to service_role;

create or replace function public.check_live_entry(target_session_id uuid)
returns table (allowed boolean, reason text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  viewer uuid := auth.uid();
  host_id uuid;
  current_username text;
begin
  if viewer is null then
    return query select false, 'sign_in_required'::text;
    return;
  end if;

  select ls.user_id into host_id
  from public.live_sessions ls
  where ls.id = target_session_id
    and ls.status = 'live'
    and ls.last_heartbeat_at > now() - interval '90 seconds';

  if host_id is null then
    return query select false, 'live_ended'::text;
    return;
  end if;

  select p.username into current_username
  from public.profiles p where p.id = viewer;

  if current_username is null
     or length(trim(current_username)) < 3
     or lower(trim(current_username)) in ('your_username','username','user_name') then
    return query select false, 'username_required'::text;
    return;
  end if;

  if viewer = host_id then
    return query select true, 'creator'::text;
    return;
  end if;

  if exists (
    select 1 from public.live_moderation_actions a
    where a.creator_id = host_id and a.viewer_id = viewer
      and a.action = 'block' and a.revoked_at is null
      and (a.expires_at is null or a.expires_at > now())
  ) then
    return query select false, 'blocked_by_creator'::text;
    return;
  end if;

  if exists (
    select 1 from public.live_moderation_actions a
    where a.creator_id = host_id and a.viewer_id = viewer
      and a.session_id = target_session_id
      and a.action = 'kickout' and a.revoked_at is null
      and (a.expires_at is null or a.expires_at > now())
  ) then
    return query select false, 'removed_from_live'::text;
    return;
  end if;

  return query select true, 'ok'::text;
end;
$$;

create or replace function public.send_live_chat_message(
  target_session_id uuid,
  message_body text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  viewer uuid := auth.uid();
  host_id uuid;
  message_id uuid;
begin
  if viewer is null then raise exception 'Sign in to comment.'; end if;
  if message_body is null or char_length(trim(message_body)) not between 1 and 500 then
    raise exception 'Comment must contain 1 to 500 characters.';
  end if;

  select ls.user_id into host_id
  from public.live_sessions ls
  where ls.id = target_session_id
    and ls.status = 'live'
    and ls.last_heartbeat_at > now() - interval '90 seconds';

  if host_id is null then raise exception 'This Live has ended.'; end if;
  if viewer = host_id then
    -- Creators may chat in their own room.
    null;
  else
    if not exists (
      select 1 from public.profiles p
      where p.id = viewer and p.username is not null
        and length(trim(p.username)) >= 3
        and lower(trim(p.username)) not in ('your_username','username','user_name')
    ) then
      raise exception 'Set your username before joining Live.';
    end if;

    if exists (
      select 1 from public.live_moderation_actions a
      where a.creator_id = host_id and a.viewer_id = viewer
        and a.revoked_at is null and (a.expires_at is null or a.expires_at > now())
        and (
          a.action = 'block'
          or (a.session_id = target_session_id and a.action in ('mute','kickout'))
        )
    ) then
      raise exception 'You cannot comment in this Live.';
    end if;
  end if;

  insert into public.live_chat_messages(session_id, sender_id, body)
  values (target_session_id, viewer, trim(message_body))
  returning id into message_id;

  return message_id;
end;
$$;

create or replace function public.get_live_chat_messages(target_session_id uuid, message_limit integer default 60)
returns table (
  id uuid,
  user_id uuid,
  username text,
  body text,
  created_at timestamptz,
  avatar_path text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  viewer uuid := auth.uid();
  host_id uuid;
begin
  if viewer is null then raise exception 'Sign in to view Live chat.'; end if;

  select ls.user_id into host_id
  from public.live_sessions ls
  where ls.id = target_session_id and ls.status = 'live'
    and ls.last_heartbeat_at > now() - interval '90 seconds';

  if host_id is null then raise exception 'This Live has ended.'; end if;

  if viewer <> host_id and not coalesce((select ce.allowed from public.check_live_entry(target_session_id) ce), false) then
    raise exception 'You are not allowed to view this Live.';
  end if;

  return query
  select m.id, m.sender_id, p.username, m.body, m.created_at, avatar.storage_path
  from public.live_chat_messages m
  join public.profiles p on p.id = m.sender_id
  left join lateral (
    select pm.storage_path from public.profile_media pm
    where pm.user_id = m.sender_id and pm.kind = 'avatar'
    order by pm.position limit 1
  ) avatar on true
  where m.session_id = target_session_id
    and not exists (
      select 1 from public.live_moderation_actions a
      where a.creator_id = host_id and a.viewer_id = m.sender_id
        and a.revoked_at is null and (a.expires_at is null or a.expires_at > now())
        and (
          a.action = 'block'
          or (a.session_id = target_session_id and a.action in ('mute','kickout'))
        )
    )
  order by m.created_at desc
  limit greatest(1, least(coalesce(message_limit, 60), 100));
end;
$$;

create or replace function public.get_live_viewer_profile(
  target_session_id uuid,
  target_viewer_id uuid
)
returns table (
  user_id uuid,
  username text,
  display_name text,
  bio text,
  avatar_path text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.live_sessions ls
    where ls.id = target_session_id and ls.user_id = auth.uid()
      and ls.status = 'live'
      and ls.last_heartbeat_at > now() - interval '90 seconds'
  ) then
    raise exception 'Only the Live creator can manage viewers.';
  end if;

  return query
  select p.id, p.username, p.display_name, p.bio, avatar.storage_path
  from public.profiles p
  left join lateral (
    select pm.storage_path from public.profile_media pm
    where pm.user_id = p.id and pm.kind = 'avatar'
    order by pm.position limit 1
  ) avatar on true
  where p.id = target_viewer_id;
end;
$$;

create or replace function public.moderate_live_viewer(
  target_session_id uuid,
  target_viewer_id uuid,
  moderation_action text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  host_id uuid;
begin
  if auth.uid() is null then raise exception 'Sign in required.'; end if;
  if moderation_action not in ('mute','kickout','block','unmute','unblock','allow') then
    raise exception 'Unsupported moderation action.';
  end if;

  select ls.user_id into host_id
  from public.live_sessions ls
  where ls.id = target_session_id and ls.user_id = auth.uid()
    and ls.status = 'live'
    and ls.last_heartbeat_at > now() - interval '90 seconds';

  if host_id is null then raise exception 'Only the active Live creator can manage viewers.'; end if;
  if target_viewer_id = host_id then raise exception 'Creator cannot moderate their own account.'; end if;

  if moderation_action in ('unmute','unblock','allow') then
    update public.live_moderation_actions
    set revoked_at = now()
    where creator_id = host_id and viewer_id = target_viewer_id
      and revoked_at is null
      and (
        (moderation_action = 'unblock' and action = 'block')
        or (moderation_action = 'unmute' and action = 'mute' and session_id = target_session_id)
        or (moderation_action = 'allow' and action = 'kickout' and session_id = target_session_id)
      );
    return true;
  end if;

  insert into public.live_moderation_actions(
    creator_id, viewer_id, session_id, action, expires_at
  )
  values (
    host_id,
    target_viewer_id,
    case when moderation_action = 'block' then null else target_session_id end,
    moderation_action,
    case when moderation_action = 'mute' then now() + interval '15 minutes' else null end
  );

  return true;
end;
$$;

revoke all on function public.check_live_entry(uuid) from public;
revoke all on function public.send_live_chat_message(uuid, text) from public;
revoke all on function public.get_live_chat_messages(uuid, integer) from public;
revoke all on function public.get_live_viewer_profile(uuid, uuid) from public;
revoke all on function public.moderate_live_viewer(uuid, uuid, text) from public;

grant execute on function public.check_live_entry(uuid) to authenticated;
grant execute on function public.send_live_chat_message(uuid, text) to authenticated;
grant execute on function public.get_live_chat_messages(uuid, integer) to authenticated;
grant execute on function public.get_live_viewer_profile(uuid, uuid) to authenticated;
grant execute on function public.moderate_live_viewer(uuid, uuid, text) to authenticated;

comment on table public.live_chat_messages is
  'Live room chat. Clients use RPCs only; username is returned as plain text without @ or # prefixes.';
comment on table public.live_moderation_actions is
  'Creator-enforced Live moderation. Mute is 15 minutes, kickout is for the current session, and block persists across the creator''s future Lives until revoked.';
