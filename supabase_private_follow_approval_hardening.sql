-- MEEi private-account follow approval hardening.
-- Safe to re-run. Uses to_jsonb(f)->>'status' so it works both with the
-- original follows table (no status column) and the follow-request extension.
-- A pending follow request must never grant access to private profile/media/posts.

-- Remove legacy permissive policies that would OR-bypass the stricter rules below.
-- These were left behind by earlier setup scripts and defeat private-account approval.
drop policy if exists "profiles_read_authenticated" on public.profiles;
drop policy if exists "follows_read_authenticated" on public.follows;
drop policy if exists "follows_insert_own" on public.follows;
drop policy if exists "posts_read_allowed" on public.posts;
drop policy if exists "comments_read_allowed" on public.post_comments;
drop policy if exists "comments_insert_own" on public.post_comments;


drop policy if exists "profiles_read_visible" on public.profiles;
create policy "profiles_read_visible" on public.profiles
for select to authenticated
using (
  id = auth.uid()
  or is_private = false
  or exists (
    select 1 from public.follows f
    where f.follower_id = auth.uid()
      and f.followed_id = profiles.id
      and coalesce(to_jsonb(f)->>'status', 'accepted') = 'accepted'
  )
);

drop policy if exists "profile_media_read_visible" on public.profile_media;
create policy "profile_media_read_visible" on public.profile_media
for select to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1 from public.profiles p
    where p.id = profile_media.user_id
      and (
        p.is_private = false
        or exists (
          select 1 from public.follows f
          where f.follower_id = auth.uid()
            and f.followed_id = profile_media.user_id
            and coalesce(to_jsonb(f)->>'status', 'accepted') = 'accepted'
        )
      )
  )
);

drop policy if exists "usay_media_read_visible" on storage.objects;
create policy "usay_media_read_visible" on storage.objects
for select to authenticated
using (
  bucket_id = 'usay-media'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or exists (
      select 1
      from public.profile_media pm
      join public.profiles p on p.id = pm.user_id
      where pm.storage_path = name
        and (
          p.is_private = false
          or exists (
            select 1 from public.follows f
            where f.follower_id = auth.uid()
              and f.followed_id = pm.user_id
              and coalesce(to_jsonb(f)->>'status', 'accepted') = 'accepted'
          )
        )
    )
  )
);

drop policy if exists "posts_read_visible" on public.posts;
create policy "posts_read_visible" on public.posts
for select to authenticated
using (
  user_id = auth.uid()
  or (
    visibility = 'public'
    and exists (
      select 1 from public.profiles p
      where p.id = posts.user_id and p.is_private = false
    )
  )
  or (
    visibility = 'followers'
    and exists (
      select 1 from public.follows f
      where f.follower_id = auth.uid()
        and f.followed_id = posts.user_id
        and coalesce(to_jsonb(f)->>'status', 'accepted') = 'accepted'
    )
  )
);

drop policy if exists "comments_read_visible_posts" on public.post_comments;
create policy "comments_read_visible_posts" on public.post_comments
for select to authenticated
using (
  exists (
    select 1 from public.posts p
    where p.id = post_comments.post_id
      and (
        p.user_id = auth.uid()
        or (
          p.visibility = 'public'
          and exists (
            select 1 from public.profiles pr
            where pr.id = p.user_id and pr.is_private = false
          )
        )
        or (
          p.visibility = 'followers'
          and exists (
            select 1 from public.follows f
            where f.follower_id = auth.uid()
              and f.followed_id = p.user_id
              and coalesce(to_jsonb(f)->>'status', 'accepted') = 'accepted'
          )
        )
      )
  )
);

drop policy if exists "comments_insert_self" on public.post_comments;
create policy "comments_insert_self" on public.post_comments
for insert to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.posts p
    where p.id = post_comments.post_id
      and (
        p.user_id = auth.uid()
        or (
          p.visibility = 'public'
          and exists (
            select 1 from public.profiles pr
            where pr.id = p.user_id and pr.is_private = false
          )
        )
        or (
          p.visibility = 'followers'
          and exists (
            select 1 from public.follows f
            where f.follower_id = auth.uid()
              and f.followed_id = p.user_id
              and coalesce(to_jsonb(f)->>'status', 'accepted') = 'accepted'
          )
        )
      )
  )
);

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
            select 1 from public.follows f
            where f.follower_id = auth.uid()
              and f.followed_id = p.user_id
              and coalesce(to_jsonb(f)->>'status', 'accepted') = 'accepted'
          )
        )
      )
  )
);


