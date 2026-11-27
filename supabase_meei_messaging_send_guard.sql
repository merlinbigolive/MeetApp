-- MEEi messaging server-side send guard.
-- Prerequisites (run before this file):
--   1. schema.sql and supabase_messaging_setup.sql (messages/conversations tables)
--   2. supabase_voice_messages_setup.sql (message_type/audio_path/transcript columns
--      and the private usay-chat-audio bucket used by the voice ownership check)
--   3. supabase_global_account_blocking_setup.sql (is_blocked_for_current_user)
--   4. supabase_meei_live_chat_rate_limit_hardening.sql (private rate-limit table/helper)
--   5. supabase_meei_livekit_action_rate_limits.sql (the next rate-limit helper version)
-- This file also redefines the shared private rate-limit helper/constraint.
-- Keep it before supabase_meei_conversation_creation_guard.sql and the final
-- supabase_meei_rate_limit_action_allowlist_fix.sql.
-- Enforces authenticated sender identity, conversation membership, block status,
-- message shape, voice-object ownership and per-user send rate limits.

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

create or replace function private.enforce_meei_message_send_guard()
returns trigger
language plpgsql
security definer
set search_path = public, private, storage, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_other_user_id uuid;
  v_audio_prefix text;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if new.sender_id is distinct from v_user_id then
    raise exception 'Message sender does not match the signed-in account' using errcode = '42501';
  end if;

  select case
    when c.user_one_id = v_user_id then c.user_two_id
    when c.user_two_id = v_user_id then c.user_one_id
    else null
  end into v_other_user_id
  from public.conversations c where c.id = new.conversation_id;

  if v_other_user_id is null then
    raise exception 'Conversation unavailable' using errcode = '42501';
  end if;
  if public.is_blocked_for_current_user(v_other_user_id) then
    raise exception 'Messaging is unavailable because one account has blocked the other' using errcode = '42501';
  end if;
  if new.body is null or char_length(btrim(new.body)) not between 1 and 4000 then
    raise exception 'Message must contain 1 to 4,000 characters' using errcode = '22023';
  end if;
  if new.message_type not in ('text', 'voice') then
    raise exception 'Unsupported message type' using errcode = '22023';
  end if;

  if new.message_type = 'text' then
    if new.audio_path is not null or new.transcript is not null then
      raise exception 'Text messages cannot contain voice attachment metadata' using errcode = '22023';
    end if;
  else
    if new.audio_path is null
       or (new.transcript is not null and char_length(new.transcript) > 4000) then
      raise exception 'Invalid voice message metadata' using errcode = '22023';
    end if;
    v_audio_prefix := v_user_id::text || '/' || new.conversation_id::text || '/';
    if left(new.audio_path, length(v_audio_prefix)) <> v_audio_prefix
       or new.audio_path !~ ('^' || v_user_id::text || '/' || new.conversation_id::text || '/[0-9]+[.]wav$')
       or not exists (
         select 1 from storage.objects o
         where o.bucket_id = 'usay-chat-audio'
           and o.name = new.audio_path
           and o.owner_id = v_user_id::text
       ) then
      raise exception 'Voice attachment is invalid or unavailable' using errcode = '22023';
    end if;
  end if;

  if not private.consume_user_rate_limit('message_send', 30, 60) then
    raise exception 'Message limit reached. Please wait a moment before sending again.' using errcode = 'P0001';
  end if;
  new.created_at := clock_timestamp();
  new.read_at := null;
  return new;
end;
$$;

revoke all on function private.enforce_meei_message_send_guard() from public, anon, authenticated;
drop trigger if exists messages_00_validate_and_limit on public.messages;
create trigger messages_00_validate_and_limit
before insert on public.messages
for each row execute function private.enforce_meei_message_send_guard();

comment on function private.enforce_meei_message_send_guard() is
  'Validates MEEi message sender, participants, blocks, voice attachment ownership and 30 messages per user per 60 seconds.';
