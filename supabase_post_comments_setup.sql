-- CUCKOO / MeetApp post comments setup.
-- Safe to run more than once. Comments inherit the visibility of their parent post.

create table if not exists public.post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index if not exists post_comments_post_created_idx
  on public.post_comments (post_id, created_at asc);

alter table public.post_comments enable row level security;

drop policy if exists "comments_read_visible_posts" on public.post_comments;
create policy "comments_read_visible_posts" on public.post_comments
for select to authenticated
using (
  exists (
    select 1 from public.posts p
    where p.id = post_comments.post_id
      and (
        p.user_id = auth.uid()
        or (p.visibility = 'public' and exists (
          select 1 from public.profiles pr
          where pr.id = p.user_id and pr.is_private = false
        ))
        or (p.visibility = 'followers' and exists (
          select 1 from public.follows f
          where f.follower_id = auth.uid() and f.followed_id = p.user_id
        ))
      )
  )
);

drop policy if exists "comments_insert_self" on public.post_comments;
create policy "comments_insert_self" on public.post_comments
for insert to authenticated
with check (
  user_id = auth.uid()
  and char_length(body) between 1 and 2000
  and exists (
    select 1 from public.posts p
    where p.id = post_comments.post_id
      and (
        p.user_id = auth.uid()
        or (p.visibility = 'public' and exists (
          select 1 from public.profiles pr
          where pr.id = p.user_id and pr.is_private = false
        ))
        or (p.visibility = 'followers' and exists (
          select 1 from public.follows f
          where f.follower_id = auth.uid() and f.followed_id = p.user_id
        ))
      )
  )
);

drop policy if exists "comments_delete_self" on public.post_comments;
create policy "comments_delete_self" on public.post_comments
for delete to authenticated
using (user_id = auth.uid());

grant select, insert, delete on public.post_comments to authenticated;
