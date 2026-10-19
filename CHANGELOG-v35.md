# WyCut v35 — Drive Restore, Timeline Additions, Export Progress

## Implemented
- Drive export now includes the original source video alongside the generated project kit.
- Editable `Project.json` schema v2 records the source filename and added video/image assets.
- History restore fetches the original source, saved media assets, sound layers, script and editor settings directly from Google Drive. Users no longer need to reselect a source video for projects exported with this schema.
- Added an **Add video/image** plus control to the media timeline and a media-asset strip with remove controls. Extra assets are persisted in Drive.
- Added an **Add sound** plus control in the sound timeline header.
- Export now opens a dedicated export screen with progress percentage, stage text, Drive link, and success mark after Drive uploads finish. Drive is required to persist the editable project and source for future restore.
- Drive upload helper now reports per-file progress into the export UI.

## Important limitations
- Additional image/video timeline assets are stored and restored, but the current MP4 renderer does not yet composite those extra assets into the final rendered video. The UI displays this limitation when assets are added.
- Export progress is file-based, not byte-accurate inside a single large file upload.
- A Google Drive OAuth token may expire; reconnect when prompted.
- Full dependency-backed typecheck, lint, Next.js production build, browser integration and Android build require project dependencies and a network-enabled test environment.

## Validation run in this workspace
- All static audit scripts passed, including the new v35 audit.
- TypeScript transpile syntax checks passed for the modified TS/TSX files.
- ZIP integrity check passed.
- `npm run typecheck` could not complete because the project dependencies/types are not installed (`next`, React and other packages are missing); it emitted cascading missing-module/JSX-type errors.
- `npm run build` could not start because `next` is not installed (`next: not found`). No production build or runtime/browser/Android claim is made.
