# MEEi Theme Architecture

## Current foundation

- The default appearance remains the existing white/light palette.
- The existing dark appearance and System / Light / Dark setting remain supported.
- Both base palettes are centralized in `meeiTheme.js`; `App.tsx` consumes the shared resolver.
- Profile secondary text and soft-accent surfaces use semantic `subtleText`, `accentSoft`, and `accentBorder` tokens in both appearances.
- Persisted appearance values are validated before being applied. Unknown or stale values fall back to the System default.
- This foundation does not unlock, preview as owned, or activate any paid cosmetic.

## Approved paid cosmetic catalogue (not yet implemented)

- The ₹150/month Profile Theme collection: Rainbow, Yellow, Pink, Lite Blue, Lite Red, and the updated dark forest-green/black theme with bright lime accents.
- The former Snake Green / Light Emerald Green (#7BCB50) theme is retired and must not return.
- VIP Golden Shine remains a separate ₹4,999/month theme subscription, not part of the ₹150 collection.
- The default profile theme remains white.
- An equipped paid theme must apply consistently across the app, not only on the Profile screen.

## Entitlement and safety gates

- Never treat AsyncStorage, a client-side boolean, or a client-supplied theme ID as proof of purchase.
- Paid cosmetics may be equipped only after a server-verified, time-bounded entitlement is returned for the authenticated account.
- Keep subscription entitlement, standalone cosmetic ownership, validity, expiry, refunds and chargebacks distinct and auditable.
- Do not activate billing or collect money during this development phase.
- Do not implement the paid theme picker until the entitlement contract, server enforcement, and account-isolation rules are ready.

## Visual quality gates

- Rainbow remains unreleased until contrast/readability checks pass for profile name, bio, buttons, statistics and detail text.
- Check light/dark surfaces, selected and disabled states, overlays, accessibility text scaling and small Android screens.
- Forest Green/Lime must be a complete app-wide semantic palette; avoid scattered one-off hex overrides.
- Migrate hard-coded colors by semantic role in small reviewed batches. Do not mass-replace unrelated status, media, gift, or brand colors.

## Rollout sequence

1. Centralize and regression-test the existing base palettes.
2. Introduce semantic color tokens and migrate app surfaces without changing current appearance.
3. Define and test server-verified cosmetic entitlement reads and equip authorization.
4. Add paid theme previews and inventory/equip UI only after entitlement enforcement is ready.
5. Run contrast/accessibility checks and full Android regression tests before release.
