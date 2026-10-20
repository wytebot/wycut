# WyCut v53 — Still-image projects and export choice

- The editor's source picker now accepts PNG, JPEG/JPG, and WebP as well as MP4/M4V/MOV.
- A still image opens as a five-second edit canvas and can be exported through an explicit choice: one edited PNG image or a five-second MP4.
- Still-image video output uses the same FFmpeg renderer as video projects, applying output aspect ratio/quality, supported filters/effects, text/sticker/watermark overlays, and animated keyframes. It has no source audio by default.
- Static PNG export applies canvas/aspect/crop, supported CSS-preview filters, text/sticker/watermark, mirror, and the keyframe transform at the current playhead time.
- 2K still-image and image-to-video exports use the same authenticated, separate, idempotent 2K export-credit charge as 2K video export.
- When Google Drive is connected, the original image, edited PNG/MP4, and project manifest are included in the Drive export with correct image/video MIME types.
- Added `npm run audit:v53` for static image export checks.

## Validation

- TypeScript transpile syntax checks passed for changed TS/TSX files.
- Existing file, PWA, editor-layout, storage/cost and v51 export audits passed.
- New image-only export audit passed.
- A system FFmpeg smoke test produced a 720x1280, five-second MP4 from a still PNG. This validates the underlying FFmpeg command shape, not the bundled FFmpeg WebAssembly or Android APK runtime.
- Full Next.js build, dependency-backed typecheck, live Firestore credit transaction, Drive upload and Android APK testing remain unverified in this environment.
