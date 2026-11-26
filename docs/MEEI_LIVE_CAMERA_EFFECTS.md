## Goal
Implement real, native, pre-publish camera processing for MEEi Live while preserving the existing LiveKit transport and secure server-issued tokens.

## Product requirements
### Live Background Theme Studio
- Creator selects a realistic preset theme (e.g. warm living room, modern studio, cozy cafe, garden, podcast studio) with live preview.
- Themes are composited behind the creator; do not merely render a static overlay on top of the video.
- Preserve hair strands, face, ears, neck, shoulders, hands and body. Use temporally stable person segmentation and edge refinement.
- Match color temperature, exposure and subtle shadows to avoid a sticker/green-halo look.
- If segmentation confidence drops, lighting is too poor, motion blur is high, or device performance is insufficient: gracefully fall back to original camera; optionally offer subtle background blur only when stable. Never show visibly broken cutouts.
- Theme selection and processing happen on-device before publishing; do not upload raw frames to a third-party processing service.

### Natural Face Filter
- Separate Live-only face filter system; video calls retain their own Natural Glow HD default.
- Default Live preset is subtle/natural; preserve identity, complexion and skin texture.
- Face landmarks must remain attached to eyes, eyebrows, nose, lips and facial contours while speaking, blinking, smiling and turning.
- No facial-feature drift, detached lips/eyebrows, jitter, warping or expression distortion.
- Reduce/disable effects when tracking confidence is low; never freeze facial expressions.

## Technical constraints
- Keep LiveKit as the streaming provider and preserve current LiveKit room/token architecture.
- Current app uses Expo SDK 54, React Native 0.81, @livekit/react-native 3.2.x and @livekit/react-native-webrtc 150.x.
- Current LiveBroadcastModal uses LiveKitRoom with video={isCreator}; it does not yet expose a supported native frame-processing pipeline.
- Do not use browser-only @livekit/track-processors APIs in React Native without a verified native-compatible implementation.
- Evaluate native WebRTC frame processing integration for Android and iOS, supported SDK hooks, ML segmentation/face-landmark runtime, GPU acceleration, thermal/battery impact, licensing and app size before selecting dependencies.
- Keep raw camera frames on-device. No secrets or third-party API keys in the app.
- Provide an explicit effects-off/original-camera fallback and capability detection.

## Delivery phases
1. Spike: verify supported native frame processor hooks in the exact pinned LiveKit React Native/WebRTC versions; build a minimal pass-through native processor on Android and iOS.
2. Segmentation prototype: measure hair/hand edge quality and latency on low-, mid- and high-tier Android devices plus iOS.
3. Theme Studio: implement preset selection, preview, live switching and safe fallback.
4. Face filter: implement conservative landmark-anchored effects and tracking-confidence fallback.
5. QA: test movement, hands crossing face, glasses, different skin tones, low light, backlight, fast motion, camera switching, incoming call interruption, thermal throttling, 30/60 FPS, network adaptation and long live sessions.
6. Release only after physical-device QA; do not claim feature complete from UI-only controls.

## Acceptance criteria
- No visibly detached/misaligned facial effects during speech, blinking or head movement.
- No repeated hair/face/body cutouts in supported lighting and tested devices; safe fallback when confidence is poor.
- Processed stream is what viewers receive; creator preview matches outgoing stream.
- No raw-frame upload to external processing service.
- Existing LiveKit join/start/heartbeat/end/moderation flows remain intact.
- Document device capability tiers and known limitations.