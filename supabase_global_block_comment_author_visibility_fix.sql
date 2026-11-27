-- MEEi global-block comment visibility fix.
-- Apply after supabase_global_account_blocking_setup.sql.
-- Keep this separate so databases that already installed the original block
-- setup can receive the corrected restrictive policy without replaying setup.

drop policy if exists "global_block_comments_select" on public.post_comments;

create policy "global_block_comments_select" on public.post_comments
as restrictive
for select
to authenticated
using (
  user_id = auth.uid()
  or (
    not public.is_blocked_for_current_user(user_id)
    and not exists (
      select 1
      from public.posts p
      where p.id = post_comments.post_id
        and public.is_blocked_for_current_user(p.user_id)
    )
  )
);
