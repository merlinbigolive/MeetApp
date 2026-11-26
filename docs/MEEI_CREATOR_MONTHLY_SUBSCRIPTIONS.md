## Goal
Allow fans to subscribe monthly to their favourite eligible MEEi Live creators from each creator's profile, with meaningful subscriber benefits and a clear distinction between free engagement and premium participation.

## Approved initial commercial model
- ₹900 per month.
- 70% creator share (₹630 on ₹900).
- 30% MEEi platform share (₹270 on ₹900).
- Creator subscriptions are a separate earnings stream from Live Gifts / Beans; both remain available independently.

## Free-user Live access
- Public Live discovery and viewing are **not time-limited for free users**. Do not impose a 60-minute, 12-hour, or other viewing cap on public Lives.
- Free users may watch public Lives for as long as they want, subject to normal safety, moderation, network and platform restrictions.
- Free users can comment, send gifts and follow creators. These actions remain available regardless of how long they watch, subject to normal rate limits, safety and moderation rules.
- Do not show a viewing-limit paywall or interrupt a free user's Live viewing based on elapsed watch time.
- Free users cannot join a creator's Live as an audio guest or video guest. Guest-join controls must clearly explain that an active eligible creator subscription is required; enforce this on the server.
- Active subscribers may also access eligible audio/video guest Live flows, subject to creator acceptance, room capacity, moderation and safety. Subscription never forces a creator to accept a guest.
- A creator may designate clearly labelled subscriber-only Lives. Non-subscribers must see the subscriber-only label and offer before entering; do not imply that subscriber-only content is free.

## Premium subscriber benefits
The subscription offer must list the exact benefits enabled by MEEi before purchase. Initial approved benefits:
1. **Audio and Video Guest Live access:** subscribers can request/join eligible creators' Live rooms as an audio or video guest, subject to creator acceptance, room capacity, moderation and safety controls.
2. **Video-call allowance:** subscribers receive **10 free minutes of video calling per rolling 12-hour window**. The allowance automatically resets after 12 hours. Once the free minutes are used, additional minutes require a separately approved paid minute pack before continuing. Display remaining minutes and the next reset time clearly; never start a paid minute pack or charge without explicit confirmation. Paid minute-pack pricing, payment flow and refund rules require separate approval and must remain disabled until the final monetization phase.
3. **Premium profile decoration:** subscribers receive a distinct premium profile treatment / decoration and Premium badge while the subscription entitlement is active. Decoration must not obscure profile content or impersonate verification.

Additional subscriber benefits may include clearly labelled subscriber-only Lives/posts/replays, a subscriber badge in the creator's Live chat, scheduled Q&A/events and creator-managed priority interactions where supported. Never promise guaranteed personal replies, gifts, wins, or moderation immunity. Only advertise benefits that are actually implemented and deliverable.

## Profile and subscriber experience
- Show a consistent Premium badge / subscription card on eligible creator profiles.
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
- Do not implement free public-Live watch-time accounting, caps, or expiry paywalls; public Live viewing remains unrestricted for free accounts.
- Enforce guest Live eligibility on the server for every audio/video guest token or join action; only active eligible subscribers may proceed, and creators retain acceptance/moderation control.
- Video-call free-minute accounting must be server-authoritative, race-safe across devices/sessions, privacy-preserving, and resistant to client clock changes or forged call events. Use rolling 12-hour windows and authoritative call-session accounting.
- Prevent duplicate entitlements, replayed webhooks, self-subscription abuse and unauthorized creator payout edits.
- Apply dispute handling and attributable creator earnings holds consistently with the existing 30-day gift/Beans dispute policy, while preserving statutory payment and consumer rights.
- Privacy: never expose subscriber lists or payment identifiers publicly.

## Implementation sequencing
Subscription billing, paid video-call minute packs and payouts remain postponed until the final monetization phase. This document records the approved product scope only; it does not authorize enabling live billing, collecting money, or changing payment provider configuration before that phase.
Before implementation, verify current Google Play / Apple billing requirements for digital subscriptions, India tax treatment, payment partner terms, cancellation/refund rules, and creator payout/KYC requirements. Keep the initial ₹900 price configurable server-side for future pricing changes without silently changing an active subscription's agreed price.

## Acceptance criteria
- Eligible creator profiles show the Premium subscription offer consistently.
- A fan can purchase one creator's monthly subscription and receives the correct time-bounded entitlement only after verified payment.
- Free users can watch public Lives without any fixed viewing-time limit.
- Free users can comment, send gifts and follow creators without a watch-time-based restriction.
- No watch-limit pop-up or viewing paywall appears when a free user's watch time reaches one hour or any other threshold.
- Free users cannot join audio/video guest Live without an active eligible subscription; active subscribers can request guest access subject to creator acceptance and safety controls.
- Subscribers receive 10 free video-call minutes per rolling 12-hour window; additional minutes require a separately approved, explicitly confirmed paid minute pack. No minute-pack billing before final monetization approval.
- Active subscribers receive the premium profile decoration and badge for the entitled period.
- Subscriber-only Lives are clearly labelled before entry and never presented as unrestricted free content.
- Subscriber benefits are explicit and verifiable; active subscribers receive their entitled benefits only for the paid period.
- Renewal, failed renewal, cancellation, expiry, refund and chargeback transitions are server-authoritative and idempotent.
- The 30% / 70% revenue breakdown is transparent and reconcilable to actual collections and adjustments.
- Gift / Beans earnings continue independently of subscription earnings.
- Two-account tests cover guest access authorization, call-minute reset/consumption, subscribe, renew, cancel, expiry, refund and dispute; no production billing until platform policy, legal and payout checks are complete.
