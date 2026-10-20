# WyCut v48 — Native-feeling editor picker UX

- Replaced the browser-native HTML `<select>` export-quality dropdown with an in-editor, app-styled popover for 720p, 1080p, and 2K.
- The quality picker stays inside the editor; it does not navigate to a page or display a browser-style select control.
- Media inputs remain visually hidden behind WyCut's app-styled controls. On Android Capacitor, choosing a file delegates to Android's system document/media chooser; in a browser, it delegates to the operating system's file dialog. These platform pickers are necessary to grant access to files and are not an in-app browser page.

## Verification

- `node scripts/audit-v42-editor-layout.mjs` — passed.
- `node scripts/audit-v35-drive-export.mjs` — passed.
- `node scripts/audit-v38-export-parity.mjs` — existing audit failures: pricing asset policy and client-side premium charge claim; not related to picker UX.
- Production build could not be run because dependencies are not installed; `npm install --ignore-scripts --no-audit --no-fund` timed out in this environment.
