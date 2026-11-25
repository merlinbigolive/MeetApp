-- MEEi Live moderation permission hardening.
-- Run after supabase_meei_live_moderators_12h_setup.sql.
-- Moderators may issue mute/kickout only. Creator alone controls persistent
-- Live-room blocks and reversals, so a moderator cannot permanently exclude
-- someone from the creator's future Lives or undo the creator's decisions.
-- This is Live-room moderation, not the app-wide account blocking system.

create or replace function public.moderate_live_viewer(
  target_session_id uuid,
  target_viewer_id uuid,
  moderation_action text
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  host_id uuid;
  actor_id uuid := auth.uid();
  actor_is_creator boolean;
  actor_is_moderator boolean;
begin
  if actor_id is null then
    raise exception 'Sign in required.';
  end if;

  if moderation_action not in ('mute','kickout','block','unmute','unblock','allow') then
    raise exception 'Unsupported moderation action.';
  end if;

  select ls.user_id into host_id
  from public.live_sessions ls
  where ls.id = target_session_id
    and ls.status = 'live'
    and ls.last_heartbeat_at > now() - interval '90 seconds';

  if host_id is null then
    raise exception 'This Live has ended.';
  end if;

  actor_is_creator := actor_id = host_id;
  actor_is_moderator := exists (
    select 1
    from public.live_moderators lm
    where lm.creator_id = host_id
      and lm.moderator_id = actor_id
      and lm.revoked_at is null
  );

  if not actor_is_creator and not actor_is_moderator then
    raise exception 'Only the creator or an authorized moderator can moderate.';
  end if;

  -- A moderator can only apply temporary room-level restrictions.
  -- Persistent block/unblock and reversals are creator-only.
  if not actor_is_creator and moderation_action not in ('mute','kickout') then
    raise exception 'Only the Live creator can block viewers or reverse moderation actions.';
  end if;

  if target_viewer_id = host_id or target_viewer_id = actor_id then
    raise exception 'You cannot moderate this account.';
  end if;

  if moderation_action in ('unmute','unblock','allow') then
    update public.live_moderation_actions
    set revoked_at = now()
    where creator_id = host_id
      and viewer_id = target_viewer_id
      and revoked_at is null
      and (
        (moderation_action = 'unblock' and action = 'block')
        or (moderation_action = 'unmute' and action = 'mute' and session_id = target_session_id)
        or (moderation_action = 'allow' and action = 'kickout' and session_id = target_session_id)
      );
    return true;
  end if;

  insert into public.live_moderation_actions(
    creator_id, viewer_id, session_id, action, expires_at
  )
  values (
    host_id,
    target_viewer_id,
    case when moderation_action = 'block' then null else target_session_id end,
    moderation_action,
    case when moderation_action in ('mute','kickout')
      then now() + interval '12 hours'
      else null
    end
  );

  return true;
end;
$$;

revoke all on function public.moderate_live_viewer(uuid, uuid, text) from public;
grant execute on function public.moderate_live_viewer(uuid, uuid, text) to authenticated;

comment on function public.moderate_live_viewer(uuid, uuid, text) is
  'Live moderation: authorized moderators can mute/kickout for 12 hours; only the creator can create/revoke persistent Live-room blocks or reverse actions.';
