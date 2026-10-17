# WyCut reliability + Capacitor audit

## Changes applied in this revision

### Capacitor / APK architecture
- Changed the Android app from a remote WebView wrapper to a **bundled static UI**. This keeps the Capacitor bridge on the local app origin and avoids relying on a production `server.url` override.
- Added a guarded static-export script that temporarily moves server-only API routes and middleware out of the Next.js app, builds `out/`, and restores the API files even when the build fails. The normal server deployment still keeps the API routes.
- Added `NEXT_PUBLIC_API_BASE_URL` so the APK's bundled UI calls the deployed HTTPS API server.
- Added explicit CORS/preflight handling for the bundled Android origin and an origin allowlist (`CAPACITOR_ALLOWED_ORIGINS`). The API server must be deployed with `https://localhost,capacitor://localhost` allowed.
- Added a reproducible Android debug build script and GitHub Actions workflow. It generates the Capacitor Android project, syncs plugins/assets, uses Java 17, and uploads the APK artifact. It fails early when required API/OAuth/Firebase configuration is missing.
- Added Capacitor Filesystem, Share, and Browser plugins: small files can be saved/shared from Android, and the exported Drive folder opens in the native browser. Large video files should use direct Drive export to avoid base64 memory spikes.
- Added mobile viewport sizing and conservative Android video memory limits.

### Workflow / processing
- Serialized FFmpeg operations to prevent concurrent jobs from overwriting shared in-memory files; progress listeners and temporary files are cleaned up.
- Corrected clip duration arguments, added video/audio mapping and fast-start MP4 metadata, and restricted source formats to MP4/M4V/MOV.
- Native Android local FFmpeg source limit is 100 MB; desktop/mobile browser limit is 700 MB. These are guardrails, not a guarantee that every codec/device combination can process a file.
- Added source duration validation before slicing to catch subtitle/video timeline mismatches early.
- Split narration into small API batches, limited batch payload size, removed duplicate full-track base64 from server responses, and assemble ordered audio blobs in the client. This reduces the chance of serverless response-size failures and Android memory spikes.
- Added an explicit “URL transcript unavailable” state rather than a clickable control that implies URL scraping works. Users must upload authorized SRT subtitles.
- Added native per-file save/share controls instead of triggering many Android downloads at once.
- Fixed Google Drive resumable upload to include a `Content-Range` header; kept uploads sequential with timeouts and clear expired-token errors.
- Added best-effort per-process rate limits to script, narration, charge, and PIN/OTP routes.

## Static checks performed

- ZIP extraction and static required-file audit passed.
- TypeScript/TSX transpile syntax scan: 21 files checked, zero syntax diagnostics.
- `npm install --ignore-scripts --no-audit --no-fund` timed out in this environment. Consequently, dependencies were unavailable and a full typecheck, lint, Next.js build, Capacitor sync, Gradle APK build, and live integration tests **could not be completed here**. Do not interpret the syntax scan as a successful typecheck or build.

## APK build setup

1. Deploy the normal Next.js server app (with API routes) to an HTTPS host.
2. Set the backend environment variable `CAPACITOR_ALLOWED_ORIGINS=https://localhost,capacitor://localhost` on that deployment.
3. In GitHub repository Actions secrets, add:
   - `NEXT_PUBLIC_API_BASE_URL`: the deployed API origin, e.g. `https://your-wycut-domain.example` (no `/api` suffix).
   - `NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID`: the Google Web OAuth client ID used for native Google sign-in and Drive scope.
   - `GOOGLE_SERVICES_JSON_BASE64`: base64 of the Android `google-services.json` generated for Firebase project `wycut5` and package `app.wycutrecap.vercel`.
4. Push to `main` or run **Actions → Build WyCut Android APK → Run workflow**. The workflow generates Android sources and publishes an artifact named `wycut-debug-apk`.
5. The workflow builds a **debug APK**, not a Play Store release. Configure a release keystore/signing workflow separately before distribution.

## Critical blockers before public/live launch

