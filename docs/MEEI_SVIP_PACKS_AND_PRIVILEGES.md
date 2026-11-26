# MEEi SVIP Packs and Privileges

## Status and payment guardrail
This document records the requested SVIP product rules. It does not authorize implementing or activating billing. SVIP checkout, collections, refunds and financial settlement remain disabled until the separately approved final monetization phase and applicable platform/legal checks.

## Pack catalogue

All packs have a 30-day validity period from server-verified activation. SVIP Points are a separate, non-transferable privilege balance, not Beans or Diamonds.

| Pack | Price | Included SVIP Points | Validity |
|---|---:|---:|---|
| SVIP 1 | ₹6,000 | 300 | 30 days |
| SVIP 2 | ₹9,000 | 500 | 30 days |
| SVIP 3 | ₹50,000 | 1,000 | 30 days |

The SVIP 2 allocation is 500 points (not 300). Show pack price, point allocation, expiry date and each privilege cost before confirmation. Do not silently renew or charge.

## SVIP 1 — ₹6,000 / 300 points / 30 days
- Anti-Mute — 200 points.
- Change Username — 100 points.
- Premium Gifts — unlocked without SVIP point deduction while the pack is active.
- B-Class Unban — 50 points, subject to the unban review policy below.
- Reset Fans List — 50 points.
- Reset Following List — 50 points.

## SVIP 2 — ₹9,000 / 500 points / 30 days
- Anti-Mute — 200 points.
- Anti-Kickout — 300 points.
- Change Username — 100 points.
- Premium Gifts — unlocked without SVIP point deduction while the pack is active.
- Special Unban — 300 points, subject to the unban review policy below.
- B-Class Unban — 50 points, subject to the unban review policy below.
- A-Class Unban — 150 points, subject to the unban review policy below.
- Reset Beans — 50 points.
- Reset Diamonds — 50 points.

## SVIP 3 — ₹50,000 / 1,000 points / 30 days
- Reset Fans List — 50 points.
- Reset Following List — 50 points.
- Special Unban — 300 points, subject to the unban review policy below.
- A-Class Unban — 150 points, subject to the unban review policy below.
- B-Class Unban — 50 points, subject to the unban review policy below.
- Global Unban — 500 points, subject to the unban review policy below.
- Anti-Kickout — 300 points.
- Anti-Mute — 200 points.
- Invisible Room Visitor — 700 points.
- Mystery Man — 800 points.

## Privilege behavior and boundaries
- **Anti-Mute / Anti-Kickout:** SVIP protection may prevent ordinary room-level creator/moderator mute or kick actions as defined by the product. It must never prevent MEEi safety staff, platform enforcement, emergency safety controls or legally required action. It must not grant moderation authority.
- **Invisible Room Visitor:** the viewer can watch and send gifts while their profile/presence is hidden from the creator and ordinary room participants. The identity and activity must remain visible to authorized MEEi safety/moderation systems for abuse investigation, legal compliance and user protection.
- **Mystery Man:** the user's profile/presence is hidden from the creator and ordinary participants; the user can comment and send gifts. Ordinary creator-side mute/kick controls may be unavailable as the requested privilege, but MEEi safety staff must retain the ability to identify, mute, remove, suspend or ban the account. Do not make the account unmoderatable or invisible to safety systems.
- **Premium Gifts:** this unlock means eligible premium gift catalogue access without an SVIP-point charge. It does not mean gifts are free to send; any Beans/paid-gift cost must be clearly shown and confirmed.
- **Reset actions:** require explicit confirmation and a clear explanation of the irreversible effect. Maintain an audit record and do not silently alter another user's data.
- **Username changes:** apply normal username availability, impersonation, abuse and cooldown rules. A point deduction alone must not bypass username safety checks.
- Privilege availability is restricted to the pack and active 30-day entitlement. Point spending must be atomic, server-authoritative, idempotent and auditable. Client balance or client-reported success is never trusted.
- The UI must show remaining points, transaction history, privilege cost, pack expiry and the fact that expired pack privileges cannot be used. Any treatment of unused points at expiry must be explicitly disclosed before purchase and implemented consistently; do not silently extend validity.

## Ban classification and unban policy requested
- Unban is never automatic. Review the actual violation and available evidence first; an SVIP user can only submit/use an eligible unban privilege for their **own account**, never another user's account.
- Serious violations remain ineligible for SVIP unban. SVIP status or point balance cannot override a safety-team decision.
- Requested progression: first and second B-Class bans cost 50 points each to request an eligible review; a third occurrence is classified as A-Class and costs 150 points to request eligible review.
- Special Unban costs 300 points; Global Unban costs 500 points. These are review/request costs, not a guarantee of reinstatement. Global Unban cannot override serious-violation or safety-team restrictions.
- **Explicit toddler incidental-appearance exemption:** if a creator/streamer is broadcasting from home and a child aged **1–3 years** who is not the host, guest, streamer or creator briefly/incidentally comes in front of the camera, this alone must **not** trigger a Live ban or account ban. Do not auto-ban the creator for this accidental background appearance. Handle any genuine safety concern proportionately (for example, advise the streamer to move the camera or keep the child out of frame); escalate only if there is evidence of intentional exposure, exploitation, endangerment or another actual policy violation.
- For children older than 3 and under 18, or pets appearing in a Live, apply the separately requested moderation rule only after contextual review and with a clear reason recorded; the exact threshold, exception cases and one-month Live restriction must be defined in a documented MEEi Safety policy before implementation. Do not infer exploitation or wrongdoing from incidental background presence alone.
- The requested one-month Live restriction is not an automatic consequence of a toddler accidentally entering the frame. Any enforcement must assess who is streaming, the context, consent/guardian requirements where applicable, exploitation or endangerment risk, and applicable law. Protect minors and do not expose them to unsafe interactions.
- The precise definition of B-Class, A-Class, Special and Global violations, evidence standards, appeal process, and how a one-month restriction maps to the ban classes must be defined by MEEi Safety before implementation.

## Security, privacy and abuse prevention
- Enforce all privileges and point deductions on trusted server-side logic. Never rely on client-side toggles, counters or timestamps.
- Keep an immutable audit trail for point grants/spends, privilege use, username changes, resets, moderation actions, ban reviews and outcomes.
- Protect against replay, double-spend, race conditions, self-dealing and account sharing. Do not allow SVIP purchases to modify another user's account without that user's authorization.
- Hidden-presence modes must not conceal users from MEEi safety staff, incident response or lawful compliance systems. Apply rate limits and abuse detection to comments, gifts and room access.
- Clearly distinguish SVIP points from Beans, Diamonds, subscription entitlements and standalone cosmetics in UI, ledger and accounting.
- No payment integration, billing, point top-up, auto-renewal or payout is enabled by this specification.

## Acceptance criteria
- The three pack prices, points and 30-day duration match the catalogue above; SVIP 2 is exactly 500 points.
- Point costs and no-point Premium Gifts unlock are shown exactly as specified for each pack.
- Server-authoritative point accounting prevents double-spending and duplicate privilege execution.
- All hidden-presence and anti-moderation privileges remain visible/actionable to authorized MEEi safety systems.
- SVIP unban only supports the purchaser's own account and is subject to evidence review and serious-violation exclusions.
- A 1–3-year-old child accidentally/briefly entering a home streamer's camera frame does not by itself cause a Live/account ban.
- All billing remains disabled until the final monetization phase is explicitly approved.
