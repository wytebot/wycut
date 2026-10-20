# WyCut v49 — IndexedDB and animated asset previews

- Kept editable project records, narration parts, and transcription chunks in IndexedDB; bumped the database version to 2 so existing installations create the new settings store on upgrade.
- Added a general IndexedDB settings store and moved the locally owned editor-asset list out of localStorage.
- Asset ownership is loaded asynchronously from IndexedDB and saved back there after an asset unlock.
- Filter and effect catalogs now use responsive rows/columns instead of a single horizontal strip.
- Animation choices now display in a grid. Hover, focus, or tap a catalog tile for a short preview; reduced-motion preferences are respected.
- Transition choices use a grid and briefly animate on hover/tap.
- Existing history behavior remains: working project history is stored locally in IndexedDB, while completed production folders are discovered from Google Drive and their content is read from Drive when opened.

## Verification

- Static TypeScript/TSX parse checks run for the changed files.
- Production build and live Google Drive/Firestore/APK behavior require installed dependencies and valid user credentials; they were not represented as tested here.
