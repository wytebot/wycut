# WyCut v34 — Drive-first project home and UX hardening

## Implemented
- Opening `/` redirects to Google login; after sign-in the default destination is the Drive-backed project home. Protected studio/history/billing paths redirect to login when no local Firebase ID token is present.
- The Drive-backed home lists WyCut project folders directly from the connected Google Drive instead of using the local IndexedDB project list as the visible history. A prominent plus button starts a new local edit.
- New exports include `03_Master_Tracks/Project.json`, storing the script/timeline, editor settings and sound timeline metadata. New Drive projects can restore that manifest and downloaded sound assets, then ask the user to select the original video again (source video is intentionally not stored on WyCut servers or copied to Drive unless exported as an output).
- Added a Continue editing action for Drive projects with a valid manifest. Older exports without `Project.json` remain viewable/downloadable but cannot restore editor settings automatically.
- Drive project deletion now removes child files/folders recursively after explicit confirmation, rather than only removing the root folder.
- Legal pages are reachable from the collapsible menu; legal links were removed from the editing workspace. URL/subtitle workflows are no longer presented as primary editing flows; the studio starts in video-file mode.
- Reduced landing-page copy by redirecting the root route to login and made the editor logo return to project history.
- Retained IndexedDB for in-progress local checkpoints and paid-result caches; Drive is the visible saved-project history. This is intentional because temporary source videos and working blobs remain local.

## Cost and reliability checks
- Existing server-side script/transcription/narration credit reservations, provider rate limits, response validation and refunds remain in place. Local clip cutting, crop/ratio changes and sound synthesis do not invoke AI APIs.
- Added manifest validation and user-readable errors when a Drive project is missing or malformed.
- Existing static audits passed: file/config, generation regression, pricing, PWA, trial policy and v32 reliability. TypeScript syntax transpilation passed for changed TS/TSX files.

## Known production blockers — do not describe these as finished
- Full dependency-backed `tsc`, ESLint, Next production build, browser integration tests and Android APK build were not run because project dependencies are unavailable in this environment.
- Watermark, text and emoji overlays are still preview-only; the current MP4 renderer does not burn them into exported video. Therefore watermark-free export credit charging and server-enforced paid gating for local-only fonts/sounds are not enabled. A client-only feature cannot be made tamper-proof without server-rendered output or a server-issued permit that is checked by the renderer. Do not charge users for these features until export compositing and the credit flow are implemented and tested.
- Drive OAuth tokens expire. Users may need to reconnect Drive before listing, restoring, exporting or deleting projects.
- The Drive home lists exported project folders. In-progress work is still checkpointed in IndexedDB and is not shown as a Drive history item until the user exports a kit.
- Automatic compression of very high-resolution input before opening the editor is not yet implemented; the app keeps its existing source-size guard and local FFmpeg safety limits.
