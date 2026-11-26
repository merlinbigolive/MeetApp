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
