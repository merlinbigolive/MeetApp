-- MEEi profile media ownership hardening.
-- Safe to re-run. The app stores profile media as:
-- <authenticated-user-uuid>/<kind>/<filename>
-- This prevents a user from registering another user's private storage object
-- under their own public profile_media row and indirectly exposing that object.

drop policy if exists "profile_media_insert_self" on public.profile_media;
create policy "profile_media_insert_self" on public.profile_media
for insert to authenticated
with check (
  user_id = auth.uid()
  and (storage.foldername(storage_path))[1] = auth.uid()::text
  and char_length(trim(storage_path)) > 0
);

drop policy if exists "profile_media_update_self" on public.profile_media;
create policy "profile_media_update_self" on public.profile_media
for update to authenticated
using (user_id = auth.uid())
with check (
  user_id = auth.uid()
  and (storage.foldername(storage_path))[1] = auth.uid()::text
  and char_length(trim(storage_path)) > 0
);

