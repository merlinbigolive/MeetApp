# MEEi Creator Monthly Subscription

## Product decision
Every eligible Live creator profile can display a dedicated **Premium** subscription badge and monthly subscription offer. The initial India price is **₹900 per month**. A fan can subscribe to a favourite creator directly from the creator profile.

## Revenue model
- Subscription price: ₹900 / month.
- MEEi platform share: 30% (₹270 on a ₹900 collected amount).
- Creator share: 70% (₹630 on a ₹900 collected amount).
- Creator subscription earnings are a separate revenue stream from Live gifts / Beans. Gift earnings must continue independently; neither balance should silently replace or consume the other.
- Settlement must be based on actual collected revenue and account for applicable taxes, gateway / app-store fees, refunds, cancellations, chargebacks and other legally required adjustments. Show the creator a transparent breakdown; do not promise a payout on a pending or failed payment.

## Free-user Live access and conversion rules
- Public Live discovery remains available to everyone; do not make the entire Live area subscription-only.
- A non-subscriber may watch a total of **60 minutes of public Live video in each rolling 12-hour allowance window**. The allowance resets automatically after 12 hours. Track actual eligible viewing time server-side; do not reset it merely because the user leaves/re-enters, reconnects, reinstalls, changes devices or opens another Live.
- Count only actual foreground viewing time while the Live video is connected and playing. Do not count time while the viewer is in the background, paused, disconnected, or the stream is not playing. Prevent overlapping sessions from double-counting or creating extra allowance.
- Free users may continue to **comment in Live chat, send gifts, and follow creators**. These actions must not be blocked merely because the free viewing allowance has been used, subject to normal rate limits, safety and moderation rules.
- Free users **cannot join a creator's Live as an audio guest or video guest**. Guest-join controls must clearly explain that an active subscription is required; do not allow a client-side bypass.
- When the free viewing allowance is used, show a respectful paywall explaining that the 60-minute allowance will reset in 12 hours, show the ₹900/month creator-specific subscription offer and exact benefits, and offer Subscribe and Leave / Explore other Lives actions. Never silently charge or block discovery of other creators.
- Active subscribers have unlimited viewing access to that creator's eligible public Lives while their subscription entitlement is active, subject to normal safety, moderation, geographic and platform restrictions.
- A creator may designate clearly labelled **subscriber-only Lives**. Non-subscribers must see the subscriber-only label and offer before entering; do not start an undisclosed preview that implies the stream is free.
- Show the free user their remaining viewing allowance where practical. Any policy change must be communicated clearly; do not silently reset already-consumed allowance.

## Premium subscriber benefits
The subscription offer must list the exact benefits enabled by that creator / MEEi before purchase. Initial approved benefits:
1. **Audio and Video Guest Live access:** subscribers can request/join eligible creators' Live rooms as an audio or video guest, subject to creator acceptance, room capacity, moderation and safety controls. Subscription must not force a creator to accept a guest.
2. **Video-call allowance:** subscribers receive **10 free minutes of video calling per rolling 12-hour window**. The allowance automatically resets after 12 hours. Once the free minutes are used, the user must purchase additional call minutes before continuing. Display remaining minutes and the next reset time clearly; never start a paid minute pack or charge without explicit confirmation. The paid minute-pack product, pricing, payment flow and refund rules require separate approval and must remain disabled until the final monetization phase.
3. **Premium profile decoration:** subscribers receive a distinct premium profile treatment / decoration and Premium badge while the subscription entitlement is active. Decoration must not obscure profile content or impersonate verification.

Existing subscriber experience benefits remain part of the product offer where implemented and clearly disclosed:
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
- Show profile decoration and subscriber-only feature entitlements only while the subscription is active, with clear expired/cancelled states.
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
- Free Live viewing allowance and subscriber video-call minutes must be server-authoritative, race-safe across devices/sessions, privacy-preserving, and resistant to client clock changes or forged playback/call events. Use rolling 12-hour windows and authoritative session accounting.
- Enforce guest Live eligibility on the server for every audio/video guest token or join action; only active eligible subscribers may proceed, and creators retain acceptance/moderation control.
- Prevent duplicate entitlements, replayed webhooks, self-subscription abuse and unauthorized creator payout edits.
- Apply dispute handling and attributable creator earnings holds consistently with the existing 30-day gift/Beans dispute policy, while preserving statutory payment and consumer rights.
- Privacy: never expose subscriber lists or payment identifiers publicly.

## Implementation sequencing
Payment integration, paid video-call minute packs and payouts remain postponed until the final monetization phase, as already prioritized for MEEi. This document records the approved product scope only; it does not authorize enabling live billing, collecting money, or changing payment provider configuration before that phase.
Before implementation, verify current Google Play / Apple billing requirements for digital subscriptions, India tax treatment, payment partner terms, cancellation/refund rules, and creator payout/KYC requirements. Keep the initial ₹900 price configurable server-side for future pricing changes without silently changing an active subscription's agreed price.

## Acceptance criteria
- Eligible creator profiles show the Premium subscription offer consistently.
- A fan can purchase one creator's monthly subscription and receives the correct time-bounded entitlement only after verified payment.
- Free users receive 60 minutes of eligible public Live viewing per rolling 12-hour window, with server-authoritative accounting and automatic reset.
- Free users can comment, send gifts and follow creators; they cannot join audio/video guest Live without an active eligible subscription.
- When free viewing time ends, the viewer sees a transparent subscription offer and can leave or discover other public Lives without paying.
- Subscribers receive 10 free video-call minutes per rolling 12-hour window; additional minutes require a separately approved, explicitly confirmed paid minute pack. No minute-pack billing before final monetization approval.
- Active subscribers can access eligible audio/video guest Live flows, subject to creator acceptance and safety controls.
- Active subscribers receive the premium profile decoration and badge for the entitled period.
- Subscriber-only Lives are clearly labelled before entry and never presented as unrestricted free content.
- Subscriber benefits are explicit and verifiable; active subscribers receive their entitled benefits only for the paid period.
- Renewal, failed renewal, cancellation, expiry, refund and chargeback transitions are server-authoritative and idempotent.
- The 30% / 70% revenue breakdown is transparent and reconcilable to actual collections and adjustments.
- Gift / Beans earnings continue independently of subscription earnings.
- Two-account tests cover viewing allowance across reconnects/devices, guest access authorization, call-minute reset/consumption, subscribe, renew, cancel, expiry, refund and dispute; no production billing until platform policy, legal and payout checks are complete.
