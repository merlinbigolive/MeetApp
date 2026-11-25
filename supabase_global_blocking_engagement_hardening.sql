-- MEEi global-block engagement hardening.
-- Apply after supabase_global_account_blocking_setup.sql.
-- Safe to re-run. Keeps reports available for safety reporting.

-- Reactions must not be visible or writable across a global block.
drop policy if exists "global_block_post_reactions_select" on public.post_reactions;
create policy "global_block_post_reactions_select" on public.post_reactions
as restrictive for select to authenticated
using (
  not public.is_blocked_for_current_user(user_id)
  and exists (
    select 1 from public.posts p
    where p.id = post_reactions.post_id
      and not public.is_blocked_for_current_user(p.user_id)
  )
);

drop policy if exists "global_block_post_reactions_insert" on public.post_reactions;
create policy "global_block_post_reactions_insert" on public.post_reactions
as restrictive for insert to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.posts p
    where p.id = post_reactions.post_id
      and not public.is_blocked_for_current_user(p.user_id)
  )
);

drop policy if exists "global_block_post_reactions_update" on public.post_reactions;
create policy "global_block_post_reactions_update" on public.post_reactions
as restrictive for update to authenticated
using (
  user_id = auth.uid()
  and exists (
    select 1 from public.posts p
    where p.id = post_reactions.post_id
      and not public.is_blocked_for_current_user(p.user_id)
  )
)
with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.posts p
    where p.id = post_reactions.post_id
      and not public.is_blocked_for_current_user(p.user_id)
  )
);

-- A saved-post entry stays private to its owner and is hidden if its author
-- is globally blocked. Deleting one's own saved entry remains allowed.
drop policy if exists "global_block_saved_posts_select" on public.saved_posts;
create policy "global_block_saved_posts_select" on public.saved_posts
as restrictive for select to authenticated
using (
  user_id = auth.uid()
  and exists (
    select 1 from public.posts p
    where p.id = saved_posts.post_id
      and not public.is_blocked_for_current_user(p.user_id)
  )
);

drop policy if exists "global_block_saved_posts_insert" on public.saved_posts;
create policy "global_block_saved_posts_insert" on public.saved_posts
as restrictive for insert to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.posts p
    where p.id = saved_posts.post_id
      and not public.is_blocked_for_current_user(p.user_id)
  )
);
