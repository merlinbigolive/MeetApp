-- Secure aggregate likes count for profile owners and public profiles.
-- Run once in the Supabase SQL Editor.

create or replace function public.get_profile_likes_count(target_user_id uuid)
returns bigint
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = target_user_id
      and (
        p.id = auth.uid()
        or p.is_private = false
        or exists (
          select 1 from public.follows f
          where f.follower_id = auth.uid() and f.followed_id = p.id
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
$$;

revoke all on function public.get_profile_likes_count(uuid) from public;
grant execute on function public.get_profile_likes_count(uuid) to authenticated;
