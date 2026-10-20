# WyCut v62 — Creator Tools & Asset Entitlements

## Added
- Expanded animated, editable text templates for creator end cards, news alerts, celebrations, typewriter/terminal text, popups, product reviews, recipes, travel, and cinematic titles.
- Added explicit PRO labels to premium templates; applying premium templates routes through the existing server-backed animation unlock flow.
- Added 20 additional filters and 18 additional visual-effect presets, with preview mappings and export filter mappings for the added filters.
- Extended the server-configured premium inventory for selected filters, effects, and advanced animations while preserving the existing unlock-on-apply billing model.
- Added `npm run audit:v62` static verification.

## Notes
- These presets use local CSS/FFmpeg-compatible filters; they do not download third-party effect assets.
- Text animation is previewed live in the editor. Some presets share animation primitives; the number of named presets is not the same as the number of unique animation engines.
- This pass does not claim a complete CapCut-equivalent timeline effect-duration/keyframe implementation. Full Next.js build, browser playback/export, and native APK tests require installing project dependencies and running on target devices.
