## Goal
Add a synchronized 1v1 Live PK experience to MEEi and make Live chat join behavior show only comments created after each viewer entered the room.

## Current implementation findings
- `LiveBroadcastModal.tsx` currently calls `get_live_chat_messages` with a 60-message limit when a viewer joins, so historical comments can be loaded into a new viewer's chat.
- Chat polling currently refreshes the latest 60 messages every 4 seconds.
- Existing moderation UI supports creator/authorized moderator actions within a single Live session. PK requires explicitly scoped cross-room permissions for the duration of a paired battle.
- LiveKit remains the media transport. Do not merge the two creators into one insecure/shared token or expose LiveKit secrets.

## Requirements

### Fresh comments on room entry
- When a viewer joins, establish a server-authoritative `joined_at` / chat cursor for that specific session membership.
- Initial chat fetch must return no messages older than that viewer's join boundary; do not preload the previous 60 comments.
- Subscribe/poll only for messages after the boundary. Reconnects must preserve the original join boundary for the same membership, while a genuinely new room entry gets a new boundary.
- Existing viewers already in the room continue seeing new comments normally.
- Do not delete historical chat records; this is a per-viewer visibility rule, not data deletion.
- Enforce the boundary in the database/RPC or server query, not only by hiding old rows in the client.

### 1v1 Live PK connection
- A creator can invite another currently-live creator to PK; the invited creator must explicitly accept.
- Both creators see the paired-room invitation, opponent identity/preview and connection status.
- PK starts only after both sides are confirmed and both creator sessions are still active.
- Keep each creator's existing Live session, LiveKit room and secure server-issued credentials intact; create a server-authoritative PK pairing that links the two sessions.
- Handle invite expiry, decline, creator leaving/ending Live, network disconnect/reconnect, cancellation and unexpected room termination safely.

### PK duration and synchronized timer
- Creator selects exactly one duration: 5, 10 or 15 minutes.
- Timer starts from a server-authoritative timestamp after both sides are connected; clients must not independently decide the end time.
- Both rooms display the same remaining time and battle state.
- At expiry, PK ends automatically for both sides and both creators return to their normal Live rooms. Ending PK must not end either creator's underlying Live session.
- Do not add scoring/gifting/voting rules unless separately approved.

### Shared PK comments
- During an active PK, newly posted comments from either paired room are visible in both rooms.
- Each comment retains its original room/side identity and author identity; render a clear side label so viewers know which creator's side it came from.
- Sending from either side must write to the correct original session and respect that session's chat rate limits, blocks, mutes and moderation rules.
- Apply the viewer's join boundary to both sides: only comments created after the viewer entered their own room should appear in the shared feed.
- Prevent duplicate comments and preserve chronological ordering across both sides.

### Cross-side moderation
- During an active PK, either room's creator and that room's authorized admins can mute or kick out abusive users from either side of the PK.
- Username tap opens the compact viewer profile/action menu.
- Server authorization must verify: active PK pairing, actor is a creator or authorized admin of one of the paired sessions, target is currently a participant/viewer in one of the paired sessions, and requested action is permitted.
- Mute and kick-out apply to the target user's participation/chat across the paired PK experience so they cannot evade moderation by switching sides during the same battle. Keep the duration/scope explicit and consistent with existing Live moderation policy.
- Ordinary viewers cannot moderate. Admins cannot grant themselves admin status or escalate privileges on the opponent's room.
- Audit moderation actions and prevent stale/ended PK pairs from authorizing actions.

## Security and architecture
- Preserve Supabase Live discovery/chat/moderation infrastructure and LiveKit as the media provider.
- Use database constraints/RPCs and/or authenticated Edge Function actions for PK state transitions, invitation acceptance, timer start/end, shared chat retrieval and cross-room moderation.
- Validate both session ownership and current state server-side; make transitions idempotent and race-safe.
- Never trust client-supplied creator IDs, room membership, role, timestamps or timer values.
- Keep existing single-room Live behavior unchanged outside PK.
- Add indexes and RLS policies for new PK tables; deny direct client writes to privileged state.

## Delivery and QA
1. Inspect current chat RPC/schema and moderation Edge Function before changing behavior.
2. Implement per-membership join cursor and verify late joiners do not see earlier messages while existing viewers still receive new ones.
3. Implement PK pairing/invitation/state machine and synchronized timer.
4. Implement merged two-side comment feed with origin labels.
5. Extend username-tap moderation with cross-side authorization and audit logging.
6. Test simultaneous invites/accepts, invite expiry, creator end/leave, both network reconnect paths, timer expiry, duplicate events, cross-side mute/kick, non-admin denial, RLS, rate limits and two concurrent PKs.
7. Verify on real Android devices and ensure non-PK Live sessions remain unaffected.

## Acceptance criteria
- A late joiner never receives chat history from before their own room-entry boundary.
- Both creators explicitly accept before PK starts.
- Both sides see the same 5/10/15-minute countdown and automatic PK end.
- Both sides see new comments from both rooms with correct side labels and no duplicates.
- Authorized creator/admin from either side can moderate users on either side during the active PK; unauthorized users cannot.
- Ending PK leaves both underlying Live sessions running unless their creators independently end them.

## Implementation status — 2026-11-26

### Implemented in Supabase and app source
- Added per-entry `live_chat_memberships` with a server-generated UUID cursor and server timestamp.
- Viewer chat reads require a membership belonging to the authenticated user and requested Live session; SQL filters messages to `created_at >= joined_at`.
- Added membership leave invalidation. A viewer's old cursor is marked closed when they leave and cannot be reused to read chat.
- Updated `livekit-control` join to establish the membership cursor before returning the viewer token.
- Added PK invitation and battle tables with 5/10/15-minute duration validation, 45-second invitation expiry, server start/end timestamps, and per-session lock rows to prevent a creator entering multiple simultaneous PKs.
- Added authenticated RPCs for create/respond/list/state/end, shared PK comments, and cross-side moderation audit.
- Added a Live-session end trigger that ends any pending/active PK involving that session.
- Added Edge Function actions: `pk_invite`, `pk_inbox`, `pk_respond`, `pk_join`, `pk_moderate`, and `pk_end`. Creator room publishing is checked before an invite is sent or accepted. Opponent room tokens are read-only and server-issued.
- Added server-time offset for the shared countdown and client expiry handling.
- Updated `LiveBroadcastModal.tsx` with PK creator selection, duration choices, invite accept/decline, dual LiveKit room video panes, shared two-side comments with side labels, and PK-scoped username-tap mute/kick actions.

### Verification still required
- Supabase migrations applied successfully and Edge Function `livekit-control` is ACTIVE at version 9.
- Database function definitions, SECURITY DEFINER flags, search paths, RLS and grants were inspected.
- No two-account end-to-end PK test or physical Android/iOS device test has been performed yet. In particular, the two simultaneous React Native LiveKit room connections, media/audio behavior, network recovery, and moderation removal must be verified in development builds before treating PK as production-ready.
