# WyCut v42 — mobile editor layout pass

## Changed
- Reworked the mobile editor header to use compact close/search, credit/billing chip, quality selector, and export affordance while preserving the existing dark/purple theme tokens.
- Added a custom playback row below the preview, with play/pause, ratio, fullscreen affordance, and undo/redo controls disabled until history is wired.
- Added a searchable tool chooser, expanded horizontal tool strip (Edit, Audio, Text, Effects, Overlay, Captions, Stickers, Filters, Adjust, Speed, Canvas, Voice), tool drawer, and AI quick-actions sheet.
- Added reusable editor layout components: `EditorTopBar`, `PreviewStage`, `PlaybackBar`, `TrackRail`, `Timeline`, `ToolBar`, `ToolSheet`, `AIQuickSheet`.
- Added hook foundations `useTimeline`, `usePlayback`, and `useEditHistory` for the next interaction pass.
- Added mobile overscroll/touch/safe-area CSS and the v42 editor layout audit script.
- Preserved existing script generation, local auto-cut, audio library, edit-plan schema, Drive and export handlers.
- Added `MAPPING-v42.md` with the old-to-new control mapping.

## Important implementation gaps (not represented as complete)
This pass is a layout and interaction foundation, not a full CapCut-equivalent editing engine. The current `EditPlan` schema does not model multiple independently positioned media tracks, per-clip trim/reorder/reverse, transformable overlay geometry, per-clip mute, or transition durations. The current renderer only composites a static centered text/emoji/sticker/watermark overlay and selected video/audio filters; it does not render every preview animation, sticker asset, audio track, or transition. Those features must be added to the schema and FFmpeg composition before claiming every preview effect is present in the exported MP4. The undo/redo buttons are intentionally disabled until state mutations are routed through the history hook. Remove-silence currently reports its limitation rather than pretending to process media.

## Verification status
- Static source checks and ZIP integrity are run during packaging.
- Typecheck, ESLint, `next build`, Capacitor build and real-device tests could not be run in this environment because dependencies are not installed and external network access is unavailable.
