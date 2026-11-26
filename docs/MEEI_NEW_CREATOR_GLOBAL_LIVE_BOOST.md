# MEEi New Creator Global Live Boost

## Goal
Give eligible new creators a fair first opportunity to be discovered internationally when they start their first Live.

## Promotion behaviour
- When an eligible new creator starts their first qualifying Live, the discovery system should place that Live into the main Live discovery page/feed for users across all supported countries.
- The global new-creator promotion lasts exactly 5 minutes from the server-recorded Live start / boost activation time.
- Promotion should be eligible for users browsing any country view; it must not be restricted to the creator's home country.
- After 5 minutes, the temporary boost ends automatically and the Live returns to the normal ranking/recommendation system.
- Do not promise that every user will see the Live simultaneously or guarantee a fixed number of impressions. Use fair rotation and feed capacity limits so global exposure is distributed across eligible viewers.

## Eligibility and safety
- Grant the boost only to a genuinely new creator's first qualifying Live, once per creator account.
- Enforce eligibility and timing server-side; use idempotency to prevent duplicate boosts from reconnects, retries or repeated start events.
- Live must pass the same content, age, account, moderation and safety eligibility checks as any other public Live.
- Exclude private, blocked, restricted, subscriber-only (unless the viewer is entitled), suspended or otherwise ineligible sessions from public promotion.
- Respect viewer blocks, country/legal restrictions, language preferences, safety filters and user feed controls.
- Do not fabricate viewers, likes, gifts, comments or engagement metrics. Promotion is discovery placement only.
- The boost does not change creator earnings, Diamonds, Beans, subscription entitlements or SVIP points.
- Record boost start/end, creator, Live session, eligibility decision and reason in auditable server-side records.

## Relationship to New Creator Welcome Boost
- This global discovery boost is separate from the 80–100 clearly disclosed virtual welcome participants and the one-time platform-funded 1-Diamond welcome bonus.
- No virtual audience participant may be counted as a real viewer or used to inflate promotion performance.

## Acceptance criteria
- Eligible first Live receives global main-Live-feed promotion across supported country views for 5 minutes.
- Server-authoritative expiry ends the boost after 5 minutes without client-side timing manipulation.
- Duplicate events cannot restart or extend the one-time boost.
- Normal recommendation ranking resumes automatically after expiry.
- Safety, blocks, privacy and entitlement restrictions are respected.
- Analytics distinguish promoted impressions from organic recommendations and real viewer counts.
- This document is a specification only; it does not imply code implementation or deployment.

## Separately purchasable Global Live Boost

The product must also offer a paid, one-time Global Live Boost that any eligible creator can purchase separately from the one-time New Creator Global Live Boost.

### Country selection and pricing
- Before checkout, the creator selects the countries in which the Live should be promoted.
- India is the base country and costs ₹1,000 per boost.
- Each additional selected country adds ₹500 to the same boost purchase.
- Pricing formula: ₹1,000 + ₹500 × (selected country count − 1), with India included as the base selection.
- Examples: India only = ₹1,000; India + 1 additional country = ₹1,500; India + 2 additional countries = ₹2,000.
- Show the selected country list, country count, full total, currency and boost duration before the user confirms purchase. No silent charges or automatic renewal.
- This is a per-boost purchase, not a subscription. Payment activation remains subject to the project's deferred monetization/payment phase; this specification does not authorize enabling checkout now.
- Country pricing must be validated server-side against the selected country set and the current published price configuration. Do not trust client-calculated totals.

### Five-second invite popup
- During the purchased boost, show an in-app Live invite popup to eligible users in every selected country.
- The popup is visible for 5 seconds, identifies the creator and Live, and provides a clear action to open the Live. Dismissal/expiry must not force navigation.
- Do not show the invite popup to a user who is currently hosting or participating in a Live at the time the invite is due.
- Respect blocks, privacy, account restrictions, age/safety eligibility, country/legal restrictions, viewer preferences and notification controls.
- Deduplicate delivery per user per boost; apply delivery throttles and fair fan-out so a boost cannot flood users with repeated popups. Do not claim guaranteed simultaneous delivery to every account if the user is offline or the app is not active.
- Record selected countries, price configuration/version, purchase/boost ID, delivery attempts, exclusions and results for audit and analytics.
- Paid boost impressions and invite opens must be measured separately from organic discovery, real viewer counts and engagement metrics. Never fabricate viewers, likes, gifts, follows or comments.
- The paid boost's duration is the existing Global Live Boost duration of 5 minutes unless a later product decision explicitly changes it. The 5-second value is the popup display duration, not the boost duration.

