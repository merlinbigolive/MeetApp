-- MEEi Live viewer profile and post engagement privacy hardening.

create or replace function public.get_live_viewer_profile(
  target_session_id uuid,
  target_viewer_id uuid
)
returns table(
  user_id uuid,
  username text,
  display_name text,
  bio text,
  avatar_path text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  actor_id uuid := auth.uid();
begin
  if actor_id is null then
    raise exception 'Authentication required.';
  end if;

  if target_viewer_id is null then
    raise exception 'Viewer not found.';
  end if;

  if public.is_blocked_for_current_user(target_viewer_id) then
    raise exception 'This account is blocked.';
  end if;

  if not exists (
    select 1
    from public.live_sessions ls
    where ls.id = target_session_id
      and ls.user_id = actor_id
      and ls.status = 'live'
      and ls.last_heartbeat_at > now() - interval '90 seconds'
  ) then
    raise exception 'Only the Live creator can manage viewers.';
  end if;

  return query
  select p.id, p.username, p.display_name, p.bio, avatar.storage_path
  from public.profiles p
  left join lateral (
    select pm.storage_path
    from public.profile_media pm
    where pm.user_id = p.id and pm.kind = 'avatar'
    order by pm.position
    limit 1
  ) avatar on true
  where p.id = target_viewer_id;
end;
$function$;

revoke all on function public.get_live_viewer_profile(uuid, uuid) from public, anon;
grant execute on function public.get_live_viewer_profile(uuid, uuid) to authenticated;

create or replace function public.get_profile_post_engagement(target_post_ids uuid[])
returns table(post_id uuid, like_count bigint, viewer_liked boolean)
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select
    p.id as post_id,
    (select count(*) from public.post_likes pl where pl.post_id = p.id) as like_count,
    exists (
      select 1 from public.post_likes mine
      where mine.post_id = p.id and mine.user_id = auth.uid()
    ) as viewer_liked
  from public.posts p
  join public.profiles owner_profile on owner_profile.id = p.user_id
  where auth.uid() is not null
    and p.id = any(coalesce(target_post_ids, array[]::uuid[]))
    and not public.is_blocked_for_current_user(p.user_id)
    and (
      p.user_id = auth.uid()
      or (
        p.visibility = 'public'
        and owner_profile.is_private = false
      )
      or (
        p.visibility = 'followers'
        and exists (
          select 1
          from public.follows f
          where f.follower_id = auth.uid()
            and f.followed_id = p.user_id
            and f.status = 'accepted'
        )
      )
    );
$function$;

revoke all on function public.get_profile_post_engagement(uuid[]) from public, anon;
grant execute on function public.get_profile_post_engagement(uuid[]) to authenticated;
