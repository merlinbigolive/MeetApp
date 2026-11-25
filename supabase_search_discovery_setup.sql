-- Search discovery categories, engagement signals, and secure public video search.
-- Safe to run more than once in Supabase SQL Editor.

alter table public.posts
  add column if not exists content_category text not null default 'videos';

alter table public.posts
  drop constraint if exists posts_content_category_check;
alter table public.posts
  add constraint posts_content_category_check
  check (content_category in ('videos', 'reels', 'funny', 'vlogs', 'cinema'));

create index if not exists posts_public_search_category_created_idx
  on public.posts (content_category, created_at desc)
  where visibility = 'public' and post_type = 'video';

create table if not exists public.post_likes (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
alter table public.post_likes enable row level security;

drop policy if exists "post_likes_read_self" on public.post_likes;
create policy "post_likes_read_self" on public.post_likes
for select to authenticated using (user_id = auth.uid());

drop policy if exists "post_likes_insert_self" on public.post_likes;
create policy "post_likes_insert_self" on public.post_likes
for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "post_likes_delete_self" on public.post_likes;
create policy "post_likes_delete_self" on public.post_likes
for delete to authenticated using (user_id = auth.uid());

create table if not exists public.post_views (
  post_id uuid not null references public.posts(id) on delete cascade,
  viewer_id uuid not null references public.profiles(id) on delete cascade,
  viewed_at timestamptz not null default now(),
  primary key (post_id, viewer_id)
);
alter table public.post_views enable row level security;

drop policy if exists "post_views_read_self" on public.post_views;
create policy "post_views_read_self" on public.post_views
for select to authenticated using (viewer_id = auth.uid());

drop policy if exists "post_views_insert_self" on public.post_views;
create policy "post_views_insert_self" on public.post_views
for insert to authenticated with check (viewer_id = auth.uid());

create or replace function public.get_public_search_posts(
  category_filter text default 'videos',
  search_text text default null
)
returns table (
  id uuid,
  user_id uuid,
  caption text,
  media_path text,
  content_category text,
  created_at timestamptz,
  like_count bigint,
  view_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    p.user_id,
    p.caption,
    p.media_path,
    p.content_category,
    p.created_at,
    (select count(*) from public.post_likes pl where pl.post_id = p.id) as like_count,
    (select count(*) from public.post_views pv where pv.post_id = p.id) as view_count
  from public.posts p
  join public.profiles pr on pr.id = p.user_id
  where auth.uid() is not null
    and p.post_type = 'video'
    and p.visibility = 'public'
    and pr.is_private = false
    and p.media_path is not null
    and (
      category_filter in ('trending', 'all')
      or p.content_category = category_filter
    )
    and (
      nullif(trim(search_text), '') is null
      or coalesce(p.caption, '') ilike '%' || trim(search_text) || '%'
      or coalesce(p.content_category, '') ilike '%' || trim(search_text) || '%'
    )
  order by
    case when category_filter = 'trending' then
      (select count(*) from public.post_likes pl where pl.post_id = p.id)
      + (select count(*) from public.post_views pv where pv.post_id = p.id)
    else 0 end desc,
    p.created_at desc
  limit 50;
$$;

revoke all on function public.get_public_search_posts(text, text) from public;
grant execute on function public.get_public_search_posts(text, text) to authenticated;

create or replace function public.record_public_post_view(target_post_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  insert into public.post_views (post_id, viewer_id)
  select p.id, auth.uid()
  from public.posts p
  join public.profiles pr on pr.id = p.user_id
  where p.id = target_post_id
    and p.post_type = 'video'
    and p.visibility = 'public'
    and pr.is_private = false
  on conflict (post_id, viewer_id) do update
    set viewed_at = now();
end;
$$;

revoke all on function public.record_public_post_view(uuid) from public;
grant execute on function public.record_public_post_view(uuid) to authenticated;

-- Allow signed-in users to read storage objects referenced by public video posts.
drop policy if exists "usay_media_read_public_posts" on storage.objects;
create policy "usay_media_read_public_posts" on storage.objects
for select to authenticated
using (
  bucket_id = 'usay-media'
  and exists (
    select 1
    from public.posts p
    join public.profiles pr on pr.id = p.user_id
    where p.media_path = storage.objects.name
      and p.post_type = 'video'
      and p.visibility = 'public'
      and pr.is_private = false
  )
);
