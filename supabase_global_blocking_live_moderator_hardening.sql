-- MEEi global-blocking hardening for Live moderator privileges.
-- Run after supabase_global_account_blocking_setup.sql and
-- supabase_meei_live_moderators_12h_setup.sql.
-- Safe to re-run. A global account block immediately disables moderator access.

create or replace function public.get_live_moderation_role(target_session_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  host_id uuid;
  actor_id uuid := auth.uid();
begin
  if actor_id is null then return 'viewer'; end if;

  select user_id into host_id
  from public.live_sessions
  where id = target_session_id
    and status = 'live'
    and last_heartbeat_at > now() - interval '90 seconds';

  if host_id is null then return 'viewer'; end if;
  if actor_id = host_id then return 'creator'; end if;

  -- Global blocking is symmetric: a blocked moderator loses privileges too.
  if public.is_blocked_for_current_user(host_id) then return 'viewer'; end if;

  if exists (
    select 1 from public.live_moderators
    where creator_id = host_id
      and moderator_id = actor_id
      and revoked_at is null
  ) then
    return 'moderator';
  end if;

  return 'viewer';
end;
$$;

create or replace function public.set_live_moderator(
  target_session_id uuid,
  target_user_id uuid,
  make_moderator boolean
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  host_id uuid;
begin
  if auth.uid() is null then raise exception 'Sign in required.'; end if;

  select user_id into host_id
  from public.live_sessions
  where id = target_session_id
    and user_id = auth.uid()
    and status = 'live'
    and last_heartbeat_at > now() - interval '90 seconds';

  if host_id is null then
    raise exception 'Only the Live creator can assign moderators.';
  end if;
  if target_user_id is null or target_user_id = host_id then
    raise exception 'Invalid moderator account.';
  end if;
  if make_moderator and public.is_blocked_for_current_user(target_user_id) then
    raise exception 'You cannot assign a globally blocked account as a moderator.';
  end if;

  if make_moderator then
    insert into public.live_moderators(creator_id, moderator_id)
    values (host_id, target_user_id)
    on conflict (creator_id, moderator_id) where revoked_at is null do nothing;
  else
    update public.live_moderators
    set revoked_at = now()
    where creator_id = host_id
      and moderator_id = target_user_id
      and revoked_at is null;
  end if;

  return true;
end;
$$;

-- Recheck the actor's relationship to the creator at action time. This prevents
-- a formerly authorized moderator from acting after either side blocks the other.
create or replace function public.moderate_live_viewer(
  target_session_id uuid,
  target_viewer_id uuid,
  moderation_action text
)
returns boolean
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
  if actor_id is null then raise exception 'Sign in required.'; end if;
  if moderation_action not in ('mute','kickout','block','unmute','unblock','allow') then
    raise exception 'Unsupported moderation action.';
  end if;

  select user_id into host_id
  from public.live_sessions
  where id = target_session_id
    and status = 'live'
    and last_heartbeat_at > now() - interval '90 seconds';

  if host_id is null then raise exception 'This Live has ended.'; end if;

  actor_is_creator := actor_id = host_id;
  if not actor_is_creator and public.is_blocked_for_current_user(host_id) then
    raise exception 'Global account block prevents Live moderator access.';
  end if;

  actor_is_moderator := exists (
    select 1 from public.live_moderators
    where creator_id = host_id
      and moderator_id = actor_id
      and revoked_at is null
  );

  if not actor_is_creator and not actor_is_moderator then
    raise exception 'Only the creator or an authorized moderator can moderate.';
  end if;

  if not actor_is_creator and moderation_action not in ('mute','kickout') then
    raise exception 'Only the Live creator can block viewers or reverse moderation actions.';
  end if;

  if target_viewer_id is null or target_viewer_id = host_id or target_viewer_id = actor_id then
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

revoke all on function public.get_live_moderation_role(uuid) from public;
revoke all on function public.set_live_moderator(uuid, uuid, boolean) from public;
revoke all on function public.moderate_live_viewer(uuid, uuid, text) from public;
grant execute on function public.get_live_moderation_role(uuid) to authenticated;
grant execute on function public.set_live_moderator(uuid, uuid, boolean) to authenticated;
grant execute on function public.moderate_live_viewer(uuid, uuid, text) to authenticated;
