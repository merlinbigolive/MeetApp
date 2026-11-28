# MEEi Supabase migration order and safety

This runbook records the required ordering for the follow/block RPC hardening and the shared rate-limit helper. It is intentionally limited to these related migrations; it is **not** a complete ordering of every SQL file in the repository.

## Before applying anything

- Use a disposable or staging Supabase project first.
- Confirm the base schema and feature tables referenced by each script already exist.
- Keep the Supabase `service_role` key and database credentials out of the mobile app and Expo public variables.
- Do not apply this sequence to production until the staging checks below pass and the project owner explicitly approves it.
- These scripts are proposed repository files; a successful GitHub CI run does not mean they have been applied to Supabase.

## Follow requests and global blocking

Install the base `schema.sql` first. The private-follow setup also expects the profile/follow tables. The global-block setup additionally expects the messaging and Live foundations named in its own header.

Then apply the follow/block hardening in this order:

1. `supabase_private_follow_requests_setup.sql`
2. `supabase_global_account_blocking_setup.sql`
3. `supabase_follow_rpc_global_blocking_hardening.sql`
4. `supabase_private_follow_approval_hardening.sql`
5. `supabase_follow_requests_and_blocked_accounts_rpc_hardening.sql`

The fifth script is the final definition of `request_profile_follow`, `respond_to_follow_request`, `block_user`, and `unblock_user`. Do not rerun an earlier script that redefines these RPCs after it: doing so can replace the shared account-pair transaction locks with weaker implementations.

The final script also removes known permissive direct-insert policies and revokes direct client INSERT/UPDATE on `public.follows`. Preserve the intended own-row unfollow DELETE policy.

## Shared rate-limit helper and messaging / Live PK guards

First install the base schema and the feature foundations required by the scripts. In particular:

- `supabase_messaging_setup.sql` creates the messaging tables.
- `supabase_voice_messages_setup.sql` adds voice-message metadata and the private `usay-chat-audio` bucket.
- `supabase_global_account_blocking_setup.sql` defines `public.is_blocked_for_current_user(uuid)`.
- `supabase_live_discovery_setup.sql` provides the Live session foundation required by the LiveKit room and Live PK schema.
- `supabase_meei_livekit_room_setup.sql` adds the server-generated LiveKit room mapping.
- `supabase_meei_live_pk_battle_core.sql` creates the Live PK schema/RPCs and defines the public rate-limit wrapper for Live PK actions. Apply it after the Live session foundation and after the private rate-limit helper exists.

After those foundations, apply the shared rate-limit scripts in this exact order:

1. `supabase_meei_live_chat_rate_limit_hardening.sql` — creates the private rate-limit table and initial helper.
2. `supabase_meei_livekit_action_rate_limits.sql` — extends the shared action allowlist/helper.
3. `supabase_meei_profile_video_search_rate_limits.sql` — installs profile/video search callers using the helper and block check.
4. `supabase_meei_messaging_send_guard.sql` — requires messaging tables, voice columns/bucket, global-block helper, and the shared rate-limit helper.
5. `supabase_meei_conversation_creation_guard.sql` — adds the conversation trigger and redefines the shared helper/constraint again.
6. `supabase_meei_live_pk_battle_core.sql` — if not already applied as a feature foundation, apply it here; it defines Live PK RPCs and a public rate-limit wrapper that calls the private helper.
7. `supabase_meei_live_pk_rate_limits.sql` — reasserts the public wrapper's supported action limits.
8. `supabase_meei_rate_limit_action_allowlist_fix.sql` — **must be last**; synchronizes the private table CHECK constraint and private helper with every supported wrapper action.

Several intermediate scripts intentionally redefine `private.consume_user_rate_limit(text, integer, integer)`, the public rate-limit wrapper, and/or `private.meei_user_rate_limits_action_key_check` with different action sets. Never apply one of those older definitions after step 8. If any such migration must be rerun later, rerun step 8 last and repeat the validation. The Live PK core is listed in the shared sequence to make its wrapper dependency explicit; do not apply it twice unnecessarily if it was already installed as a feature foundation.

## Validation gates before production

1. Run the repository's static Node regression tests and isolated PostgreSQL integration suite on the exact branch commit.
2. In a disposable/staging Supabase project, apply the ordered scripts and verify there are no SQL errors.
3. Use two distinct real test accounts to verify follow requests, approval, block/unblock, symmetric block behavior, direct INSERT/UPDATE denial, RLS visibility, and account-pair concurrency.
4. Verify rate-limit actions from each feature wrapper are accepted by both the private helper and table CHECK constraint; verify unsupported actions and unauthenticated calls fail closed.
5. Inspect the deployed function definitions, search paths, EXECUTE grants, RLS policies, and migration history after application.
6. Only after all checks pass, request explicit owner approval before any production migration or PR merge.

## What CI does and does not prove

The GitHub workflow runs the follow/block integration fixture against an isolated PostgreSQL 16 service, including RLS-role simulation and concurrency cases. This is useful database integration coverage, but it is not a real Supabase Auth/staging test with two provisioned accounts. CI success also does not apply SQL to any Supabase project.
