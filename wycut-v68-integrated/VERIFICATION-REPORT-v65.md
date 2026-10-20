# WyCut v65 verification report

## Passed

- `node scripts/test-timeline-model.mjs`
- `node scripts/audit-v65-persistent-timeline.mjs`
- All existing `scripts/audit-*.mjs` scripts
- Manual whitespace/conflict-marker inspection (the extracted folder is not a Git working tree, so `git diff --check` is unavailable).
- ZIP integrity after packaging

## Unverified / blocked

- TypeScript, ESLint, Next.js build: dependencies are absent (`next`, `react`, Capacitor and others cannot be resolved by the global `tsc`).
- Capacitor sync / Gradle APK or AAB build: no `android/` project or Gradle wrapper is included in this supplied project tree.
- Actual Android gesture/haptic tests, playback FPS, audio sync, memory pressure and app-kill recovery: no physical device test was run.
- Google Play Billing: no native Android billing integration is available in this archive. Existing server credit endpoints are not equivalent to Play receipt validation.
- Export-success-only settlement and refunds: the current client renders locally, so a server cannot independently prove that a client successfully saved the file. A client-callable refund endpoint alone would be abuseable; this remains a backend/native settlement design blocker.
- Preview/export effect parity: FFmpeg export paths exist, but no automated frame-difference run could be performed without the installed WASM/runtime dependencies and a test media fixture.

## Risk note

Undo/redo is no longer truncated at 60 snapshots and is persisted in IndexedDB. Very long sessions can consume significant local storage. History audio blobs are deduplicated by track ID, but snapshot metadata and edit scripts still grow with edit count. Device quota failures must be tested on Android.
