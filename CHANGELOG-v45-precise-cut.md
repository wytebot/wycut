# WyCut v45 — manual precise cutting + more editing tools

## Cutting (the main fix)
- The video now opens as one clip. Split, trim and delete work straight away; no AI script or SRT is needed.
- **Split cuts at the playhead.** Before, Split cut the selected scene in half by time, wherever the playhead was.
- Cut points snap to whole frames. Frame rate is measured while the video plays (29.97, 23.976 and 59.94 are handled exactly), so a cut lands on the frame you see.
- Timeline header: back/forward one frame, Split, Delete. The time shows `mm:ss:ff`.
- Drag the white handles on the selected clip to trim. Haptic tick on grab/release/split.
- Removed parts are dimmed with stripes. Preview playback jumps over them, so what you watch is what exports. The clock beside Play shows the final length.
- Pinch the timeline to zoom (up to 16x, frame level).
- **Precise cut is now the default** (Fast cut was on before, and starts up to a keyframe early). Verified with ffmpeg on a 29.97 fps clip: 7 test cuts gave exactly the expected frame counts. The old settings were off by one frame on 4 of 7.
- Export cuts on demand. It re-cuts automatically when the edit changed, so the export always matches the timeline. Drive is optional now: with no Drive connected, the MP4 is saved to the device.

## New tools
- **Adjust** (new tool): Brightness, Contrast, Saturation, Temperature, Sharpness, Vignette. Live in the preview, applied on export, saved in Project.json, covered by undo/redo.
- **Volume** (Edit tool): clip volume 0–200%, fade in, fade out. Mute now applies to the export.
- Speed now reaches the export (range 0.5x–2x; ffmpeg's audio tempo filter does not go lower). Fade-out timing accounts for speed.
- Tool bar scrolls sideways, so more tools fit.

## Not done / limits
- Not built or run on a device. `npm install` and `next build` were not possible here. Changed files were type-checked against stubs, the static audit scripts were run (all pass that passed before), and the cut maths and ffmpeg arguments were tested directly.
- A precise cut re-encodes, so it is slower than Fast cut. ffmpeg.wasm is single-threaded, so it will not match native CapCut speed.
- Frame rate shows 30 until the video has played about half a second. Press play once before cutting long 29.97 fps videos.
- Move/reorder is still Edit → Move back/on. Dragging clips to reorder is not built. Preview plays in source order.
- Preview does not show Sharpness; it is in the export.
- Extra images/videos added to the timeline are still not composited into the export (unchanged).
