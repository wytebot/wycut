# WyCut v38 changelog

## Implemented

- Added `lib/editor/edit-plan.ts`: versioned `EditPlan` schema, normalization for older/missing plan data, shared preview CSS mappings, export filter chains, and explicit free/premium asset manifest in `config/credit-pricing.json`.
- Added `lib/ffmpeg/edit-export.ts`: FFmpeg WASM renderer for supported filter/effect chains, aspect/crop presets, mirror, constant speed, volume, fade in/out, and rasterized text/emoji/sticker/watermark overlays. It reports progress, removes temporary FFmpeg FS files in `finally`, and exposes cancellation.
- Wired the export page to render the rough-cut MP4 before device download and Google Drive upload; the `Project.json` manifest is schema version 3 and includes the normalized EditPlan while retaining legacy `settings` for backwards compatibility.
- Updated preview filters/effects to use the shared EditPlan mapping helpers.
- Bumped the PWA service worker cache namespace to `wycut-pwa-v38` so old cache generations are removed on activation.
- Added `scripts/audit-v38-export-parity.mjs` and `npm run audit:v38`.
- Added this audit and Android manual QA checklist.

## Safety decisions

- Export rejects sources above 90 MB on mobile and 220 MB in browser because the current FFmpeg WASM wrapper holds input/output buffers in memory. This is intentionally safer than claiming that 2 GB files can be rendered reliably.
- Premium asset pricing is defined as metadata only. No client-side charge is performed. Do not activate premium asset billing until server-side reservation, idempotency, completion settlement, and failure refunds are deployed and tested.

## Known limitations

- `xfade` transitions, animated text/stickers in the encoded video, speed ramps, auto-mixing/ducking of all sound tracks, additional image/video track composition, PiP/masks, freeze/reverse/stabilize, and streamed Filesystem output are not complete.
- Font fallback uses system/browser fonts; 20+ bundled font binaries with verified licenses are not included.
- A successful source-level audit does not guarantee the installed FFmpeg WASM binary contains every filter; runtime validation is required.
- Dependency-backed `typecheck`, lint, Next production build, static Capacitor build, Android debug build, and real-device tests were not possible because dependencies/toolchains were unavailable.
