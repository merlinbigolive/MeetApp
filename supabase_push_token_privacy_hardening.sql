-- MEEi push-token privacy hardening.
-- Safe to re-run. The mobile app registers and updates its own token,
-- but does not need to read Expo push tokens back from the database.
-- Keep service-role access for the trusted push Edge Function.

drop policy if exists "users read own push tokens" on public.user_push_tokens;
revoke select on public.user_push_tokens from anon, authenticated;

-- Preserve the minimum client operations used by the app.
grant insert, update, delete on public.user_push_tokens to authenticated;
grant all on public.user_push_tokens to service_role;
