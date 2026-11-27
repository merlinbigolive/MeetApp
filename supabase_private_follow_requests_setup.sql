-- Private-account follow requests with server-enforced approval.
-- Safe to re-run. Existing follows are preserved as accepted.

alter table public.follows
  add column if not exists status text not null default 'accepted';

update public.follows set status = 'accepted' where status is null;
alter table public.follows drop constraint if exists follows_status_check;
alter table public.follows add constraint follows_status_check check (status in ('pending', 'accepted'));
create index if not exists follows_incoming_pending_idx on public.follows (followed_id, created_at desc) where status = 'pending';
create index if not exists follows_accepted_pair_idx on public.follows (follower_id, followed_id) where status = 'accepted';

-- Only accepted follows grant access to private profiles.
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
      and f.status = 'accepted'
  )
);

-- Follow creation must go through the SECURITY DEFINER RPC so status,
-- privacy, and global-block checks cannot be bypassed by direct table inserts.
drop policy if exists "follows_insert_self" on public.follows;
drop policy if exists "follows_insert_public_only" on public.follows;

create or replace function public.request_profile_follow(target_user_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  requester uuid := auth.uid();
  target_private boolean;
  result_status text;
begin
  if requester is null then raise exception 'Authentication required'; end if;
  if target_user_id = requester then raise exception 'You cannot follow yourself'; end if;

  select is_private into target_private from public.profiles where id = target_user_id;
  if not found then raise exception 'Profile not found'; end if;

  result_status := case when target_private then 'pending' else 'accepted' end;
  insert into public.follows (follower_id, followed_id, status)
  values (requester, target_user_id, result_status)
  on conflict (follower_id, followed_id)
  do update set status = excluded.status, created_at = now();

  return result_status;
end;
$$;

create or replace function public.respond_to_follow_request(target_follower_id uuid, approve boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare changed integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if approve then
    update public.follows set status = 'accepted'
    where follower_id = target_follower_id and followed_id = auth.uid() and status = 'pending';
  else
    delete from public.follows
    where follower_id = target_follower_id and followed_id = auth.uid() and status = 'pending';
  end if;
  get diagnostics changed = row_count;
  return changed > 0;
end;
$$;

create or replace function public.get_my_follow_requests()
returns table (follower_id uuid, username text, display_name text, requested_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select f.follower_id, p.username, p.display_name, f.created_at
  from public.follows f
  join public.profiles p on p.id = f.follower_id
  where f.followed_id = auth.uid() and f.status = 'pending'
  order by f.created_at desc;
$$;

revoke all on function public.request_profile_follow(uuid) from public;
revoke all on function public.respond_to_follow_request(uuid, boolean) from public;
revoke all on function public.get_my_follow_requests() from public;
grant execute on function public.request_profile_follow(uuid) to authenticated;
grant execute on function public.respond_to_follow_request(uuid, boolean) to authenticated;
grant execute on function public.get_my_follow_requests() to authenticated;

-- Existing follow-count RPC now counts accepted relationships only.
create or replace function public.get_profile_follow_counts(target_user_id uuid)
returns table (following_count bigint, follower_count bigint)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not exists (
    select 1 from public.profiles p
    where p.id = target_user_id
      and (
        p.id = auth.uid()
        or p.is_private = false
        or exists (
          select 1 from public.follows f
          where f.follower_id = auth.uid() and f.followed_id = p.id and f.status = 'accepted'
        )
      )
  ) then return; end if;

  return query
  select
    count(*) filter (where f.follower_id = target_user_id and f.status = 'accepted'),
    count(*) filter (where f.followed_id = target_user_id and f.status = 'accepted')
  from public.follows f
  where (f.follower_id = target_user_id or f.followed_id = target_user_id)
    and f.status = 'accepted';
end;
$$;
revoke all on function public.get_profile_follow_counts(uuid) from public;
grant execute on function public.get_profile_follow_counts(uuid) to authenticated;

-- Profile media and post visibility require an accepted follow.
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
          where f.follower_id = auth.uid() and f.followed_id = profile_media.user_id and f.status = 'accepted'
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
      select 1 from public.profile_media pm
      join public.profiles p on p.id = pm.user_id
      where pm.storage_path = name
        and (
          p.is_private = false
          or exists (
            select 1 from public.follows f
            where f.follower_id = auth.uid() and f.followed_id = pm.user_id and f.status = 'accepted'
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
  or (visibility = 'public' and exists (
    select 1 from public.profiles p where p.id = posts.user_id and p.is_private = false
  ))
  or (visibility = 'followers' and exists (
    select 1 from public.follows f
    where f.follower_id = auth.uid() and f.followed_id = posts.user_id and f.status = 'accepted'
  ))
);

drop policy if exists "comments_read_visible_posts" on public.post_comments;
create policy "comments_read_visible_posts" on public.post_comments
for select to authenticated
using (
  exists (
    select 1 from public.posts p
    join public.profiles pr on pr.id = p.user_id
    where p.id = post_comments.post_id
      and (
        p.user_id = auth.uid()
        or (p.visibility = 'public' and pr.is_private = false)
        or (p.visibility = 'followers' and exists (
          select 1 from public.follows f
          where f.follower_id = auth.uid() and f.followed_id = p.user_id and f.status = 'accepted'
        ))
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
    join public.profiles pr on pr.id = p.user_id
    where p.id = post_comments.post_id
      and (
        p.user_id = auth.uid()
        or (p.visibility = 'public' and pr.is_private = false)
        or (p.visibility = 'followers' and exists (
          select 1 from public.follows f
          where f.follower_id = auth.uid() and f.followed_id = p.user_id and f.status = 'accepted'
        ))
      )
  )
);

drop policy if exists "usay_media_read_visible_posts" on storage.objects;
create policy "usay_media_read_visible_posts" on storage.objects
for select to authenticated
using (
  bucket_id = 'usay-media'
  and exists (
    select 1 from public.posts p
    join public.profiles pr on pr.id = p.user_id
    where p.media_path = storage.objects.name
      and (
        p.user_id = auth.uid()
        or (p.visibility = 'public' and pr.is_private = false)
        or (p.visibility = 'followers' and exists (
          select 1 from public.follows f
          where f.follower_id = auth.uid() and f.followed_id = p.user_id and f.status = 'accepted'
        ))
      )
  )
);


-- Let signed-in users discover private accounts without exposing their private profile details.
-- Private profiles reveal only identity basics needed to send a follow request.
create or replace function public.get_discover_profiles()
returns table (
  id uuid,
  username text,
  display_name text,
  bio text,
  profession_category text,
  website_url text,
  activity_status text,
  is_private boolean,
  account_type text,
  business_name text,
  business_category text,
  business_description text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    p.username,
    p.display_name,
    case when p.is_private = false then p.bio else null end,
    case when p.is_private = false then p.profession_category else null end,
    case when p.is_private = false then p.website_url else null end,
    case when p.is_private = false then p.activity_status else null end,
    p.is_private,
    case when p.is_private = false then p.account_type else 'personal' end,
    case when p.is_private = false then p.business_name else null end,
    case when p.is_private = false then p.business_category else null end,
    case when p.is_private = false then p.business_description else null end
  from public.profiles p
  where auth.uid() is not null and p.id <> auth.uid()
  order by p.created_at desc
  limit 100;
$$;
revoke all on function public.get_discover_profiles() from public;
grant execute on function public.get_discover_profiles() to authenticated;
