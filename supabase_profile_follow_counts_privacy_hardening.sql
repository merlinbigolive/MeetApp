-- MEEi profile follow counts privacy hardening.
-- Hides counts across symmetric blocks and requires accepted follow status for private profiles.

create or replace function public.get_profile_follow_counts(target_user_id uuid)
returns table(following_count bigint, follower_count bigint)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  viewer_id uuid := auth.uid();
begin
  if viewer_id is null then
    raise exception 'Authentication required.';
  end if;

  if target_user_id is null
     or public.is_blocked_for_current_user(target_user_id) then
    return;
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = target_user_id
      and (
        p.id = viewer_id
        or p.is_private = false
        or exists (
          select 1
          from public.follows f
          where f.follower_id = viewer_id
            and f.followed_id = p.id
            and f.status = 'accepted'
        )
      )
  ) then
    return;
  end if;

  return query
  select
    count(*) filter (where f.follower_id = target_user_id and f.status = 'accepted'),
    count(*) filter (where f.followed_id = target_user_id and f.status = 'accepted')
  from public.follows f
  where (f.follower_id = target_user_id or f.followed_id = target_user_id)
    and f.status = 'accepted';
end;
$function$;

revoke all on function public.get_profile_follow_counts(uuid) from public, anon;
grant execute on function public.get_profile_follow_counts(uuid) to authenticated;
