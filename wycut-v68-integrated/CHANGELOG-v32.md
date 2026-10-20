# WyCut v32 — Large-source safety and sound timeline

- Fixed a duplicate `async` token in the download helper that prevented the TypeScript source from parsing.
- Kept large source videos disk-backed through FFmpeg WORKERFS when the runtime supports it; large fast-cut failures no longer automatically fall through to a potentially memory-heavy re-encode.
- Reduced local rough-cut concatenation thresholds to 60 MB for mobile/Capacitor and 180 MB for desktop to lower WebView/browser crash risk. Large selections can still be saved as individual clips.
- Added a fullscreen CapCut-inspired sound browser with 216 locally synthesized sound-design presets across moods, emotions, animal-inspired effects, nature, objects/foley, impacts, cinematic, sci-fi, horror, comedy, fantasy, ambience, transitions, and UI/alerts.
- Sound previews and generated effects run locally; no sound-generation API or AI credits are used. The catalogue is clearly labelled as synthetic sound design, not a collection of real animal/environment recordings.
- Added device audio import with preview-before-add, audio timeline layers, editable start offsets and volume, local FFmpeg audio mixing, and sound assets/timeline metadata in the user's direct-to-Drive export.
- Kept Google login, billing, credit handling, app colours, local project operations, Drive integration, and Capacitor/browser file input flows.

## Verification status

- TypeScript transpile/syntax checks passed for modified TS/TSX files.
- Static v32 regression audit added.
- Full `npm run typecheck`, production build, browser integration tests, and Android APK build could not be run in this environment because dependencies are not installed and the npm registry/cache is unavailable. These are still required before production deployment.
