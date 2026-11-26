# MEEi New Creator Welcome Boost

## Goal
Give new creators a welcoming first Live experience without misrepresenting automated activity as real people or manipulating audience metrics.

## Live-start welcome audience
- When an eligible creator starts a Live, MEEi may introduce 80–100 clearly disclosed virtual audience participants, subject to capacity, performance, abuse-prevention and rollout controls.
- Virtual participants must be visibly labelled as AI/virtual accounts in the room and in any participant list. They must not impersonate real users.
- They may post a small, rate-limited set of friendly welcome messages (for example, “Welcome to MEEi Live!”).
- Virtual participants do not count toward real viewer totals, unique viewers, engagement rankings, creator milestones, recommendation signals, or monetization metrics.
- They cannot send gifts, create fake likes/follows, or generate artificial engagement.
- Messages must be non-repetitive, localized where practical, and controllable by creator/host moderation. Provide a way to disable or reduce virtual welcomes.

## New creator 1-Diamond welcome reward
- Grant one (1) real Diamond to an eligible new creator as a platform-funded welcome bonus, intended to encourage the creator.
- The Diamond must be credited to the creator's actual earning balance and included in earnings accounting, with a clearly visible source label such as “MEEi Welcome Bonus”.
- It is a platform-funded reward, not a gift sent by a virtual participant. UI, transaction history and analytics must never attribute it to a fake user or imply a real viewer purchased/sent it.
- Eligibility must be defined server-side (new creator / first eligible Live; one-time per creator account) and protected against duplicate accounts, retries and repeated Live starts.
- Credit atomically and idempotently through the existing authoritative Diamond/earnings ledger; never update balances directly from the client.
- Record an auditable ledger entry with creator ID, reward reason, amount, timestamp, eligibility decision and idempotency key.
- Do not activate payment checkout, payouts or alter existing Beans/Diamonds conversion rules as part of this feature.
- Show the reward and its terms clearly before/when credited. Abuse/fraud review and applicable legal/tax/accounting requirements still apply.

## Acceptance criteria
- An eligible creator receives exactly one platform-funded Diamond once, not once per Live session.
- Repeated requests, retries, reconnects and concurrent Live-start events cannot duplicate the reward.
- Diamond balance and transaction history show the credit as a MEEi Welcome Bonus and include it in the established earning ledger.
- Virtual participants are clearly disclosed and excluded from real viewer/engagement/monetization counts.
- No virtual participant can create a gift transaction or be shown as the sender of the welcome Diamond.
- Creator can disable/reduce virtual welcome messages; moderation and safety controls remain effective.
- No production code or payment flow is considered implemented merely by this specification.