-- Defense-in-depth: restrictive policies ensure no other permissive policy can
-- widen private-account visibility through PostgreSQL's permissive-policy OR.
drop policy if exists "profiles_enforce_private_visibility" on public.profiles;
create policy "profiles_enforce_private_visibility" on public.profiles
as restrictive for select to authenticated
using (
  id = auth.uid()
  or is_private = false
  or exists (
    select 1 from public.follows f
    where f.follower_id = auth.uid()
      and f.followed_id = profiles.id
      and coalesce(to_jsonb(f)->>'status', 'accepted') = 'accepted'
  )
);

drop policy if exists "profile_media_enforce_private_visibility" on public.profile_media;
create policy "profile_media_enforce_private_visibility" on public.profile_media
as restrictive for select to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1 from public.profiles p
    where p.id = profile_media.user_id
      and (
        p.is_private = false
        or exists (
          select 1 from public.follows f
          where f.follower_id = auth.uid()
            and f.followed_id = profile_media.user_id
            and coalesce(to_jsonb(f)->>'status', 'accepted') = 'accepted'
        )
      )
  )
);

drop policy if exists "posts_enforce_private_visibility" on public.posts;
create policy "posts_enforce_private_visibility" on public.posts
as restrictive for select to authenticated
using (
  user_id = auth.uid()
  or (
    visibility = 'public'
    and exists (select 1 from public.profiles p where p.id = posts.user_id and p.is_private = false)
  )
  or (
    visibility = 'followers'
    and exists (
      select 1 from public.follows f
      where f.follower_id = auth.uid()
        and f.followed_id = posts.user_id
        and coalesce(to_jsonb(f)->>'status', 'accepted') = 'accepted'
    )
  )
);

drop policy if exists "comments_enforce_private_visibility" on public.post_comments;
create policy "comments_enforce_private_visibility" on public.post_comments
as restrictive for select to authenticated
using (
  exists (
    select 1 from public.posts p
    where p.id = post_comments.post_id
      and (
        p.user_id = auth.uid()
        or (
          p.visibility = 'public'
          and exists (select 1 from public.profiles pr where pr.id = p.user_id and pr.is_private = false)
        )
        or (
          p.visibility = 'followers'
          and exists (
            select 1 from public.follows f
            where f.follower_id = auth.uid()
              and f.followed_id = p.user_id
              and coalesce(to_jsonb(f)->>'status', 'accepted') = 'accepted'
          )
        )
      )
  )
);

drop policy if exists "comments_insert_enforce_private_visibility" on public.post_comments;
create policy "comments_insert_enforce_private_visibility" on public.post_comments
as restrictive for insert to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.posts p
    where p.id = post_comments.post_id
      and (
        p.user_id = auth.uid()
        or (
          p.visibility = 'public'
          and exists (select 1 from public.profiles pr where pr.id = p.user_id and pr.is_private = false)
        )
        or (
          p.visibility = 'followers'
          and exists (
            select 1 from public.follows f
            where f.follower_id = auth.uid()
              and f.followed_id = p.user_id
              and coalesce(to_jsonb(f)->>'status', 'accepted') = 'accepted'
          )
        )
      )
  )
);

drop policy if exists "follows_insert_enforce_public_only" on public.follows;
create policy "follows_insert_enforce_public_only" on public.follows
as restrictive for insert to authenticated
with check (
  follower_id = auth.uid()
  and followed_id <> auth.uid()
  and coalesce(to_jsonb(follows)->>'status', 'accepted') = 'accepted'
  and exists (
    select 1 from public.profiles p
    where p.id = follows.followed_id and p.is_private = false
  )
);

drop policy if exists "usay_media_enforce_private_visibility" on storage.objects;
create policy "usay_media_enforce_private_visibility" on storage.objects
as restrictive for select to authenticated
using (
  bucket_id <> 'usay-media'
  or (storage.foldername(name))[1] = auth.uid()::text
  or exists (
    select 1 from public.profile_media pm
    join public.profiles p on p.id = pm.user_id
    where pm.storage_path = storage.objects.name
      and (
        p.is_private = false
        or exists (
          select 1 from public.follows f
          where f.follower_id = auth.uid()
            and f.followed_id = pm.user_id
            and coalesce(to_jsonb(f)->>'status', 'accepted') = 'accepted'
        )
      )
  )
  or exists (
    select 1 from public.posts p
    join public.profiles pr on pr.id = p.user_id
    where p.media_path = storage.objects.name
      and (
        p.user_id = auth.uid()
        or (p.visibility = 'public' and pr.is_private = false)
        or (
          p.visibility = 'followers'
          and exists (
            select 1 from public.follows f
            where f.follower_id = auth.uid()
              and f.followed_id = p.user_id
              and coalesce(to_jsonb(f)->>'status', 'accepted') = 'accepted'
          )
        )
      )
  )
);
