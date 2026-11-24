-- USay profile media cloud storage setup.
-- Run this once in Supabase SQL Editor after the main schema.sql.

create table if not exists public.profile_media (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('avatar','cover','post')),
  position smallint not null default 0 check (position between 0 and 2),
  storage_path text not null unique,
  media_type text not null check (media_type in ('image','video')),
  original_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, kind, position),
  check ((kind = 'avatar' and position = 0) or kind <> 'avatar')
);

alter table public.profile_media enable row level security;

drop policy if exists "profile_media_read_self" on public.profile_media;
drop policy if exists "profile_media_read_visible" on public.profile_media;
create policy "profile_media_read_visible" on public.profile_media
for select to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1
    from public.profiles p
    where p.id = profile_media.user_id
      and (
        p.is_private = false
        or exists (
          select 1 from public.follows f
          where f.follower_id = auth.uid()
            and f.followed_id = profile_media.user_id
        )
      )
  )
);

drop policy if exists "profile_media_insert_self" on public.profile_media;
create policy "profile_media_insert_self" on public.profile_media
for insert to authenticated
with check (user_id = auth.uid());

drop policy if exists "profile_media_update_self" on public.profile_media;
create policy "profile_media_update_self" on public.profile_media
for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "profile_media_delete_self" on public.profile_media;
create policy "profile_media_delete_self" on public.profile_media
for delete to authenticated
using (user_id = auth.uid());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'usay-media',
  'usay-media',
  false,
  52428800,
  array['image/jpeg','image/png','image/webp','image/heic','video/mp4','video/quicktime','video/webm']
)
on conflict (id) do update set
  public = false,
  file_size_limit = 52428800,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "usay_media_read_own" on storage.objects;
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
          )
        )
    )
  )
);

drop policy if exists "usay_media_upload_own" on storage.objects;
create policy "usay_media_upload_own" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'usay-media'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "usay_media_update_own" on storage.objects;
create policy "usay_media_update_own" on storage.objects
for update to authenticated
using (
  bucket_id = 'usay-media'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'usay-media'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "usay_media_delete_own" on storage.objects;
create policy "usay_media_delete_own" on storage.objects
for delete to authenticated
using (
  bucket_id = 'usay-media'
  and (storage.foldername(name))[1] = auth.uid()::text
);