1. **Authentication and ownership:** Google identity verification does not issue a persistent secure WyCut application session. Billing is not linked to an authenticated WyCut account.
2. **Flutterwave v4 contract:** the configured direct-card, PIN/OTP continuation, webhook signature, and verification URL must match the exact v4 API product enabled for the merchant. No raw card details should pass through WyCut unencrypted. Do not enable live charges until tested end-to-end in sandbox.
3. **Credit ledger:** verified payments are recorded idempotently, but the webhook intentionally does not credit recaps because there is no secure user-to-order mapping. Implement an account-linked transactional entitlement ledger before selling packs.
4. **Rate limiting:** the included in-memory limiter is only a best-effort single-process guard; it is not sufficient on serverless/multi-instance deployment. Replace it with a shared store and add authenticated quotas before exposing paid AI endpoints.
5. **TTS master track:** the full MP3 is assembled from MP3 segment blobs. Many players support this, but validate playback in CapCut and other target editors; normalize/re-encode with FFmpeg if compatibility problems appear.
6. **Captions timing:** SRT timing is estimated from narration word count, not aligned to actual generated speech. Use provider word timestamps or forced alignment for precise captions.
7. **Video cuts:** stream-copy cuts may snap to keyframes and are not frame-accurate. Rough-cut concatenation may fail when codecs/stream layouts differ. Test representative source files on the target Android devices.
8. **Drive recovery:** if an upload is interrupted after folders/files are created, a partial kit remains in Drive; session persistence and resume/cleanup UI are not yet implemented.
9. **Transcript URL ingestion:** intentionally not implemented. Use user-provided SRT or integrate an authorized transcript provider.
10. **Android OAuth config:** the Firebase Android config must match package `app.wycutrecap.vercel`, and Google Cloud OAuth must include the correct Android signing fingerprints. A debug build does not prove native Google sign-in works until installed and tested on a real device.
11. **Deployment limits:** test the chosen hosting plan's request duration, request-body limits, and AI provider quotas. The in-memory rate limiter is not distributed.

## Release gate

After configuring secrets, run `npm install`, `npm run typecheck`, `npm run lint`, `npm run build`, and `npm run android:debug` in a network-enabled environment. Then install the APK and test SRT upload, AI fallback, narration batching, file picker, FFmpeg, local save/share, Drive OAuth/upload, expired token handling, CORS, and all provider sandbox flows. Do not switch to live payments until payment verification and account crediting are transactional and idempotent.


## Billing implementation update

The billing update adds `/billing`, fixed-rate NGN price calculation, Google identity verification on charge/OTP/status requests, server-created Firestore orders, PIN/OTP continuation, transaction verification, idempotent credit settlement, and transactional recap-credit reservation/refund. Script generation now consumes one recap credit and refunds it if generation fails; narration requests must belong to that generated recap. The exact Flutterwave v4 card-encryption and endpoint payload contract remains merchant-specific and must be confirmed with a sandbox transaction before live charges.


## AI latency, operations and legal pages (this revision)

- Added configurable provider priority, bounded timeouts, output token ceilings, and automatic fallback for script generation. Default model names and safe prompt instructions are in `config/ai-operations.json`; optional remote config is validated, size-limited, cached for five minutes, and falls back locally on errors.
- Increased client narration batch concurrency from two to three while retaining bounded TTS workers on the server. Real-world latency depends on provider availability, quotas, source length and deployment limits; this is an optimization, not a latency guarantee.
- Added standalone `/privacy`, `/terms`, `/refunds`, and `/acceptable-use` pages and links in landing, dashboard and billing UI. Legal text is a template and needs business contact details and jurisdiction-specific review before launch.
- Added `staff-ai-ops-template/` for a separate repository containing only non-secret AI model/prompt configuration. Staff can receive access to that separate repository without access to app source. GitHub permissions are repository-level, so do not give them write access to the main app repository if they must not modify the app.


## URL source workflow (v7)

The dashboard now downloads direct HTTPS MP4/M4V/MOV URLs into device memory when the host permits browser CORS, accepts public SRT/VTT/text transcript URLs, and allows subtitle-file upload. The source is sliced locally with FFmpeg, then cut sections can be uploaded directly to Drive even if narration has not been generated. YouTube/TikTok watch-page URLs are detected and explained rather than scraped: this project does not use a platform-bypass downloader, and automatic platform transcript discovery remains unsupported.
