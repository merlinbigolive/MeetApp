-- MEEi saved posts and post reporting.
-- Run once in Supabase SQL Editor. Safe to re-run.
-- Includes fake_information for the approved MEEi report reason list.

create table if not exists public.saved_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, post_id)
);

create index if not exists saved_posts_user_created_idx
  on public.saved_posts (user_id, created_at desc);

alter table public.saved_posts enable row level security;

drop policy if exists "saved_posts_read_self" on public.saved_posts;
create policy "saved_posts_read_self" on public.saved_posts
for select to authenticated
using (user_id = auth.uid());

drop policy if exists "saved_posts_insert_visible" on public.saved_posts;
create policy "saved_posts_insert_visible" on public.saved_posts
for insert to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.posts p
    join public.profiles owner_profile on owner_profile.id = p.user_id
    where p.id = saved_posts.post_id
      and (
        p.user_id = auth.uid()
        or (p.visibility = 'public' and owner_profile.is_private = false)
        or (p.visibility = 'followers' and exists (
          select 1 from public.follows f
          where f.follower_id = auth.uid()
            and f.followed_id = p.user_id
            and coalesce(to_jsonb(f)->>'status', 'accepted') = 'accepted'
        ))
      )
  )
);

drop policy if exists "saved_posts_delete_self" on public.saved_posts;
create policy "saved_posts_delete_self" on public.saved_posts
for delete to authenticated
using (user_id = auth.uid());

revoke all on public.saved_posts from anon;
grant select, insert, delete on public.saved_posts to authenticated;

create table if not exists public.post_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  reason text not null check (reason in ('spam','harassment','hate','violence','nudity','scam','fake_information','copyright','other')),
  status text not null default 'pending' check (status in ('pending','reviewed','actioned','dismissed')),
  created_at timestamptz not null default now(),
  unique (reporter_id, post_id)
);

-- Keep existing installations compatible when this setup is re-run.
alter table public.post_reports drop constraint if exists post_reports_reason_check;
alter table public.post_reports add constraint post_reports_reason_check
  check (reason in ('spam','harassment','hate','violence','nudity','scam','fake_information','copyright','other'));

create index if not exists post_reports_status_created_idx
  on public.post_reports (status, created_at asc);

alter table public.post_reports enable row level security;

drop policy if exists "post_reports_read_own" on public.post_reports;
create policy "post_reports_read_own" on public.post_reports
for select to authenticated
using (reporter_id = auth.uid());

drop policy if exists "post_reports_insert_visible_other_posts" on public.post_reports;
create policy "post_reports_insert_visible_other_posts" on public.post_reports
for insert to authenticated
with check (
  reporter_id = auth.uid()
  and exists (
    select 1 from public.posts p
    join public.profiles owner_profile on owner_profile.id = p.user_id
    where p.id = post_reports.post_id
      and p.user_id <> auth.uid()
      and (
        (p.visibility = 'public' and owner_profile.is_private = false)
        or (p.visibility = 'followers' and exists (
          select 1 from public.follows f
          where f.follower_id = auth.uid()
            and f.followed_id = p.user_id
            and coalesce(to_jsonb(f)->>'status', 'accepted') = 'accepted'
        ))
      )
  )
);

revoke all on public.post_reports from anon;
grant select, insert on public.post_reports to authenticated;
