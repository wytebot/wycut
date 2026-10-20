# WyCut v59 — Continue editing from History

## Implemented
- Local History **Open** now navigates to `/dashboard` and requests restoration of the selected project.
- Source media is saved in a dedicated IndexedDB media store, rather than being rewritten with every edit-state save.
- The editable session auto-saves title, script, transcript metadata, export quality, canvas/aspect ratio, playback, filters/effects, text/sticker placement, keyframes, beat markers, audio levels/fades, masks, chroma key, and other editor settings.
- Original source video/image, timeline assets, video overlay, and audio track blobs are restored when a local project is opened.
- Generated clips and rough cut are retained only when their combined size is at most 60 MiB; larger generated outputs can be recreated from the saved source and script to avoid exhausting mobile storage.
- Drive project continuation remains supported through the existing `Project.json` restore path.

## Storage behavior
- IndexedDB schema upgraded to version 3 with a dedicated `projectMedia` store.
- History listing reads metadata only; it does not load large media blobs until a project is opened.
- Legacy project records with inline blobs are migrated to the separate media store on their next save.

## Validation performed
- Static TypeScript/TSX syntax transpilation passed for the modified files.
- `scripts/audit-v59-history-resume.mjs` passed.
- `scripts/audit-files.mjs` passed.
- Existing provider pricing, overlay/auth and image-export audits passed.

A full Next.js build, real-browser IndexedDB test and Android APK runtime test were not run because dependencies are not installed in this environment. Please run `npm install`, `npm run build`, and test History > Open in browser and rebuilt APK before release.
