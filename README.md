# Meetapp — Phase 1 starter

Cross-platform React Native + Expo foundation for Android and iOS.

## Included in this first step
- Meetapp dark premium visual foundation
- Bottom navigation: Home, Public Feed, Create, Inbox, Profile
- Initial screen layouts for feed, inbox and profile
- Supabase client placeholder
- Initial database schema in `supabase/schema.sql`

## Run locally
1. Install Node.js LTS and Git.
2. Extract this ZIP and open the folder in a terminal.
3. Run `npm install`.
4. Copy `.env.example` to `.env` and add your Supabase project URL and anon key.
5. Run `npx expo start`.
6. Install Expo Go on an Android/iPhone and scan the QR code.

## Important
This is the first working project scaffold, not a finished production messaging service.
Authentication, realtime chat, file storage, calling infrastructure, payments, moderation,
verification review, push notifications and production security are later implementation steps.
Never put Supabase service-role keys or payment secrets in the mobile app.
