# WyCut v51 — Creator Toolbar Tools

## Added
- Expanded the horizontally scrollable editor toolbar with Beat, Keyframe, Speed, In/Out, Combo, Overlay, Captions, Filters, and Voice entries.
- Beat tool: add, deduplicate, sort, and remove playhead-time beat markers. Markers are included in the exported `Project.json`.
- Keyframe tool: record timestamped scale and rotation keyframe data and remove keyframes. Data is included in `Project.json`. **The current MP4 renderer does not yet interpolate these keyframes into rendered pixels.**
- Speed tool: added 0.25× quarter-speed slow motion. Video timing and audio tempo filters support the slower rate during MP4 rendering.
- In/Out tool: fade-in/fade-out duration controls and a quick cinematic-fade preset; fades are applied by the MP4 renderer.
- Combo tool: applies paired filter/effect looks and records a transition choice. **Clip-to-clip transition rendering is not yet implemented in the MP4 renderer.**
- Quick Filters panel and clearer Overlay/Captions/Voice tool entry points.

## Validation
- TypeScript transpile syntax checks passed for the four changed TS/TSX files.
- Static storage/cost, file, PWA, and editor-layout audits passed.
- Full Next.js build/typecheck and Android runtime/export testing were not run because dependencies and device runtime are not available in this workspace.
