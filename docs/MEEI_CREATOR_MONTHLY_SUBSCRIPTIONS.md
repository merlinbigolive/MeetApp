# MEEi Creator Monthly Subscription

## Product decision
Every eligible Live creator profile can display a dedicated **Premium** subscription badge and monthly subscription offer. The initial India price is **₹900 per month**. A fan can subscribe to a favourite creator directly from the creator profile.

## Revenue model
- Subscription price: ₹900 / month.
- MEEi platform share: 30% (₹270 on a ₹900 collected amount).
- Creator share: 70% (₹630 on a ₹900 collected amount).
- Creator subscription earnings are a separate revenue stream from Live gifts / Beans. Gift earnings must continue independently; neither balance should silently replace or consume the other.
- Settlement must be based on actual collected revenue and account for applicable taxes, gateway / app-store fees, refunds, cancellations, chargebacks and other legally required adjustments. Show the creator a transparent breakdown; do not promise a payout on a pending or failed payment.

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
- Prevent duplicate entitlements, replayed webhooks, self-subscription abuse and unauthorized creator payout edits.
- Apply dispute handling and attributable creator earnings holds consistently with the existing 30-day gift/Beans dispute policy, while preserving statutory payment and consumer rights.
- Privacy: never expose subscriber lists or payment identifiers publicly.

## Implementation sequencing
Payment integration and payouts remain postponed until the final monetization phase, as already prioritized for MEEi. This document records the approved product scope only; it does not authorize enabling live billing, collecting money, or changing payment provider configuration before that phase.
Before implementation, verify current Google Play / Apple billing requirements for digital subscriptions, India tax treatment, payment partner terms, cancellation/refund rules, and creator payout/KYC requirements. Keep the initial ₹900 price configurable server-side for future pricing changes without silently changing an active subscription's agreed price.

## Acceptance criteria
- Eligible creator profiles show the Premium subscription offer consistently.
- A fan can purchase one creator's monthly subscription and receives the correct time-bounded entitlement only after verified payment.
- Renewal, failed renewal, cancellation, expiry, refund and chargeback transitions are server-authoritative and idempotent.
- The 30% / 70% revenue breakdown is transparent and reconcilable to actual collections and adjustments.
- Gift / Beans earnings continue independently of subscription earnings.
- Two-account tests cover subscribe, renew, cancel, expiry, refund and dispute; no production billing until platform policy, legal and payout checks are complete.
