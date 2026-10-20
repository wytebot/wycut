# WyCut v56 — masking, video overlay, AI provider billing and persistent login

- Added a video overlay track that is composited into MP4 export and included in Drive project manifests for restoration.
- Added rectangle, ellipse, split-screen and invert masks, with configurable feathering.
- Added manual brush/remove and restore/eraser mask strokes. The mask repeats over the clip and is most reliable for fixed-camera footage.
- Added chroma-key background removal controls (key colour, similarity and blend).
- Added a server-side AI background-removal provider adapter. It charges credits before calling the provider, estimates cost from duration and file size, and attempts an additional charge if the provider reports higher actual cost. Requests remain charged once provider processing starts. Provider configuration is required before AI removal is available.
- Added persistent Firebase Auth storage with IndexedDB/browser-local fallback, automatic session restoration on the login page, and a protected-route guard that waits for session restoration. This applies to browser and Capacitor Android WebView sessions.
- Added `npm run audit:v56` static checks.
- Kept the previous duration-aware script/transcription pricing and transcript sampling optimization.

## Validation

Passed: file/config audit, storage/AI cost guard audit, credit pricing audit, v51 editor/export audit, v53 image-export audit, and v56 feature/auth static audit.

Not verified in this environment: full Next.js production build, full TypeScript check with dependencies installed, Android APK runtime, real FFmpeg rendered output, or live AI-provider billing. The project dependencies were not installed in this environment. AI background removal requires the server environment variables documented in `BACKGROUND-REMOVAL-PROVIDER-v56.md`.
