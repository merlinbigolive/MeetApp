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
