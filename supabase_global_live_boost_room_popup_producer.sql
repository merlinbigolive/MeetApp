-- Deliver first-time Global Live Boost popups only inside an active room.
-- The producer is driven by trusted database triggers, never by a mobile client.

create unique index if not exists live_room_popup_one_global_boost_per_viewer_session
  on private.live_room_popup_events (recipient_user_id, session_id)
  where event_type = 'global_live_boost';

create or replace function private.enqueue_global_boost_popup_for_viewer(
  p_viewer_id uuid,
  p_session_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
begin
  -- This helper is callable only as part of a trusted database trigger chain.
  if pg_trigger_depth() < 1 then
    raise exception 'Global Boost popups can only be produced by trusted database triggers'
      using errcode = '42501';
  end if;

  if p_viewer_id is null or p_session_id is null then
    return;
  end if;

  -- Serialize duplicate joins / concurrent boost activation for the same viewer and room.
  perform pg_advisory_xact_lock(
    hashtextextended(p_session_id::text || ':' || p_viewer_id::text, 0)
  );

  if not exists (
    select 1
    from private.creator_global_live_boosts gb
    join public.live_sessions ls on ls.id = gb.session_id
    where gb.session_id = p_session_id
      and gb.ends_at > clock_timestamp()
      and ls.status = 'live'
      and ls.last_heartbeat_at > clock_timestamp() - interval '90 seconds'
  ) then
    return;
  end if;

  if exists (
    select 1 from private.live_room_popup_events e
    where e.recipient_user_id = p_viewer_id
      and e.session_id = p_session_id
      and e.event_type = 'global_live_boost'
  ) then
    return;
  end if;

  begin
    perform private.enqueue_live_room_popup_event(
      p_viewer_id,
      p_session_id,
      'global_live_boost',
      'Global Live Boost',
      'This creator is being featured worldwide for 5 minutes.',
      5
    );
  exception
    when insufficient_privilege or check_violation or invalid_parameter_value then
      -- Membership should never fail because a short-lived popup is ineligible.
      raise log 'Global Live Boost popup skipped for viewer % in session %: %',
        p_viewer_id, p_session_id, sqlerrm;
  end;
end;
$function$;

revoke all on function private.enqueue_global_boost_popup_for_viewer(uuid,uuid)
  from public, anon, authenticated, service_role;

create or replace function private.on_live_membership_check_global_boost_popup()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
begin
  if new.left_at is null then
    perform private.enqueue_global_boost_popup_for_viewer(new.viewer_id, new.session_id);
  end if;
  return new;
end;
$function$;

revoke all on function private.on_live_membership_check_global_boost_popup()
  from public, anon, authenticated;

drop trigger if exists live_membership_global_boost_popup on public.live_chat_memberships;
create trigger live_membership_global_boost_popup
after insert on public.live_chat_memberships
for each row execute function private.on_live_membership_check_global_boost_popup();

create or replace function private.on_creator_global_boost_created()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_viewer record;
begin
  for v_viewer in
    select m.viewer_id
    from public.live_chat_memberships m
    where m.session_id = new.session_id
      and m.left_at is null
      and m.viewer_id <> new.creator_id
  loop
    perform private.enqueue_global_boost_popup_for_viewer(v_viewer.viewer_id, new.session_id);
  end loop;
  return new;
end;
$function$;

revoke all on function private.on_creator_global_boost_created()
  from public, anon, authenticated;

drop trigger if exists creator_global_boost_popup_existing_viewers
  on private.creator_global_live_boosts;
create trigger creator_global_boost_popup_existing_viewers
after insert on private.creator_global_live_boosts
for each row execute function private.on_creator_global_boost_created();

-- Trigger calls are the only non-service-role path through the private enqueue function.
create or replace function private.enqueue_live_room_popup_event(
  p_recipient_user_id uuid,
  p_session_id uuid,
  p_event_type text,
  p_title text,
  p_message text,
  p_ttl_seconds integer default 5
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_id uuid;
  v_role text;
  v_membership_id uuid;
begin
  v_role := coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '');
  if v_role <> 'service_role' and pg_trigger_depth() < 1 then
    raise exception 'Only trusted server or trigger workflows can create Live room popups'
      using errcode = '42501';
  end if;
  if p_recipient_user_id is null or p_session_id is null
     or p_event_type not in ('global_live_boost','live_promotion','room_invite','other')
     or char_length(trim(coalesce(p_title,''))) not between 1 and 80
     or char_length(trim(coalesce(p_message,''))) not between 1 and 220
     or p_ttl_seconds not between 1 and 15 then
    raise exception 'Invalid Live room popup payload' using errcode = '22023';
  end if;

  select m.id into v_membership_id
  from public.live_sessions ls
  join public.live_chat_memberships m on m.session_id = ls.id
  where ls.id = p_session_id and ls.status = 'live'
    and ls.user_id <> p_recipient_user_id
    and m.viewer_id = p_recipient_user_id and m.left_at is null
  order by m.joined_at desc
  limit 1;
  if v_membership_id is null then
    raise exception 'Recipient is not an active viewer in this Live room' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.live_moderators lm
    join public.live_sessions ls on ls.user_id = lm.creator_id
    where ls.id = p_session_id and lm.moderator_id = p_recipient_user_id
      and lm.revoked_at is null
  ) or exists (
    select 1 from public.live_pk_battles b
    where b.status = 'active'
      and (b.creator_a_id = p_recipient_user_id or b.creator_b_id = p_recipient_user_id)
  ) or exists (
    select 1 from public.live_sessions ls
    join public.user_blocks ub on
      (ub.blocker_id = ls.user_id and ub.blocked_id = p_recipient_user_id)
      or (ub.blocker_id = p_recipient_user_id and ub.blocked_id = ls.user_id)
    where ls.id = p_session_id
  ) or exists (
    select 1 from public.live_sessions ls
    join public.live_moderation_actions ma on ma.creator_id = ls.user_id and ma.viewer_id = p_recipient_user_id
    where ls.id = p_session_id and ma.action in ('mute','kickout','block')
      and ma.revoked_at is null and (ma.expires_at is null or ma.expires_at > now())
  ) then
    raise exception 'Creators, moderators, blocked, muted, kicked, and PK participants are not eligible for Live room popups'
      using errcode = '42501';
  end if;

  update private.live_room_popup_events
    set dismissed_at = coalesce(dismissed_at, now())
    where recipient_user_id = p_recipient_user_id
      and session_id = p_session_id
      and membership_id = v_membership_id
      and dismissed_at is null;

  insert into private.live_room_popup_events (
    recipient_user_id, session_id, membership_id, event_type, title, message, expires_at
  ) values (
    p_recipient_user_id, p_session_id, v_membership_id, p_event_type, trim(p_title), trim(p_message),
    now() + make_interval(secs => p_ttl_seconds)
  ) returning id into v_id;
  return v_id;
end;
$function$;

revoke all on function private.enqueue_live_room_popup_event(uuid,uuid,text,text,text,integer)
  from public, anon, authenticated;
grant execute on function private.enqueue_live_room_popup_event(uuid,uuid,text,text,text,integer)
  to service_role;