## Video-call restriction during Live PK
- While a creator is an active participant in a Live PK battle, no Premium user may initiate a video call to that creator and the creator must not receive or be able to accept a video-call request.
- Enforce this on the server/call-signalling path as well as in the client UI; hiding the call button alone is insufficient.
- Reject attempts immediately and do not queue missed/ deferred video calls for delivery after PK ends.
- Once the creator is no longer in an active PK, normal Premium video-call eligibility and allowance rules resume.
- Apply the restriction to both creators in the PK, regardless of which room initiated the battle.
- This rule does not alter unrelated voice-call policy unless separately specified.

### Invite popup visual and UX requirements
- Position the invite popup at the upper-center of the screen, respecting the device safe area and status bar.
- Use a compact, premium-looking floating card/banner with clear visual hierarchy: creator identity, a short Live invitation message, and an obvious but unobtrusive action to view the Live.
- It must never become a full-screen overlay, full-screen takeover, or blocking modal. Keep the rest of the app visible and usable.
- Use readable text, strong accessible contrast, restrained premium styling and sufficient spacing; the invitation must be understandable at a glance.
- Keep the popup on screen for no more than the specified 5 seconds. Provide a clear dismiss/close action; tapping outside should not accidentally open the Live.
- Use a subtle, brief entrance/exit transition; respect reduced-motion settings and avoid flashing, loud, or aggressive animation.
- Do not cover essential navigation, system status indicators, Live controls, or important content. Adapt placement/size for small screens, notches and accessibility text scaling.
- Do not repeatedly reopen a popup the user dismissed for the same boost. Respect notification preferences and delivery throttles so the experience feels informative rather than irritating.


### Popup screen-state and Live-room suppression (clarification)
- Deliver/show a Global Live Boost invite popup only while the recipient is not hosting, streaming, or participating in any Live session, and is browsing a normal non-Live app screen (for example, the social/home/feed pages).
- Never display this boost invite popup over a Live room, a Live streaming/broadcast screen, a PK screen, or any other active Live experience. Do not place it outside the Live UI as an overlay while the user is inside a Live room.
- Re-check the recipient's current Live/session state immediately before delivery and again before rendering. If they start or join a Live while an invite is pending or visible, cancel/dismiss it immediately; do not defer it or replay it after that Live ends.
- If the recipient is already in any Live session when the invite is due, suppress that delivery for that user and boost. Do not queue it for later.
- This restriction is in addition to the existing requirement that the recipient must not be hosting or participating in a Live; it applies equally to being a viewer/guest inside someone else's Live room.
- Only show the compact popup on eligible normal/social app screens, with the existing 5-second maximum, safe-area, dismissal, deduplication and notification-preference rules unchanged.


## Final UI placement and notification policy (supersedes earlier popup placement wording)
- Every Global Live Boost popup and every other standalone Live-streaming-related popup/banner/invite must appear only within the dedicated Live streaming page/Live discovery section.
- Do not show any Live Boost popup or Live-streaming-related standalone popup on the public social feed, Search page, Reels page, main Profile page, or any other non-Live section.
- Do not send Live Boost notifications at all: no push notification, system notification, inbox notification, or background notification. Boost discovery must not create a notification outside the dedicated Live page.
- A boost may still promote an eligible creator's Live listing inside the dedicated Live discovery page/feed for the specified boost duration. This is Live-page discovery placement, not a popup/notification and not placement in the public social feed.
- If the user is currently inside any Live room/stream/PK, do not show a separate boost popup over the room. The Live page may show its normal in-page Live discovery content only when the user is actually on that page; never overlay an active room.
- Remove/ignore the earlier instruction to show boost popups on normal/social/home/feed pages. The final rule is Live-page-only popup placement and zero Live Boost notifications.


## Latest clarification: Live-room viewer-only popup eligibility (supersedes all earlier popup placement rules)
- Global Live Boost popups and every other standalone Live-streaming-related popup/banner/invite may appear **only inside an active Live room**, and only to ordinary users who are viewers in that room.
- Do not show these popups to either creator/participant who is actively playing a PK battle. Both PK participants are fully excluded, regardless of which room initiated the PK.
- The popup must not appear on the Live discovery page outside a room, public social feed, Search, Reels, Profile, or any other screen outside an active Live room.
- No Live Boost notifications of any kind: no push, system, inbox, or background notifications.
- Enforce eligibility server-side and re-check the recipient's current room role and PK participation immediately before rendering. If the user becomes a PK participant, suppress/dismiss the popup immediately; do not queue or replay it later.
- Ordinary viewers inside Live rooms may see eligible popups subject to the existing safety, block, privacy, deduplication, throttle, safe-area, accessibility and five-second display rules.
- This latest viewer-only, active-Live-room rule supersedes all earlier conflicting popup placement and suppression wording in this document. Boosted Live discovery ranking may continue separately, but it must not create a popup outside an active Live room.
