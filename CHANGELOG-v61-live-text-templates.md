# WyCut v61 — Live text templates and animation expansion

- Added 39 editable text template presets across News, Creator, Celebration, Typewriter, Popups, and Lifestyle.
- Presets insert editable sample text and select a matching animation; template cards animate live rather than using static thumbnails.
- Expanded text animation choices from 61 to 120 named presets and mapped the added choices to live CSS animation classes/keyframes.
- Replaced the small diamond-only indicator on premium asset tiles with a readable PRO badge. Existing server-side premium unlock flow remains the authority for gated assets.
- Validation: TypeScript transpile syntax checks passed for touched TS/TSX files; v58/v59/v60 static audits passed. Full Next.js build, browser runtime, APK test and rendered export test were not run because project dependencies are not installed.

## Known limitation
The editor currently stores filter/effect/animation selections as clip/editor settings rather than independent timed effect segments. This release does not claim that the requested CapCut-style horizontal effect-duration handles are implemented; those require a timed effect-track data model and export/render integration. Keyframes remain placed at the current playhead and can be removed/repositioned by adding another at the desired time.
