-- Initial Meetapp schema. Run only after creating a Supabase project.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  display_name text not null default 'Meetapp User',
  display_font smallint not null default 1 check (display_font between 1 and 10),
  bio text,
  website_url text,
  activity_status text check (activity_status in ('available','busy','work','drive','gym','school','college')),
  profession_category text,
  is_private boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  username_changed_at timestamptz
);

create table if not exists public.follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  followed_id uuid not null references public.profiles(id) on delete cascade,
  notify_posts boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (follower_id, followed_id),
  check (follower_id <> followed_id)
);

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  post_type text not null check (post_type in ('text','photo','video')),
  caption text,
  media_path text,
  visibility text not null default 'public' check (visibility in ('public','followers','private')),
  created_at timestamptz not null default now()
);

create table if not exists public.post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);

create table if not exists public.verification_plans (
  id text primary key,
  name text not null,
  price_inr integer not null check (price_inr > 0),
  validity_days integer not null default 30
);
insert into public.verification_plans(id,name,price_inr) values
 ('basic','Basic',499),('professional','Professional',999),('business','Business',1499)
on conflict (id) do update set name=excluded.name, price_inr=excluded.price_inr;

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  product_type text not null check (product_type in ('verification','caller_tune','profile_theme','post_promotion')),
  plan_id text,
  starts_at timestamptz,
  ends_at timestamptz,
  status text not null default 'pending' check (status in ('pending','active','expired','cancelled','rejected')),
  created_at timestamptz not null default now()
);

-- Enable RLS now; policies are added in the authentication/security phase.
alter table public.profiles enable row level security;
alter table public.follows enable row level security;
alter table public.posts enable row level security;
alter table public.post_comments enable row level security;
alter table public.verification_plans enable row level security;
alter table public.subscriptions enable row level security;


-- USay security policies (safe to re-run).
-- Profiles: signed-in users can discover public profiles; private profiles are
-- visible only to their owner and approved followers.
drop policy if exists "profiles_read_visible" on public.profiles;
create policy "profiles_read_visible" on public.profiles
for select to authenticated
using (
  id = auth.uid()
  or is_private = false
  or exists (
    select 1 from public.follows f
    where f.follower_id = auth.uid() and f.followed_id = profiles.id
  )
);

drop policy if exists "profiles_insert_self" on public.profiles;
create policy "profiles_insert_self" on public.profiles
for insert to authenticated
with check (id = auth.uid());

drop policy if exists "profiles_update_self" on public.profiles;
create policy "profiles_update_self" on public.profiles
for update to authenticated
using (id = auth.uid())
with check (id = auth.uid());

-- Follow relationships can only be created/removed by the follower.
drop policy if exists "follows_read_related" on public.follows;
create policy "follows_read_related" on public.follows
for select to authenticated
using (follower_id = auth.uid() or followed_id = auth.uid());

drop policy if exists "follows_insert_self" on public.follows;
create policy "follows_insert_self" on public.follows
for insert to authenticated
with check (follower_id = auth.uid() and followed_id <> auth.uid());

drop policy if exists "follows_delete_self" on public.follows;
create policy "follows_delete_self" on public.follows
for delete to authenticated
using (follower_id = auth.uid());

-- Posts respect public/follower/private visibility.
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
    where f.follower_id = auth.uid() and f.followed_id = posts.user_id
  ))
);

drop policy if exists "posts_insert_self" on public.posts;
create policy "posts_insert_self" on public.posts
for insert to authenticated
with check (user_id = auth.uid());

drop policy if exists "posts_update_self" on public.posts;
create policy "posts_update_self" on public.posts
for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "posts_delete_self" on public.posts;
create policy "posts_delete_self" on public.posts
for delete to authenticated
using (user_id = auth.uid());

-- Comments are visible only when the parent post is visible to the user.
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
          select 1 from public.profiles pr where pr.id = p.user_id and pr.is_private = false
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
  and exists (
    select 1 from public.posts p
    where p.id = post_comments.post_id
      and (
        p.user_id = auth.uid()
        or (p.visibility = 'public' and exists (
          select 1 from public.profiles pr where pr.id = p.user_id and pr.is_private = false
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

-- Plans are readable by signed-in users; subscriptions are private to each user.
drop policy if exists "plans_read_authenticated" on public.verification_plans;
create policy "plans_read_authenticated" on public.verification_plans
for select to authenticated
using (true);

drop policy if exists "subscriptions_read_self" on public.subscriptions;
create policy "subscriptions_read_self" on public.subscriptions
for select to authenticated
using (user_id = auth.uid());

drop policy if exists "subscriptions_insert_pending_self" on public.subscriptions;
create policy "subscriptions_insert_pending_self" on public.subscriptions
for insert to authenticated
with check (user_id = auth.uid() and status = 'pending');

-- Clients cannot activate, approve, or modify subscriptions. Trusted server-side
-- code using a service-role key must handle status transitions.
