-- Per-post engagement data for profile posts.
-- Run once in Supabase SQL Editor after supabase_search_discovery_setup.sql.

create or replace function public.get_profile_post_engagement(target_post_ids uuid[])
returns table (
  post_id uuid,
  like_count bigint,
  viewer_liked boolean
)
language sql
stable
security definer
set search_path = public
as $$
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
    and (
      p.user_id = auth.uid()
      or (
        p.visibility = 'public'
        and owner_profile.is_private = false
      )
      or (
        p.visibility = 'followers'
        and exists (
          select 1 from public.follows f
          where f.follower_id = auth.uid()
            and f.followed_id = p.user_id
            and f.status = 'accepted'
        )
      )
    );
$$;

revoke all on function public.get_profile_post_engagement(uuid[]) from public;
grant execute on function public.get_profile_post_engagement(uuid[]) to authenticated;
