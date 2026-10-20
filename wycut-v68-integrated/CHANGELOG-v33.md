# WyCut v33 — Timeline & Overlay Controls

- Added a dedicated clip editor panel to the recap workspace.
- Clip blocks can be dragged or moved left/right to adjust playback order.
- Selected clip source start/end timestamps and narration/title can be edited.
- Added a split action that divides a selected scene at its midpoint and splits the narration text.
- Added timeline zoom, preview crop mode, mirror preview, text overlay preview, emoji overlay preview, font selection, and WyCut watermark preview.
- Preserved existing login, billing, credits, Google Drive, sound library, and local FFmpeg workflows.

## Important implementation boundary

Overlay text, emoji, mirror/crop preview, and watermark currently configure the editor preview. They are not yet composited into the exported MP4. Re-cut the clips after changing source timestamps/order. A credit charge for watermark-free export is not enabled in this version; do not advertise watermark-free exports as a paid rendered feature until the export renderer and server-side credit reservation are implemented and tested.

## Validation

- Static app/config audit passed.
- v32 reliability audit passed.
- generation, pricing, PWA, and credit-policy static audits passed.
- ZIP integrity checked.
- Full TypeScript/build/browser/Android validation not run because node_modules are unavailable in the build environment.
