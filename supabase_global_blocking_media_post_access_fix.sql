-- Preserve post-media access while enforcing global blocks at the storage layer.
drop policy if exists "global_block_usay_media_select" on storage.objects;

create policy "global_block_usay_media_select"
on storage.objects
as restrictive
for select
to authenticated
using (
  bucket_id <> 'usay-media'
  or (storage.foldername(name))[1] = auth.uid()::text
  or exists (
    select 1
    from public.profile_media pm
    where pm.storage_path = objects.name
      and not public.is_blocked_for_current_user(pm.user_id)
  )
  or exists (
    select 1
    from public.posts p
    where p.media_path = objects.name
      and not public.is_blocked_for_current_user(p.user_id)
  )
);
