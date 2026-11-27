-- Room Admins are represented by active live_moderators rows.
-- They should receive the same in-room boost popup as ordinary viewers.
-- Creators remain excluded; PK participants and blocked/muted/kicked users remain excluded.

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
set search_path = pg_catalog, public, private, pg_temp
as $function$
declare
  v_id uuid;
  v_role text;
  v_membership_id uuid;
begin
  v_role := coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '');
  if v_role <> 'service_role' and pg_trigger_depth() < 1 then
    raise exception 'Only trusted server or trigger workflows can create Live room popups' using errcode = '42501';
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
  order by m.joined_at desc limit 1;
  if v_membership_id is null then
    raise exception 'Recipient is not an active viewer in this Live room' using errcode = '42501';
  end if;

  if exists (
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
    raise exception 'PK participants, blocked, muted, and kicked viewers are not eligible for Live room popups' using errcode = '42501';
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

create or replace function public.get_my_live_room_popup_event(target_session_id uuid)
returns table(event_id uuid, event_type text, title text, message text, expires_at timestamptz)
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then return; end if;
  if exists (
    select 1 from public.live_pk_battles b
    where b.status = 'active'
      and (b.creator_a_id = v_uid or b.creator_b_id = v_uid)
  ) then
    update private.live_room_popup_events e set dismissed_at = coalesce(e.dismissed_at, now())
    where e.recipient_user_id = v_uid and e.dismissed_at is null;
    return;
  end if;

  if not exists (
    select 1 from public.live_sessions ls
    join public.live_chat_memberships m on m.session_id = ls.id
    where ls.id = target_session_id and ls.status = 'live'
      and ls.user_id <> v_uid and m.viewer_id = v_uid and m.left_at is null
  ) or exists (
    select 1 from public.live_sessions ls
    join public.user_blocks ub on
      (ub.blocker_id = ls.user_id and ub.blocked_id = v_uid)
      or (ub.blocker_id = v_uid and ub.blocked_id = ls.user_id)
    where ls.id = target_session_id
  ) or exists (
    select 1 from public.live_sessions ls
    join public.live_moderation_actions ma on ma.creator_id = ls.user_id and ma.viewer_id = v_uid
    where ls.id = target_session_id and ma.action in ('mute','kickout','block')
      and ma.revoked_at is null and (ma.expires_at is null or ma.expires_at > now())
  ) then
    update private.live_room_popup_events e set dismissed_at = coalesce(e.dismissed_at, now())
    where e.recipient_user_id = v_uid and e.session_id = target_session_id and e.dismissed_at is null;
    return;
  end if;

  return query
    select e.id, e.event_type, e.title, e.message, e.expires_at
    from private.live_room_popup_events e
    join public.live_chat_memberships m on m.id = e.membership_id and m.viewer_id = v_uid and m.left_at is null
    where e.recipient_user_id = v_uid and e.session_id = target_session_id
      and e.dismissed_at is null and e.expires_at > now()
    order by e.created_at desc limit 1;
end;
$function$;
