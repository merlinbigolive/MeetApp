-- MEEi global-block engagement and relationship hardening.
-- Safe to re-run. Restrictive policies are combined with existing visibility/ownership policies.

drop policy if exists global_block_follows_select on public.follows;
create policy global_block_follows_select on public.follows
as restrictive for select to authenticated
using (
  not public.is_blocked_for_current_user(follower_id)
  and not public.is_blocked_for_current_user(followed_id)
);

drop policy if exists global_block_post_likes_select on public.post_likes;
create policy global_block_post_likes_select on public.post_likes
as restrictive for select to authenticated
using (
  not public.is_blocked_for_current_user(user_id)
  and exists (
    select 1 from public.posts p
    where p.id = post_likes.post_id
      and (p.user_id = auth.uid() or not public.is_blocked_for_current_user(p.user_id))
  )
);

drop policy if exists global_block_post_likes_insert on public.post_likes;
create policy global_block_post_likes_insert on public.post_likes
as restrictive for insert to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.posts p
    where p.id = post_likes.post_id
      and not public.is_blocked_for_current_user(p.user_id)
  )
);

drop policy if exists global_block_post_views_select on public.post_views;
create policy global_block_post_views_select on public.post_views
as restrictive for select to authenticated
using (
  not public.is_blocked_for_current_user(viewer_id)
  and exists (
    select 1 from public.posts p
    where p.id = post_views.post_id
      and (p.user_id = auth.uid() or not public.is_blocked_for_current_user(p.user_id))
  )
);

drop policy if exists global_block_post_views_insert on public.post_views;
create policy global_block_post_views_insert on public.post_views
as restrictive for insert to authenticated
with check (
  viewer_id = auth.uid()
  and exists (
    select 1 from public.posts p
    where p.id = post_views.post_id
      and not public.is_blocked_for_current_user(p.user_id)
  )
);

drop policy if exists global_block_comments_select_v2 on public.post_comments;
create policy global_block_comments_select_v2 on public.post_comments
as restrictive for select to authenticated
using (
  user_id = auth.uid()
  or (
    not public.is_blocked_for_current_user(user_id)
    and exists (
      select 1 from public.posts p
      where p.id = post_comments.post_id
        and (p.user_id = auth.uid() or not public.is_blocked_for_current_user(p.user_id))
    )
  )
);

drop policy if exists global_block_comments_update on public.post_comments;
create policy global_block_comments_update on public.post_comments
as restrictive for update to authenticated
using (
  user_id = auth.uid()
  and exists (
    select 1 from public.posts p
    where p.id = post_comments.post_id
      and not public.is_blocked_for_current_user(p.user_id)
  )
)
with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.posts p
    where p.id = post_comments.post_id
      and not public.is_blocked_for_current_user(p.user_id)
  )
);
