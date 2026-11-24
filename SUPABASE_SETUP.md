# USay Supabase setup

The app code reads only these Expo public environment variables:

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`

Do not add a Supabase account password, database password, or `service_role` key to the app or Expo public variables.

## 1. Apply the database schema

1. Open the USay Supabase project.
2. Open **SQL Editor** and create a new query.
3. Copy the complete contents of `schema.sql` from this repository.
4. Run it once and confirm that it completes without an error.

The SQL enables row-level security and adds owner/visibility policies for profiles, follows, posts, comments, verification plans, and subscriptions. Review the SQL output before continuing. It is safe to re-run because the policies are dropped before being recreated.

## 2. Add Expo environment variables

1. Open the Expo project **meetapp**.
2. Open **Environment variables**.
3. Add `EXPO_PUBLIC_SUPABASE_URL` using the project's Supabase Project URL.
4. Add `EXPO_PUBLIC_SUPABASE_ANON_KEY` using the Supabase publishable/anon client key.
5. Add both variables to the **preview** environment used by the APK build. Add them to production too if/when production builds are used.
6. Save the variables. A new app build is required for the native app to receive changed build-time environment variables.

Never use the Supabase `service_role` key in an Expo variable beginning with `EXPO_PUBLIC_`.

## 3. Configure email OTP

The USay login screen asks for a six-digit email code. In Supabase, open **Authentication → Email Templates** and ensure the email OTP template includes `{{ .Token }}` so the user receives a code (not only a magic-link button).

Also check **Authentication → Providers → Email** and make sure email sign-in is enabled.

## 4. Verify

After the environment variables are saved and a new preview APK is built:

1. Open USay and enter an email address.
2. Enter the six-digit code received by email.
3. Confirm the app opens the profile screen.
4. Edit the profile and save it.
5. Refresh/reopen the app and confirm the saved profile details load again.

## Current implementation boundary

Email OTP and basic profile text sync are implemented in the app code. Avatar, cover media, and post media are still stored locally on the device; Supabase Storage upload and media URL sync are not yet implemented. The database schema and policies in this repository are not active in the Supabase project until the SQL is run there.
