-- MEEi LiveKit control action rate limits.
-- Per-user windows: start 2/hour, join 30/min, activate 4/min,
-- moderate 20/min, heartbeat 12/min, end 4/min, cancel 4/min.
-- Requires private.meei_user_rate_limits from the Live Chat rate-limit migration.

alter table private.meei_user_rate_limits
  drop constraint if exists meei_user_rate_limits_action_key_check;
alter table private.meei_user_rate_limits
  add constraint meei_user_rate_limits_action_key_check
  check (action_key in (
    'live_chat_send','profile_search','video_search',
    'livekit_start','livekit_join','livekit_activate','livekit_moderate',
    'livekit_heartbeat','livekit_end','livekit_cancel'
  ));

create or replace function private.consume_user_rate_limit(p_action_key text, p_limit integer, p_window_seconds integer)
returns boolean language plpgsql security definer
set search_path = pg_catalog, private, pg_temp
as $function$
declare v_user_id uuid := auth.uid(); v_count integer; v_now timestamptz := clock_timestamp();
begin
  if v_user_id is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if p_action_key not in ('live_chat_send','profile_search','video_search','livekit_start','livekit_join','livekit_activate','livekit_moderate','livekit_heartbeat','livekit_end','livekit_cancel')
    or p_limit is null or p_limit < 1 or p_limit > 120 or p_window_seconds is null or p_window_seconds < 1 or p_window_seconds > 3600 then
    raise exception 'Invalid rate-limit configuration' using errcode = '22023';
  end if;
  insert into private.meei_user_rate_limits as limits(user_id,action_key,window_started_at,request_count)
  values(v_user_id,p_action_key,v_now,1)
  on conflict(user_id,action_key) do update
    set window_started_at=case when limits.window_started_at <= v_now-make_interval(secs=>p_window_seconds) then v_now else limits.window_started_at end,
        request_count=case when limits.window_started_at <= v_now-make_interval(secs=>p_window_seconds) then 1 else limits.request_count+1 end
  returning request_count into v_count;
  return v_count <= p_limit;
end;
$function$;
revoke all on function private.consume_user_rate_limit(text,integer,integer) from public,anon,authenticated;

create or replace function public.consume_my_meei_rate_limit(p_action_key text)
returns boolean language plpgsql security definer
set search_path = public, private, pg_temp
as $function$
declare v_limit integer; v_window integer;
begin
  case p_action_key
    when 'livekit_start' then v_limit:=2; v_window:=3600;
    when 'livekit_join' then v_limit:=30; v_window:=60;
    when 'livekit_activate' then v_limit:=4; v_window:=60;
    when 'livekit_moderate' then v_limit:=20; v_window:=60;
    when 'livekit_heartbeat' then v_limit:=12; v_window:=60;
    when 'livekit_end' then v_limit:=4; v_window:=60;
    when 'livekit_cancel' then v_limit:=4; v_window:=60;
    else raise exception 'Unsupported rate-limit action' using errcode='22023';
  end case;
  return private.consume_user_rate_limit(p_action_key,v_limit,v_window);
end;
$function$;
revoke all on function public.consume_my_meei_rate_limit(text) from public,anon;
grant execute on function public.consume_my_meei_rate_limit(text) to authenticated;
