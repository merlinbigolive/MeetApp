-- MEEi profile and profile-media least-privilege API grants.
-- Apply after the profile, media, and ownership RLS policies are installed.
-- This changes grants only; existing RLS policies remain the row-level boundary.
-- Safe to re-run.

-- Profiles:
-- - Signed-in clients may read profiles subject to RLS.
-- - Profile bootstrap may insert only its owner id, username, and display name.
-- - Profile editing may update only fields the app exposes as user-editable.
-- - Clients cannot delete profiles or modify ids/creation timestamps.
revoke all privileges on table public.profiles from anon, authenticated;

grant select on table public.profiles to authenticated;

grant insert (id, username, display_name)
  on table public.profiles to authenticated;

grant update (
  username,
  display_name,
  bio,
  website_url,
  profession_category,
  activity_status,
  is_private,
  account_type,
  business_name,
  business_category,
  business_description,
  country_code,
  country_name,
  updated_at
) on table public.profiles to authenticated;

-- Profile media:
-- - Signed-in clients may read rows subject to privacy/block RLS.
-- - Inserts carry the owner and storage path checked by the existing RLS policy.
-- - Existing rows may change only gallery slot/media metadata, never owner or kind.
-- - Deletes remain owner-scoped by the existing RLS policy.
revoke all privileges on table public.profile_media from anon, authenticated;

grant select on table public.profile_media to authenticated;

grant insert (
  user_id,
  kind,
  position,
  storage_path,
  media_type,
  original_name,
  updated_at
) on table public.profile_media to authenticated;

grant update (
  position,
  storage_path,
  media_type,
  original_name,
  updated_at
) on table public.profile_media to authenticated;

grant delete on table public.profile_media to authenticated;
