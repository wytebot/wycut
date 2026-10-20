# WyCut v68 — integrated timeline, visual layers, audio mix and billing safety

## Implemented

- Materializes a versioned `TimelineProject` from the current editor's main clips, added video/image assets, sound tracks, filter state and text/template state. The model is persisted in the IndexedDB project edit state and is used to resolve visual/audio clip positions for export.
- Added a dedicated video/image overlay lane to the timeline. Additional assets can be selected, long-press dragged with snapping/drop guide, and their start/duration edited from the media panel.
- Preview displays each added visual asset only during its configured timeline interval. The MP4 renderer accepts multiple independent image/video layers, keeps transparent letterboxing, maps layers across kept main-track segments, time-gates them, and applies project speed to their timing.
- Added synchronized audio-track preview. Export mixing now trims source offsets, honors clip timing, applies per-track volume/fades, and mixes tracks with the source audio. Removed the old hard-coded 12-audio-track cap.
- Contextual bottom toolbar filters tools when an audio or video/visual clip is selected. Tapping a selected video/visual clip again clears the selection.
- Fixed a billing replay vulnerability: an export attempt whose credits were already refunded can no longer be replayed as `alreadyCharged` for free.
- Pinned dependency ranges to the exact versions already declared in the source package manifest. No lockfile could be generated because registry metadata/dependencies were not available in this environment.
- Added timeline integration, motion-render and audio-mix verification scripts.

## Verification

- `npm run test:all-static`: passed.
- All `scripts/audit-*.mjs` scripts: passed.
- TypeScript/TSX transpile syntax check: 72 files parsed with zero syntax diagnostics.
- FFmpeg motion fixture: 20 frames rendered with two independently timed overlay clips; 11 distinct frame hashes during motion.
- FFmpeg audio fixture: source audio plus delayed/trimmed/faded second track rendered successfully.
- Full TypeScript typecheck, ESLint, Next.js build, Capacitor sync and Gradle build could not complete because `node_modules` is absent and package installation failed in the network-restricted environment.
- Flutterwave v4 live/sandbox E2E could not run: this workspace has no `.env` and the required merchant credentials / deployed API URL are not configured. The contract audit is static only.

## Remaining risks

- The legacy recap-beat state remains the compatibility source for the main cut list; the versioned timeline is not yet the sole canonical state for every main-track edit operation. Main-track trim/split/delete/undo must be migrated fully before claiming the single-source-of-truth requirement is complete.
- Motion test exercises FFmpeg's temporal overlay pipeline and checks the app renderer wiring, but does not run the actual FFmpeg WASM bundle in an Android WebView or prove pixel-identical browser preview/export for every filter, effect and text animation.
- Some catalog animations and visual effects still have different preview and export implementations. Per-letter/word animation and several advanced CapCut parity tools remain incomplete.
- No real Android device, export delivery/share-sheet cancellation, Firestore refund transaction, or live Flutterwave transaction was tested.
