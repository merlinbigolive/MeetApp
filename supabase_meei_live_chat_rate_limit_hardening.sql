-- MEEi: server-side per-user rate limit for Live chat.
-- Rate-limit state is private and cannot be read or modified by client roles.
-- Live chat limit: 6 messages per authenticated user per 10-second window.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.meei_user_rate_limits (
  user_id uuid not null,
  action_key text not null,
  window_started_at timestamptz not null,
  request_count integer not null check (request_count > 0),
  primary key (user_id, action_key),
  check (action_key in ('live_chat_send', 'profile_search', 'video_search'))
);
alter table private.meei_user_rate_limits enable row level security;
revoke all on table private.meei_user_rate_limits from public, anon, authenticated;

create or replace function private.consume_user_rate_limit(p_action_key text, p_limit integer, p_window_seconds integer)
returns boolean language plpgsql security definer
set search_path = pg_catalog, private, pg_temp
as $function$
declare
  v_user_id uuid := auth.uid();
  v_count integer;
  v_now timestamptz := clock_timestamp();
begin
  if v_user_id is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if p_action_key not in ('live_chat_send', 'profile_search', 'video_search')
     or p_limit is null or p_limit < 1 or p_limit > 120
     or p_window_seconds is null or p_window_seconds < 1 or p_window_seconds > 3600 then
    raise exception 'Invalid rate-limit configuration' using errcode = '22023';
  end if;
  insert into private.meei_user_rate_limits as limits
    (user_id, action_key, window_started_at, request_count)
  values (v_user_id, p_action_key, v_now, 1)
  on conflict (user_id, action_key) do update
    set window_started_at = case when limits.window_started_at <= v_now - make_interval(secs => p_window_seconds) then v_now else limits.window_started_at end,
        request_count = case when limits.window_started_at <= v_now - make_interval(secs => p_window_seconds) then 1 else limits.request_count + 1 end
  returning request_count into v_count;
  return v_count <= p_limit;
end;
$function$;
revoke all on function private.consume_user_rate_limit(text, integer, integer) from public, anon, authenticated;

create or replace function public.send_live_chat_message(target_session_id uuid, message_body text)
returns uuid language plpgsql security definer
set search_path = public, pg_temp
as $function$
declare
  viewer uuid := auth.uid();
  host_id uuid;
  message_id uuid;
begin
  if viewer is null then raise exception 'Sign in to comment.'; end if;
  if message_body is null or char_length(trim(message_body)) not between 1 and 500 then
    raise exception 'Comment must contain 1 to 500 characters.';
  end if;
  if not private.consume_user_rate_limit('live_chat_send', 6, 10) then
    raise exception 'You are sending messages too quickly. Please wait a few seconds.';
  end if;
  select ls.user_id into host_id from public.live_sessions ls
  where ls.id = target_session_id and ls.status = 'live'
    and ls.last_heartbeat_at > now() - interval '90 seconds';
  if host_id is null then raise exception 'This Live has ended.'; end if;
  if viewer <> host_id and public.is_blocked_for_current_user(host_id) then
    raise exception 'This account is blocked. Live access is unavailable.';
  end if;
  if viewer <> host_id then
    if not exists (
      select 1 from public.profiles p where p.id = viewer and p.username is not null
        and length(trim(p.username)) >= 3
        and lower(trim(p.username)) not in ('your_username','username','user_name')
    ) then raise exception 'Set your username before joining Live.'; end if;
    if exists (
      select 1 from public.live_moderation_actions a
      where a.creator_id = host_id and a.viewer_id = viewer
        and a.revoked_at is null and (a.expires_at is null or a.expires_at > now())
        and (a.action = 'block' or (a.session_id = target_session_id and a.action in ('mute','kickout')))
    ) then raise exception 'You cannot comment in this Live.'; end if;
  end if;
  if exists (
    select 1 from public.live_moderation_actions a
    where a.creator_id = host_id and a.viewer_id = viewer and a.action = 'block'
      and a.revoked_at is null and (a.expires_at is null or a.expires_at > now())
  ) then raise exception 'You cannot comment in this Live.'; end if;
  insert into public.live_chat_messages(session_id, sender_id, body)
  values (target_session_id, viewer, trim(message_body)) returning id into message_id;
  return message_id;
end;
$function$;
revoke all on function public.send_live_chat_message(uuid, text) from public, anon;
grant execute on function public.send_live_chat_message(uuid, text) to authenticated;
