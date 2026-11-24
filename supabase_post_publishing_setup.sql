-- USay post media access policies.
-- Run this once in Supabase SQL Editor after schema.sql and supabase_media_setup.sql.

-- Allow signed-in users to create signed URLs for post media they are allowed to view.
-- The user's own media remains readable through the existing owner-folder policy.
drop policy if exists "usay_media_read_visible_posts" on storage.objects;
create policy "usay_media_read_visible_posts" on storage.objects
for select to authenticated
using (
  bucket_id = 'usay-media'
  and exists (
    select 1
    from public.posts p
    join public.profiles pr on pr.id = p.user_id
    where p.media_path = storage.objects.name
      and (
        p.user_id = auth.uid()
        or (p.visibility = 'public' and pr.is_private = false)
        or (
          p.visibility = 'followers'
          and exists (
            select 1
            from public.follows f
            where f.follower_id = auth.uid()
              and f.followed_id = p.user_id
          )
        )
      )
  )
);

create index if not exists posts_user_created_idx
  on public.posts (user_id, created_at desc);

create index if not exists posts_public_video_category_idx
  on public.posts (content_category, created_at desc)
  where post_type = 'video' and visibility = 'public';
