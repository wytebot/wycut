# WyCut v64 — Timeline interaction wiring

- Wired long-press (360 ms) drag initiation for video timeline clips and sound clips in the existing editor timeline.
- Video clip drags update the current script beat's source interval while preserving its duration and clamping to source bounds.
- Sound clip drags update the real `soundTracks` editor state and clamp placement to the source duration.
- Added frame-snapping toggle for drag placement and a fit-timeline-to-screen control.
- Added haptic feedback and drag lift styling; drag completion suppresses accidental click selection.
- Tapping the selected video or sound clip again clears selection. Delete now safely no-ops when no video clip is selected.
- Added `scripts/audit-v64-timeline-wiring.mjs` and `npm run audit:v64`.

## Verification and limitations

- Timeline model unit tests pass.
- All 23 pre-existing static audit scripts and the new v64 static wiring audit pass.
- Full TypeScript, ESLint, Next production build, Capacitor sync, Gradle APK build, and real-device tests remain unverified because dependencies could not be installed in this environment and the archive has no Android Gradle project/wrapper.
- Long-press interactions and audio/video placement need manual Android validation. This does not implement unlimited virtualized lanes, a shared GPU preview/export renderer, complete effect/export parity, or Google Play Billing.
