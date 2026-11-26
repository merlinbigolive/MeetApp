-- MEEi private-profile engagement count privacy hardening.
-- Only the profile owner, public-profile viewers, or accepted followers may see counts.
-- Symmetric global blocks suppress the count for both accounts.

create or replace function public.get_profile_likes_count(target_user_id uuid)
returns bigint
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

  if target_user_id is null then
    return 0;
  end if;

  if public.is_blocked_for_current_user(target_user_id) then
    return 0;
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
    return 0;
  end if;

  return (
    select count(*)
    from public.post_likes pl
    join public.posts p on p.id = pl.post_id
    where p.user_id = target_user_id
  );
end;
$function$;

revoke all on function public.get_profile_likes_count(uuid) from public, anon;
grant execute on function public.get_profile_likes_count(uuid) to authenticated;
