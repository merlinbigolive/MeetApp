# MEEi Live PK — Premium Battle Stage Visual Specification

This extends the existing Live PK implementation and issue #2. It is a visual/interaction specification; it does not change the battle duration, scoring, gift pricing, or payment rules.

## Premium two-creator stage
- During an active 1v1 PK, show both creators in a polished, premium-quality split stage with matching ornate frames, metallic/gold highlights, subtle glow, and clear creator names and scores.
- Keep both video feeds visible and recognizable. Use a responsive layout for small Android screens; do not let effects cover faces, chat, moderation controls, or gift controls.
- Place a slim vertical decorative pole/staff in the center gap between the two creator frames.
- Wrap a vivid green snake around the pole in repeated spiral coils, like a snake winding around a tree. Use a clean original illustration/animation, not a realistic threatening animal.
- Animate the snake's black forked tongue flicking out and retracting on a repeating two-second cycle. Keep the tongue motion confined to the center ornament.

## Gift-reactive battle stage
- Treat confirmed gift events and score changes as the only source of battle animation. Never animate a score from a client-only optimistic gift event.
- Small gifts: smoothly grow the receiving creator's frame in proportion to their score lead / score gain, while the opponent's frame gently shrinks. Keep both frames within safe minimum and maximum sizes so neither creator disappears. Use easing and a short settle animation to avoid jitter during rapid gifts.
- Large / high-value gift: trigger a stronger celebratory burst on the opponent's side (the side opposite the creator who received the gift), with a premium blast / impact effect. Keep the blast decorative and brief; do not obscure either face or make the video flash dangerously.
- Gift reactions must be deterministic from the authoritative gift event, deduplicated by event ID, and synchronized for all viewers in both rooms. Replayed or duplicate events must not replay the blast or double-count scores.
- Provide reduced-motion behavior and avoid strobing / rapid full-screen flashes.

## Center timer
- Keep the PK countdown visible at the top, centered between the two creator frames.
- Style the timer with a bright golden shine / metallic glow that remains legible against video.
- During the final 15 seconds, show a clear descending countdown every second: 15, 14, 13 ... 3, 2, 1, then end-state. Do not skip intermediate numbers. Use a restrained gold pulse on each tick.
- Timer must use the existing server-authoritative `ends_at` and synchronized server-time offset. Client animation is visual only; it must not extend or shorten the actual battle.

## Score and fairness
- Read scores from the authoritative gift/PK scoring source; define and validate the high-value gift threshold centrally rather than hardcoding different thresholds in clients.
- Both rooms' viewers must see the same scores, frame proportions, gift effects, and countdown for the same battle state.
- Handle late joins by rendering the current score and remaining time without replaying historical explosions.
- Reset all transient effects when the PK ends or a new battle begins.

## Accessibility, performance and QA
- Keep text contrast and touch targets accessible; preserve chat and moderation access.
- Use lightweight vector / native animations where possible; avoid expensive per-frame video processing.
- Test on lower-end Android devices, small screens, poor network, reduced motion, rapid gift bursts, duplicate/reordered gift events, reconnects, late joins, and the 15-second countdown.
- Validate that the snake tongue loops every two seconds without drifting, and that all clients remain synchronized.

## Scope
This specification is for the PK presentation layer. Existing LiveKit dual-room connectivity, server-authoritative PK timer, shared chat and cross-room moderation remain intact. It does not authorize changing the deferred payment integration or gift/Beans monetization configuration.
