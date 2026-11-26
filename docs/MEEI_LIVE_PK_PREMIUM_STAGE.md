# MEEi Live PK — Premium Battle Stage Visual Specification

This extends the existing Live PK implementation and issue #2. It is a visual/interaction specification; it does not change battle duration, scoring, gift pricing, or payment rules.

## Clean creator video windows (no decorative frames)
- Show only the two live video windows side by side / split across the PK stage. Do not add ornate borders, picture frames, thick outlines, or decorative frame overlays around either creator's video.
- Keep the video windows clean, prominent, equally recognizable at baseline, and responsive on small Android screens. Preserve faces, chat, moderation controls, and gift controls.
- Beside / immediately above each creator's own video window, show that creator's live score clearly.
- Show each creator's username in bold, premium-looking text near the upper edge of their own video window. Place a clearly tappable "+" Follow control alongside the username. The + action follows that creator, updates to the correct followed state, and must not accidentally trigger when the user taps the video or nearby controls.
- Follow state and permissions must use the existing follow system; do not create duplicate follow relationships or fake local-only follow state.

## Center snake ornament
- Place a slim vertical decorative pole/staff in the center gap between the two creator video windows.
- Wrap a vivid green snake around the pole in repeated spiral coils, like a snake winding around a tree. Use a clean original illustration/animation, not a realistic threatening animal.
- Animate the snake's black forked tongue flicking out and retracting on a repeating two-second cycle. Keep the snake and tongue confined to the center gap and never cover either video window, creator name, score, or controls.

## Gift-reactive video-window sizing
- Treat confirmed gift events and score changes as the only source of battle animation. Never animate a score from a client-only optimistic gift event.
- Small gifts: smoothly enlarge the receiving creator's live video window as their score/lead increases, while the opponent's video window proportionately shrinks. Keep both windows within safe minimum and maximum sizes so neither creator disappears or becomes unusable. Use easing and a short settle animation to avoid jitter during rapid gifts.
- Large / high-value gift: trigger a strong celebratory burst / impact effect on the opponent's side (the side opposite the creator who received the gift). Keep it decorative and brief; do not cover faces or make the video flash dangerously.
- Gift reactions must be deterministic from the authoritative gift event, deduplicated by event ID, and synchronized for all viewers in both rooms. Replayed or duplicate events must not replay the burst or double-count scores.
- Provide reduced-motion behavior and avoid strobing / rapid full-screen flashes.

## Center timer
- Keep the PK countdown visible at the top center, in the gap between the two creator video windows.
- Style the timer with a bright golden shine / metallic glow that remains legible against video.
- During the final 15 seconds, show a clear descending countdown every second: 15, 14, 13 ... 3, 2, 1, then end-state. Do not skip intermediate numbers. Use a restrained gold pulse on each tick.
- Timer must use the existing server-authoritative `ends_at` and synchronized server-time offset. Client animation is visual only; it must not extend or shorten the actual battle.

## Score and fairness
- Read scores from the authoritative gift/PK scoring source; define and validate the high-value gift threshold centrally rather than hardcoding different thresholds in clients.
- Both rooms' viewers must see the same scores, video-window proportions, gift effects, and countdown for the same battle state.
- Handle late joins by rendering the current score and remaining time without replaying historical bursts.
- Reset all transient effects when the PK ends or a new battle begins.

## Accessibility, performance and QA
- Keep text contrast and touch targets accessible; preserve chat and moderation access.
- Use lightweight vector / native animations where possible; avoid expensive per-frame video processing.
- Test on lower-end Android devices, small screens, poor network, reduced motion, rapid gift bursts, duplicate/reordered gift events, reconnects, late joins, and the 15-second countdown.
- Validate that the snake tongue loops every two seconds without drifting, and that all clients remain synchronized.

## Scope
This specification is for the PK presentation layer. Existing LiveKit dual-room connectivity, server-authoritative PK timer, shared chat and cross-room moderation remain intact. It does not authorize changing the deferred payment integration or gift/Beans monetization configuration.
