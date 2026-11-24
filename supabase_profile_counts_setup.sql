-- Secure aggregate counts for a profile without exposing the follows table.
-- Run once in the Supabase SQL Editor.

create or replace function public.get_profile_follow_counts(target_user_id uuid)
returns table (following_count bigint, follower_count bigint)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = target_user_id
      and (
        p.id = auth.uid()
        or p.is_private = false
        or exists (
          select 1
          from public.follows f
          where f.follower_id = auth.uid()
            and f.followed_id = p.id
        )
      )
  ) then
    return;
  end if;

  return query
  select
    count(*) filter (where f.follower_id = target_user_id),
    count(*) filter (where f.followed_id = target_user_id)
  from public.follows f
  where f.follower_id = target_user_id
     or f.followed_id = target_user_id;
end;
$$;

revoke all on function public.get_profile_follow_counts(uuid) from public;
grant execute on function public.get_profile_follow_counts(uuid) to authenticated;
