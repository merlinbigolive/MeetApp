-- MEEi global-block profile and post media storage hardening.
-- Apply after supabase_global_account_blocking_setup.sql and supabase_media_setup.sql.
-- Safe to re-run. Restricts private usay-media object reads even when older
-- permissive Storage policies would otherwise allow a public/follower read.

drop policy if exists "global_block_usay_media_select" on storage.objects;
create policy "global_block_usay_media_select" on storage.objects
as restrictive for select to authenticated
using (
  bucket_id <> 'usay-media'
  or (storage.foldername(name))[1] = auth.uid()::text
  or exists (
    select 1
    from public.profile_media pm
    where pm.storage_path = name
      and not public.is_blocked_for_current_user(pm.user_id)
  )
);
