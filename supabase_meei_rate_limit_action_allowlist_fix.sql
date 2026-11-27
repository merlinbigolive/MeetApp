-- MEEi: keep the private rate-limit allowlist aligned with the public
-- authenticated action wrapper. Earlier Live PK/chat migrations extended the
-- wrapper but did not extend this private function's allowlist/constraint.
-- Without this migration, PK and chat-join requests are rejected as invalid.

alter table private.meei_user_rate_limits
  drop constraint if exists meei_user_rate_limits_action_key_check;

alter table private.meei_user_rate_limits
  add constraint meei_user_rate_limits_action_key_check
  check (action_key in (
    'live_chat_send',
    'profile_search',
    'video_search',
    'livekit_start',
    'livekit_join',
    'livekit_activate',
    'livekit_moderate',
    'livekit_heartbeat',
    'livekit_end',
    'livekit_cancel',
    'livekit_pk_invite',
    'livekit_pk_respond',
    'livekit_pk_join',
    'livekit_pk_moderate',
    'livekit_pk_end',
    'livekit_pk_inbox',
    'livekit_chat_join',
    'message_send',
    'conversation_create',
    'contact_sync'
  ));

create or replace function private.consume_user_rate_limit(
  p_action_key text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, private, pg_temp
as $function$
declare
  v_user_id uuid := auth.uid();
  v_count integer;
  v_now timestamptz := clock_timestamp();
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if p_action_key not in (
    'live_chat_send',
    'profile_search',
    'video_search',
    'livekit_start',
    'livekit_join',
    'livekit_activate',
    'livekit_moderate',
    'livekit_heartbeat',
    'livekit_end',
    'livekit_cancel',
    'livekit_pk_invite',
    'livekit_pk_respond',
    'livekit_pk_join',
    'livekit_pk_moderate',
    'livekit_pk_end',
    'livekit_pk_inbox',
    'livekit_chat_join',
    'message_send',
    'conversation_create',
    'contact_sync'
  )
  or p_limit is null or p_limit < 1 or p_limit > 120
  or p_window_seconds is null or p_window_seconds < 1 or p_window_seconds > 86400 then
    raise exception 'Invalid rate-limit configuration' using errcode = '22023';
  end if;

  insert into private.meei_user_rate_limits as limits
    (user_id, action_key, window_started_at, request_count)
  values (v_user_id, p_action_key, v_now, 1)
  on conflict (user_id, action_key) do update
    set window_started_at = case
          when limits.window_started_at <= v_now - make_interval(secs => p_window_seconds)
          then v_now else limits.window_started_at end,
        request_count = case
          when limits.window_started_at <= v_now - make_interval(secs => p_window_seconds)
          then 1 else limits.request_count + 1 end
  returning request_count into v_count;

  return v_count <= p_limit;
end;
$function$;

-- Keep the wrapper and private implementation allowlists in sync. A new
-- public action must also be added to both this function and the table CHECK.
-- The Node regression checks in tests/rateLimitAllowlist.test.cjs
-- guard this three-way contract.

revoke all on function private.consume_user_rate_limit(text, integer, integer)
  from public, anon, authenticated;
