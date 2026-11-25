-- MEEi global account-blocking integration hardening.
-- Run after supabase_global_account_blocking_setup.sql and Live moderation setup.
-- Safe to re-run.

-- Prevent a pending follow request from being accepted after either account blocks the other.
drop policy if exists "global_block_follows_update" on public.follows;
create policy "global_block_follows_update" on public.follows
as restrictive for update to authenticated
using (not public.is_blocked_for_current_user(follower_id)
       and not public.is_blocked_for_current_user(followed_id))
with check (not public.is_blocked_for_current_user(follower_id)
            and not public.is_blocked_for_current_user(followed_id));

-- Apply global account blocks to all Live entry, chat and viewer-profile RPC paths.
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

  if viewer <> host_id and public.is_blocked_for_current_user(host_id) then
    return query select false, 'account_blocked'::text;
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
  if viewer <> host_id and public.is_blocked_for_current_user(host_id) then
    raise exception 'This account is blocked. Live access is unavailable.';
  end if;

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

  if exists (
    select 1 from public.live_moderation_actions a
    where a.creator_id = host_id and a.viewer_id = viewer
      and a.action = 'block' and a.revoked_at is null
      and (a.expires_at is null or a.expires_at > now())
  ) then raise exception 'You cannot comment in this Live.'; end if;

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

  if viewer <> host_id and public.is_blocked_for_current_user(host_id) then
    raise exception 'This account is blocked. Live chat is unavailable.';
  end if;

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
    and not public.is_blocked_for_current_user(m.sender_id)
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
  if public.is_blocked_for_current_user(target_viewer_id) then
    raise exception 'This account is blocked.';
  end if;

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

revoke all on function public.check_live_entry(uuid) from public;
revoke all on function public.send_live_chat_message(uuid, text) from public;
revoke all on function public.get_live_chat_messages(uuid, integer) from public;
revoke all on function public.get_live_viewer_profile(uuid, uuid) from public;
grant execute on function public.check_live_entry(uuid) to authenticated;
grant execute on function public.send_live_chat_message(uuid, text) to authenticated;
grant execute on function public.get_live_chat_messages(uuid, integer) to authenticated;
grant execute on function public.get_live_viewer_profile(uuid, uuid) to authenticated;



-- Read receipts must not be updated through the SECURITY DEFINER RPC after a block.
create or replace function public.mark_conversation_read(target_conversation_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  changed integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not exists (
    select 1 from public.conversations c
    where c.id = target_conversation_id
      and (c.user_one_id = auth.uid() or c.user_two_id = auth.uid())
      and not public.is_blocked_for_current_user(
        case when c.user_one_id = auth.uid() then c.user_two_id else c.user_one_id end)
  ) then
    raise exception 'Conversation unavailable';
  end if;

  if not exists (
    select 1 from public.conversations c
    where c.id = target_conversation_id
      and (c.user_one_id = auth.uid() or c.user_two_id = auth.uid())
  ) then
    raise exception 'Conversation not found';
  end if;

  update public.messages
  set read_at = now()
  where conversation_id = target_conversation_id
    and sender_id <> auth.uid()
    and read_at is null;

  get diagnostics changed = row_count;
  return changed;
end;
$$;
revoke all on function public.mark_conversation_read(uuid) from public;
grant execute on function public.mark_conversation_read(uuid) to authenticated;

-- Keep private voice-note storage inaccessible across a global block, including old audio.
drop policy if exists "global_block_chat_audio_select" on storage.objects;
create policy "global_block_chat_audio_select" on storage.objects
as restrictive for select to authenticated
using (
  bucket_id <> 'usay-chat-audio'
  or exists (
    select 1 from public.conversations c
    where c.id::text = split_part(name, '/', 2)
      and (c.user_one_id = auth.uid() or c.user_two_id = auth.uid())
      and not public.is_blocked_for_current_user(
        case when c.user_one_id = auth.uid() then c.user_two_id else c.user_one_id end)
  )
);

drop policy if exists "global_block_chat_audio_insert" on storage.objects;
create policy "global_block_chat_audio_insert" on storage.objects
as restrictive for insert to authenticated
with check (
  bucket_id <> 'usay-chat-audio'
  or exists (
    select 1 from public.conversations c
    where c.id::text = split_part(name, '/', 2)
      and (c.user_one_id = auth.uid() or c.user_two_id = auth.uid())
      and not public.is_blocked_for_current_user(
        case when c.user_one_id = auth.uid() then c.user_two_id else c.user_one_id end)
  )
);
