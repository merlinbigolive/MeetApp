-- MEEi Live-room popup delivery.
-- Popups are room-only, recipient-specific, short-lived and server-created.
-- No push, inbox, system or background notification is created by this schema.

create schema if not exists private;

create table if not exists private.live_room_popup_events (
  id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null references public.live_sessions(id) on delete cascade,
  event_type text not null check (event_type in ('global_live_boost','live_promotion','room_invite','other')),
  title text not null check (char_length(trim(title)) between 1 and 80),
  message text not null check (char_length(trim(message)) between 1 and 220),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  dismissed_at timestamptz,
  constraint live_room_popup_expiry_check check (expires_at > created_at)
);

create index if not exists live_room_popup_recipient_session_idx
  on private.live_room_popup_events (recipient_user_id, session_id, expires_at desc)
  where dismissed_at is null;

alter table private.live_room_popup_events enable row level security;
revoke all on private.live_room_popup_events from anon, authenticated;
grant usage on schema private to service_role;
grant all on private.live_room_popup_events to service_role;

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
as $$
declare
  v_id uuid;
  v_role text;
begin
  v_role := coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '');
  if v_role <> 'service_role' then
    raise exception 'Only trusted server workflows can create Live room popups' using errcode = '42501';
  end if;
  if p_recipient_user_id is null or p_session_id is null
     or p_event_type not in ('global_live_boost','live_promotion','room_invite','other')
     or char_length(trim(coalesce(p_title,''))) not between 1 and 80
     or char_length(trim(coalesce(p_message,''))) not between 1 and 220
     or p_ttl_seconds not between 1 and 15 then
    raise exception 'Invalid Live room popup payload' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.live_sessions ls
    join public.live_chat_memberships m on m.session_id = ls.id
    where ls.id = p_session_id and ls.status = 'live'
      and ls.user_id <> p_recipient_user_id
      and m.viewer_id = p_recipient_user_id and m.left_at is null
  ) then
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
  ) then
    raise exception 'Creators, moderators, and PK participants are not eligible for Live room popups' using errcode = '42501';
  end if;

  insert into private.live_room_popup_events (
    recipient_user_id, session_id, event_type, title, message, expires_at
  ) values (
    p_recipient_user_id, p_session_id, p_event_type, trim(p_title), trim(p_message),
    now() + make_interval(secs => p_ttl_seconds)
  ) returning id into v_id;
  return v_id;
end;
$$;

revoke all on function private.enqueue_live_room_popup_event(uuid,uuid,text,text,text,integer) from public, anon, authenticated;
grant execute on function private.enqueue_live_room_popup_event(uuid,uuid,text,text,text,integer) to service_role;

create or replace function public.get_my_live_room_popup_event(target_session_id uuid)
returns table (event_id uuid, event_type text, title text, message text, expires_at timestamptz)
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then return; end if;

  if exists (
    select 1 from public.live_pk_battles b
    where b.status = 'active'
      and (b.creator_a_id = v_uid or b.creator_b_id = v_uid)
  ) then
    update private.live_room_popup_events e
      set dismissed_at = coalesce(e.dismissed_at, now())
      where e.recipient_user_id = v_uid and e.dismissed_at is null;
    return;
  end if;

  if not exists (
    select 1 from public.live_sessions ls
    join public.live_chat_memberships m on m.session_id = ls.id
    where ls.id = target_session_id and ls.status = 'live'
      and ls.user_id <> v_uid
      and m.viewer_id = v_uid and m.left_at is null
  ) or exists (
    select 1 from public.live_moderators lm
    join public.live_sessions ls on ls.user_id = lm.creator_id
    where ls.id = target_session_id and lm.moderator_id = v_uid
      and lm.revoked_at is null
  ) then
    update private.live_room_popup_events e
      set dismissed_at = coalesce(e.dismissed_at, now())
      where e.recipient_user_id = v_uid
        and e.session_id = target_session_id and e.dismissed_at is null;
    return;
  end if;

  return query
    select e.id, e.event_type, e.title, e.message, e.expires_at
    from private.live_room_popup_events e
    where e.recipient_user_id = v_uid and e.session_id = target_session_id
      and e.dismissed_at is null and e.expires_at > now()
    order by e.created_at desc limit 1;
end;
$$;

create or replace function public.dismiss_my_live_room_popup_event(p_event_id uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, private
as $$
declare
  v_uid uuid := auth.uid();
  v_updated integer;
begin
  if v_uid is null then return false; end if;
  update private.live_room_popup_events
    set dismissed_at = coalesce(dismissed_at, now())
    where id = p_event_id and recipient_user_id = v_uid and dismissed_at is null;
  get diagnostics v_updated = row_count;
  return v_updated > 0;
end;
$$;

revoke all on function public.get_my_live_room_popup_event(uuid) from public, anon;
revoke all on function public.dismiss_my_live_room_popup_event(uuid) from public, anon;
grant execute on function public.get_my_live_room_popup_event(uuid) to authenticated;
grant execute on function public.dismiss_my_live_room_popup_event(uuid) to authenticated;
