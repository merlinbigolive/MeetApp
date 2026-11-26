-- Extend per-user server-side limits for Live PK actions.
create or replace function public.consume_my_meei_rate_limit(p_action_key text)
returns boolean
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_limit integer;
  v_window integer;
begin
  case p_action_key
    when 'livekit_start' then v_limit := 2; v_window := 3600;
    when 'livekit_join' then v_limit := 30; v_window := 60;
    when 'livekit_activate' then v_limit := 4; v_window := 60;
    when 'livekit_moderate' then v_limit := 20; v_window := 60;
    when 'livekit_heartbeat' then v_limit := 12; v_window := 60;
    when 'livekit_end' then v_limit := 4; v_window := 60;
    when 'livekit_cancel' then v_limit := 4; v_window := 60;
    when 'livekit_pk_invite' then v_limit := 5; v_window := 3600;
    when 'livekit_pk_respond' then v_limit := 20; v_window := 60;
    when 'livekit_pk_join' then v_limit := 30; v_window := 60;
    when 'livekit_pk_moderate' then v_limit := 20; v_window := 60;
    when 'livekit_pk_end' then v_limit := 5; v_window := 60;
    when 'livekit_pk_inbox' then v_limit := 30; v_window := 60;
    when 'contact_sync' then v_limit := 6; v_window := 3600;
    else raise exception 'Unsupported rate-limit action' using errcode = '22023';
  end case;
  return private.consume_user_rate_limit(p_action_key, v_limit, v_window);
end;
$$;
revoke all on function public.consume_my_meei_rate_limit(text) from public,anon;
grant execute on function public.consume_my_meei_rate_limit(text) to authenticated;
