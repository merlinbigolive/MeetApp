# MEEi LiveKit setup

LiveKit replaces the previous 100ms streaming choice. The existing Supabase live discovery, chat, and moderation tables/RPCs remain in place.

## 1. Apply the room mapping migration

In Supabase Dashboard → SQL Editor, run the contents of `supabase_meei_livekit_room_setup.sql` after the existing `supabase_live_discovery_setup.sql` has already been applied.

This adds the private `provider_room_name` mapping used by the trusted streaming backend.

## 2. Deploy the Edge Function

Deploy the function named `livekit-control` using the source at:

`supabase/functions/livekit-control/index.ts`

Dashboard route: Edge Functions → Deploy a new function → Via Editor. Create it with the exact name `livekit-control`, replace the starter code with the repository source, then Deploy.

The function authenticates the caller's Supabase access token, issues short-lived LiveKit room tokens, creates/deletes rooms, checks creator video publication before advertising a session, refreshes the live heartbeat, and ends stale/finished sessions.

## 3. Required secrets

These three project secrets must exist in Edge Function Secrets:

- `LIVEKIT_API_KEY`
- `LIVEKIT_API_SECRET`
- `LIVEKIT_URL`

Supabase also injects `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` into Edge Functions. Never copy the service-role key or LiveKit API secret into the mobile app.

## 4. Native app build

LiveKit uses native WebRTC modules and does not run inside Expo Go. The repository now includes the LiveKit Expo plugins, `registerGlobals()`, and an EAS `development` build profile. Build a fresh Android development client before testing camera/microphone streaming.

The EAS build profile is ready as `development`; a new native build is required after installing these dependencies/config plugins.

## Current scope

- Creator can request a server-issued room token and publish camera/microphone.
- The server advertises a creator only after it verifies a published camera track.
- Viewer joins use a server-issued subscribe-only token.
- Creator heartbeats keep discovery presence fresh; ending Live closes the room.
- Existing Live chat/moderation RPCs remain separate and are preserved.

Physical-device and EAS build verification are still pending. Do not treat the integration as production-tested until a fresh development build is installed and creator/viewer tests pass.
