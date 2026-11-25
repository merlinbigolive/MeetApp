-- MEEi Live authorized moderators + 12-hour moderation durations.
-- Run in Supabase SQL Editor after the existing Live chat moderation setup.

create table if not exists public.live_moderators (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.profiles(id) on delete cascade,
  moderator_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  check (creator_id <> moderator_id)
);
create unique index if not exists live_moderators_one_active_idx
  on public.live_moderators(creator_id, moderator_id) where revoked_at is null;
alter table public.live_moderators enable row level security;
revoke all on public.live_moderators from anon, authenticated;
grant all on public.live_moderators to service_role;

create or replace function public.get_live_moderation_role(target_session_id uuid)
returns text language plpgsql stable security definer set search_path = public as $$
declare host_id uuid;
begin
  select user_id into host_id from public.live_sessions
  where id = target_session_id and status = 'live'
    and last_heartbeat_at > now() - interval '90 seconds';
  if host_id is null or auth.uid() is null then return 'viewer'; end if;
  if auth.uid() = host_id then return 'creator'; end if;
  if exists (select 1 from public.live_moderators
    where creator_id = host_id and moderator_id = auth.uid() and revoked_at is null)
    then return 'moderator'; end if;
  return 'viewer';
end; $$;

create or replace function public.set_live_moderator(
  target_session_id uuid, target_user_id uuid, make_moderator boolean
) returns boolean language plpgsql security definer set search_path = public as $$
declare host_id uuid;
begin
  if auth.uid() is null then raise exception 'Sign in required.'; end if;
  select user_id into host_id from public.live_sessions
  where id = target_session_id and user_id = auth.uid() and status = 'live'
    and last_heartbeat_at > now() - interval '90 seconds';
  if host_id is null then raise exception 'Only the Live creator can assign moderators.'; end if;
  if target_user_id = host_id then raise exception 'Creator cannot be their own moderator.'; end if;
  if make_moderator then
    insert into public.live_moderators(creator_id, moderator_id)
    values(host_id, target_user_id)
    on conflict (creator_id, moderator_id) where revoked_at is null do nothing;
  else
    update public.live_moderators set revoked_at = now()
    where creator_id = host_id and moderator_id = target_user_id and revoked_at is null;
  end if;
  return true;
end; $$;

create or replace function public.moderate_live_viewer(
  target_session_id uuid, target_viewer_id uuid, moderation_action text
) returns boolean language plpgsql security definer set search_path = public as $$
declare host_id uuid; actor_id uuid := auth.uid(); actor_is_creator boolean;
begin
  if actor_id is null then raise exception 'Sign in required.'; end if;
  if moderation_action not in ('mute','kickout','block','unmute','unblock','allow') then
    raise exception 'Unsupported moderation action.';
  end if;
  select user_id into host_id from public.live_sessions
  where id = target_session_id and status = 'live'
    and last_heartbeat_at > now() - interval '90 seconds';
  if host_id is null then raise exception 'This Live has ended.'; end if;
  actor_is_creator := actor_id = host_id;
  if not actor_is_creator and not exists (
    select 1 from public.live_moderators
    where creator_id = host_id and moderator_id = actor_id and revoked_at is null
  ) then raise exception 'Only the creator or an authorized moderator can moderate.'; end if;
  if target_viewer_id = host_id or target_viewer_id = actor_id then
    raise exception 'You cannot moderate this account.';
  end if;
  if moderation_action in ('unmute','unblock','allow') then
    update public.live_moderation_actions set revoked_at = now()
    where creator_id = host_id and viewer_id = target_viewer_id and revoked_at is null
      and ((moderation_action = 'unblock' and action = 'block')
        or (moderation_action = 'unmute' and action = 'mute' and session_id = target_session_id)
        or (moderation_action = 'allow' and action = 'kickout' and session_id = target_session_id));
    return true;
  end if;
  insert into public.live_moderation_actions(creator_id, viewer_id, session_id, action, expires_at)
  values (
    host_id, target_viewer_id,
    case when moderation_action = 'block' then null else target_session_id end,
    moderation_action,
    case when moderation_action in ('mute','kickout') then now() + interval '12 hours' else null end
  );
  return true;
end; $$;

create or replace function public.get_live_viewer_profile(target_session_id uuid, target_viewer_id uuid)
returns table(user_id uuid, username text, display_name text, bio text, avatar_path text)
language plpgsql stable security definer set search_path = public as $$
begin
  if public.get_live_moderation_role(target_session_id) not in ('creator','moderator') then
    raise exception 'Only the Live creator or an authorized moderator can view moderation profiles.';
  end if;
  return query
  select p.id, p.username, p.display_name, p.bio, avatar.storage_path
  from public.profiles p
  left join lateral (
    select pm.storage_path from public.profile_media pm
    where pm.user_id = p.id and pm.kind = 'avatar' order by pm.position limit 1
  ) avatar on true
  where p.id = target_viewer_id;
end; $$;

revoke all on function public.get_live_moderation_role(uuid) from public;
revoke all on function public.set_live_moderator(uuid,uuid,boolean) from public;
grant execute on function public.get_live_moderation_role(uuid) to authenticated;
grant execute on function public.set_live_moderator(uuid,uuid,boolean) to authenticated;
grant execute on function public.moderate_live_viewer(uuid,uuid,text) to authenticated;
grant execute on function public.get_live_viewer_profile(uuid,uuid) to authenticated;

comment on table public.live_moderators is 'Creator-assigned moderators for MEEi Live sessions; revoked_at disables access.';
comment on table public.live_moderation_actions is 'Mute and kickout expire after 12 hours; block persists until revoked.';
