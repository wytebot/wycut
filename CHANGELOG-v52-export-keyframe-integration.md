# WyCut v52 — Export, Keyframe and Transition Integration

- Implemented real scale/rotation keyframe interpolation in the FFmpeg export filter chain and mirrored interpolation in the live editor preview. Added text overlay horizontal/vertical positioning, drag-to-move, two-finger pinch-to-resize, scale and rotation controls; these values persist in project JSON and are applied in both preview and export. Added rendered text-overlay animation for fade, slide, bounce, rotation, flash/flicker and neon-glow, plus fade-in treatments for pop/elastic/typewriter/heartbeat presets. Typewriter is currently a fade-in rather than a per-character reveal, and some catalog animations still use a nearest supported/static treatment.
- Maps source-time keyframes into the assembled cut timeline so trimmed/deleted ranges do not shift keyframe timing unnecessarily.
- Applies selected transition treatments at clip boundaries in the rendered video: dissolve-to-black/fade-in, flash, zoom-in, glitch cut, light leak, whip-pan rotation, and film-burn flash. These are rendered effects; dissolve/fade is a brief fade through black, not a true overlapping cross-dissolve. The transition picker now shows only supported choices rather than exposing presets that were not wired into the renderer.
- Export quality is now part of the render plan: 720p, 1080p, and 2K output dimensions are applied to the clip slicer and final MP4 renderer, including overlay dimensions and quality-aware encoding settings.
- 2K exports use a separate authenticated server-side 5-credit charge, after successful rendering and before download. Ledger IDs are deterministic per user/export attempt, preventing duplicate charges on retried requests. Insufficient balance prevents download and points users to top-up.
- Added mobile/browser safety caps for 2K export duration and source size to reduce memory crashes.
- Captions tool now exports valid timestamped SRT files from clip titles/narration instead of running a no-op button. Karaoke-style burned-in captions remain a separate unfinished feature.
- Added `npm run audit:v51` checks for the new export integration. Combo presets now use free assets only, so they cannot bypass server-side premium-asset credit checks.

## Verification limits

Static audits and TypeScript syntax transpilation can be run locally. A full Next.js build requires dependencies and production environment variables. The new FFmpeg filters, actual 2K output, Google token verification, Firestore transactions, and Android WebView performance still require end-to-end testing with a real sample video and configured Firebase project.
- Mapped the complete visible filter/effect catalog to export-side FFmpeg filters and filled in missing preview mappings, so selecting a catalog item no longer silently falls back to the original image.

## Known remaining work

- Additional video/image timeline assets are saved with the project/Drive kit but are not yet composited as timed overlay tracks into the final MP4. The UI now states this limitation rather than implying otherwise.
- Captions export as timestamped SRT; burned-in karaoke/word-by-word captions are not implemented.
- Some animation presets use a supported approximation (for example, Typewriter currently fades in rather than revealing each character). The dissolve preset fades through black and is not a true overlapping cross-dissolve.
- The local FFmpeg WASM export path has been tested against the host system FFmpeg filters, not end-to-end inside the deployed Capacitor WebView. Real Android memory/performance and Firebase charge verification still require a configured deployment and device test.
