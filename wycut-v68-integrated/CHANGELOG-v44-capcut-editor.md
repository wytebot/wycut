# WyCut v44 — CapCut-style editor

## What changed
- The editor is now one full-screen, no-scroll screen: top bar (close, credits, quality, Export) → preview → play/undo/redo row → timeline → bottom tool bar. The long scrolling page of cards is gone.
- Tool bar cut from 12 buttons to 6 that fit one row: Edit, Audio, Text, Stickers, Effects, Canvas. Tapping one swaps the bar for a compact panel (✓ closes it). Filters, Effects and Transitions are tabs inside Effects; Font and Animation are tabs inside Text.
- Real timeline: fixed centre playhead, tracks scroll beneath it, drag to scrub, frame thumbnails, scene blocks on the video track, audio and text tracks, zoom −/+.
- The main preview now shows the chosen filter, effect, text (with font + animation), emoji, sticker and watermark live. (Before, this only appeared in a tiny box far down the page.)
- Undo / redo now works for script edits, audio layers, text, looks and canvas.
- Built-in synthesized sounds removed. Audio is picked from the device only (MP3, WAV, M4A, AAC, OGG, FLAC), with per-layer volume, start time and delete.
- AI & project sheet (✦ AI clipper): generate recap, free on-device cut, save rough cut, mix audio, script/JSON, project name, replace video, fast cut, Drive, added media, cut clips. "Auto captions" and "Remove silence" buttons were removed because they did nothing.
- Premium fonts (Display, Handwritten, Arabic-friendly, Serif display) and sticker packs were priced server-side but unreachable from the UI. They are now selectable and unlock through the existing endpoint.
- New Edit actions: Delete, Duplicate, Trim ± steppers, Move, Split, Speed, Mirror, Fit/Fill.
- Floating app menu button is hidden while the editor is open so it no longer covers the tool bar.
- Cancel for AI jobs moved into the progress strip.

## Not changed
- Colors: only existing tokens (#080a10, #111521, violet accents).
- Credit prices, unlock endpoint, export pipeline, Drive project format.

## Honest limits
- No npm install, typecheck, next build or device test was possible in the authoring environment. Files were syntax-checked, checked for undefined names against stubs, and run through the static audit scripts. Please run `npm run typecheck`, `npm run build` and test on a real Android device.
- Timeline is on source-video time. Scene blocks show which parts of the source each clip uses. Dragging blocks to reorder is not implemented; use Edit → Move.
- Preview speed and Mute clip affect the preview; confirm export behaviour before promising them.
- Premium sound pricing in config/credit-pricing.json is now unused.
- scripts/audit-v38-export-parity.mjs already failed before this release (stale policy text) and still does.

## v44.1 — faster cutting and fewer UX killers
- Video engine preloads in the background once a video is open, so the first cut starts at once instead of waiting on "Loading local FFmpeg…". Core files are cached in memory, so a restart of the engine no longer re-downloads them.
- Cut progress no longer jumps back to 0 for every clip; the bar and "Clip 3 of 12" now move forward together.
- Cut commands skip subtitle/data streams and the extra `+faststart` rewrite pass; clips are no longer copied twice in memory before saving. Re-encoded clips use `yuv420p` so they play everywhere.
- On phones the engine's memory is released after a cut finishes, so the next cut or export does not run out of memory (it reloads from cache).
- Timeline thumbnails wait while a cut or export runs and are skipped for videos over 600 MB, so they never compete for the decoder.
- The editor re-renders once a second while playing instead of four times a second.
- Premium filters, effects, fonts, animations, transitions and sticker packs now ask "Unlock X for N credits?" before charging. Items already unlocked on the device apply instantly with no prompt.

Not changed / still true: this is single-threaded WebAssembly, so a re-encode (frame-accurate cut or canvas reframe) is much slower than Fast cut. Keep Fast cut on for speed; clips may start a second or two early. Not built or run on a device here.
