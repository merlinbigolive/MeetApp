-- MEEi conversation creation guard: prevents forged pair creation and rapid inbox spam.
alter table private.meei_user_rate_limits
  drop constraint if exists meei_user_rate_limits_action_key_check;
alter table private.meei_user_rate_limits
  add constraint meei_user_rate_limits_action_key_check
  check (action_key = any (array[
    'live_chat_send','profile_search','video_search',
    'livekit_start','livekit_join','livekit_activate','livekit_moderate',
    'livekit_heartbeat','livekit_end','livekit_cancel','message_send','conversation_create','contact_sync'
  ]::text[]));

create or replace function private.consume_user_rate_limit(p_action_key text, p_limit integer, p_window_seconds integer)
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
  if v_user_id is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if p_action_key not in (
    'live_chat_send','profile_search','video_search',
    'livekit_start','livekit_join','livekit_activate','livekit_moderate',
    'livekit_heartbeat','livekit_end','livekit_cancel','message_send','conversation_create','contact_sync'
  ) or p_limit is null or p_limit < 1 or p_limit > 120
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

create or replace function private.enforce_meei_conversation_create_guard()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_other_user_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if new.user_one_id is distinct from v_user_id and new.user_two_id is distinct from v_user_id then
    raise exception 'You can only create a conversation for your own account' using errcode = '42501';
  end if;
  v_other_user_id := case when new.user_one_id = v_user_id then new.user_two_id else new.user_one_id end;
  if v_other_user_id is null or v_other_user_id = v_user_id then
    raise exception 'Invalid conversation participants' using errcode = '22023';
  end if;
  if public.is_blocked_for_current_user(v_other_user_id) then
    raise exception 'Messaging is unavailable because one account has blocked the other' using errcode = '42501';
  end if;
  if not private.consume_user_rate_limit('conversation_create', 20, 60) then
    raise exception 'Too many new conversations. Please wait before starting another chat.' using errcode = 'P0001';
  end if;
  new.created_at := clock_timestamp();
  new.updated_at := new.created_at;
  return new;
end;
$$;

revoke all on function private.enforce_meei_conversation_create_guard() from public, anon, authenticated;
drop trigger if exists conversations_00_validate_and_limit on public.conversations;
create trigger conversations_00_validate_and_limit
before insert on public.conversations
for each row execute function private.enforce_meei_conversation_create_guard();

comment on function private.enforce_meei_conversation_create_guard() is
  'Validates MEEi conversation creator and participants, checks account blocks, and limits new conversations to 20 per user per 60 seconds.';
