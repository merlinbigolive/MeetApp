# MEEi Creator Monthly Subscription

## Product decision
Every eligible Live creator profile can display a dedicated **Premium** subscription badge and monthly subscription offer. The initial India price is **₹900 per month**. A fan can subscribe to a favourite creator directly from the creator profile.

## Revenue model
- Subscription price: ₹900 / month.
- MEEi platform share: 30% (₹270 on a ₹900 collected amount).
- Creator share: 70% (₹630 on a ₹900 collected amount).
- Creator subscription earnings are a separate revenue stream from Live gifts / Beans. Gift earnings must continue independently; neither balance should silently replace or consume the other.
- Settlement must be based on actual collected revenue and account for applicable taxes, gateway / app-store fees, refunds, cancellations, chargebacks and other legally required adjustments. Show the creator a transparent breakdown; do not promise a payout on a pending or failed payment.

## Free Live preview and conversion rules
- Public Live discovery remains available to everyone; do not make the entire Live area subscription-only.
- A non-subscriber may watch up to **10 minutes of free preview per creator in a rolling 24-hour window**. This is per viewer + creator pair, not a single app-wide daily allowance.
- Count only actual foreground viewing time while the Live video is connected and playing. Do not count time while the viewer is in the background, paused, disconnected, or the stream is not playing.
- Track preview consumption server-side so leaving/re-entering, reconnecting, reinstalling, changing devices, or opening another room for the same creator cannot reset the allowance. Avoid counting overlapping sessions twice.
- When the allowance is used, show a respectful subscription gate for that creator: explain that the free preview is over, show the ₹900/month price and the creator's clearly listed benefits, and offer Subscribe and Leave / Explore other Lives actions. Never silently charge, auto-subscribe, or block the user from discovering other creators.
- Active subscribers have unlimited viewing access to that creator's eligible public Lives while their subscription entitlement is active, subject to normal safety, moderation, geographic and platform restrictions.
- A creator may designate clearly labelled **subscriber-only Lives**. Non-subscribers must see the subscriber-only label and offer before entering; do not start an undisclosed preview that implies the stream is free.
- Preview limits must be transparent before a viewer enters a creator's Live. Show remaining preview time where practical. Do not use deceptive countdowns or interrupt the creator's video with repeated purchase prompts.
- Keep a configurable server-side preview duration so MEEi can tune the 10-minute policy after measuring conversion, retention and creator outcomes. Any policy change must be communicated clearly; do not silently reset already-consumed preview time.

## Subscriber benefits
The subscription offer must list the exact benefits enabled by that creator / MEEi before purchase. Initial benefit set:
- Unlimited viewing of that creator's eligible public Lives while subscribed.
- Access to clearly labelled subscriber-only Lives and subscriber-only posts / replays where the creator has enabled them.
- Subscriber badge beside the fan's name in that creator's Live chat.
- Subscriber-only chat / Q&A sessions or special events when scheduled by the creator.
- Priority in creator-managed subscriber interactions where supported; never promise guaranteed personal replies, gifts, wins, or moderation immunity.
- Benefits must be deliverable, accurately described, and removable only with clear notice and appropriate subscriber protections. Creators must not be able to advertise unsupported or misleading benefits.

## Profile and subscriber experience
- Show a consistent Premium badge / subscription card on eligible Live creator profiles.
- Display the monthly price, renewal terms, included subscriber benefits, and a clear Subscribe action before purchase.
- Show subscriber status, next renewal / expiry date, and manage/cancel subscription controls.
- Do not imply that a creator is Premium merely because they are currently Live; Premium is a subscription entitlement.

## Creator experience
- Creator dashboard shows active subscribers, new subscriptions, renewal / expiry events, gross collections, MEEi share, creator share, refunds / adjustments and payout status.
- Creators can describe subscriber benefits, subject to MEEi content and safety policies. Benefits must be explicit before the fan subscribes and must not be misleading.
- Subscription access must be revoked or changed correctly on cancellation, failed renewal, refund, chargeback or expiry.
- Gifts remain available as a separate way for viewers to support creators.

## Backend and security requirements
- Use server-verified payment provider / platform billing events. Never trust client success callbacks or client-calculated shares.
- Keep payment credentials and webhook secrets server-side. Never collect or store UPI PINs in MEEi.
- Use an idempotent subscription ledger with provider transaction / purchase token references, entitlement period start/end, renewal state, cancellation, refund and chargeback records.
- Verify creator eligibility, account standing, and entitlement access on the server.
- Preview accounting and subscription entitlements must be server-authoritative, race-safe across multiple devices/sessions, privacy-preserving, and resistant to client clock changes or forged playback events.
- Prevent duplicate entitlements, replayed webhooks, self-subscription abuse and unauthorized creator payout edits.
- Apply dispute handling and attributable creator earnings holds consistently with the existing 30-day gift/Beans dispute policy, while preserving statutory payment and consumer rights.
- Privacy: never expose subscriber lists or payment identifiers publicly.

## Implementation sequencing
Payment integration and payouts remain postponed until the final monetization phase, as already prioritized for MEEi. This document records the approved product scope only; it does not authorize enabling live billing, collecting money, or changing payment provider configuration before that phase.
Before implementation, verify current Google Play / Apple billing requirements for digital subscriptions, India tax treatment, payment partner terms, cancellation/refund rules, and creator payout/KYC requirements. Keep the initial ₹900 price configurable server-side for future pricing changes without silently changing an active subscription's agreed price.

## Acceptance criteria
- Eligible creator profiles show the Premium subscription offer consistently.
- A fan can purchase one creator's monthly subscription and receives the correct time-bounded entitlement only after verified payment.
- Free preview is limited to 10 minutes per creator per rolling 24 hours, counted only during actual foreground playback and enforced across devices and reconnects.
- When free preview ends, the viewer sees a transparent creator-specific subscription offer and can leave or discover other public Lives without paying.
- Subscriber-only Lives are clearly labelled before entry and never presented as unrestricted free content.
- Subscriber benefits are explicit and verifiable; active subscribers receive their entitled benefits only for the paid period.
- Renewal, failed renewal, cancellation, expiry, refund and chargeback transitions are server-authoritative and idempotent.
- The 30% / 70% revenue breakdown is transparent and reconcilable to actual collections and adjustments.
- Gift / Beans earnings continue independently of subscription earnings.
- Two-account tests cover preview accounting across reconnects/devices, subscribe, renew, cancel, expiry, refund and dispute; no production billing until platform policy, legal and payout checks are complete.
