# WyCut — recap production studio

WyCut is a Next.js App Router + TypeScript app for generating original recap scripts from user-provided subtitles, generating narration and estimated SRT captions, locally slicing an authorized video source, and exporting a production kit directly to the user's Google Drive.

## Architecture

- **Web/backend deployment:** deploy the regular Next.js app. This deployment serves `/api/script`, `/api/narration`, Google identity verification, billing/status endpoints, and the authenticated WyBuild payment-confirmation endpoint. Flutterwave webhooks are registered only on WyBuild.
- **Capacitor APK:** the APK bundles the static UI in `out/` and calls the deployed API over HTTPS. The APK does not embed server secrets or try to run Next.js API routes locally.
- **Local media processing:** FFmpeg runs in the browser/WebView. Source videos are not sent to WyCut's API.
- **Google Drive:** browser/native OAuth requests the limited `drive.file` scope; selected production files are uploaded directly from the device to Drive.

## Run the web app

1. Use Node.js 20 or newer.
2. Run `npm install`.
3. Copy `.env.example` to `.env.local` and fill server-side AI, Google, Firebase Admin, and (only after sandbox setup) Flutterwave values.
4. Run `npm run dev`.
5. Before deployment, run `npm run audit:files`, `npm run typecheck`, `npm run lint`, and `npm run build`.

Never prefix private AI keys, Flutterwave secrets, or Firebase service-account credentials with `NEXT_PUBLIC_`.

## Build a Capacitor Android debug APK

### Backend prerequisites

1. Deploy the regular Next.js app to an HTTPS host, for example `https://your-wycut-domain.example`.
2. Set `CAPACITOR_ALLOWED_ORIGINS=https://localhost,capacitor://localhost` on the backend deployment so the bundled Capacitor app can call its API using CORS.
3. Ensure `NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID` is configured for the backend build and Google OAuth is set up for package `app.wycut.vercel`.

### GitHub Actions build

Add these repository **Actions secrets**:

- `NEXT_PUBLIC_API_BASE_URL`: the backend origin only, e.g. `https://your-wycut-domain.example` (do not append `/api`).
- `NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID`: the Google Web OAuth client ID used by the native Google sign-in plugin.
- `GOOGLE_SERVICES_JSON_BASE64`: base64-encoded `google-services.json` from Firebase project `wycut5`, configured for Android package `app.wycut.vercel`.

Push to `main`, or open **Actions → Build WyCut Android APK → Run workflow**. The workflow installs dependencies, builds a static UI, generates/syncs the Android project, uses Java 17, builds a debug APK, and uploads the `wycut-debug-apk` artifact. The Android folder is generated during the build and is intentionally ignored in Git.

### Local build

On a machine with Node.js, Android SDK, Java 17, and Android build tools installed, set the same environment variables and run:

```bash
npm install
npm run audit:files
npm run android:debug
```

The APK is created at `android/app/build/outputs/apk/debug/app-debug.apk`. This is a **debug build**, not a Play Store-signed release. Add a protected release-keystore workflow before public distribution. Do not commit `google-services.json`, service account keys, API keys, or keystores.

## User workflow

1. Provide a public HTTPS direct video-file URL (MP4/M4V/MOV) that permits browser downloads, or choose an authorized local video file. The URL downloads into device memory; WyCut does not store the source video on its server.
2. Provide a public SRT/VTT/text transcript URL, or upload a subtitle file. Generate a recap script using the configured fast model and provider fallback.
3. Generate narration/captions if desired; captions are timed to audio segment duration with estimated within-segment timing, not word-level forced alignment.
4. Slice the source locally with FFmpeg re-encoding for frame-accurate boundaries (slower than stream copy).
5. Connect Google Drive and export the cut sections (and any generated narration/script) directly into the Drive production-kit folders.

Important URL limits: a YouTube or TikTok watch-page URL is not a direct media file, and their public APIs do not give this app a generic downloadable full-video URL. WyCut therefore does not scrape or bypass those platforms. For content you own or have permission to edit, use the platform's authorized export/download, then select that video file or use a direct-download URL from a host that allows browser access. Direct media/subtitle hosts must allow browser CORS access. The app currently does not auto-discover or download YouTube/TikTok captions from a watch page. Source safety limits are 80 MB in the Android APK, 100 MB in low-memory/mobile browsers, and 300 MB in desktop browsers because frame-accurate re-encoding uses additional memory. Accurate cut points require a timestamped SRT/VTT transcript. Plain-text transcripts can generate a script but cannot provide reliable source cut points.

## Environment variables

See `.env.example`. Important settings:

- `GEMINI_API_KEY`, `OPENAI_API_KEY`, `DEEPGRAM_API_KEY`: server-side AI provider keys/fallbacks. Keep model overrides blank if you want the operations JSON to control model names.
- `AI_OPERATIONS_CONFIG_URL`: optional HTTPS URL to `ai-operations.json` in a separate AI operations repository. For a private GitHub repo, use the GitHub Contents API URL and set `AI_OPERATIONS_CONFIG_TOKEN` to a fine-grained token with read-only Contents access. Config is cached for five minutes; local config is the fast fallback. Never put the token in the app or share it with staff. Set `AI_SCRIPT_PROVIDER=openai` or `gemini` only to force provider priority.
- `NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID`: Google OAuth Web client ID used for native identity and browser Drive access.
- `FIREBASE_SERVICE_ACCOUNT_JSON_BASE64`: server-only Firebase Admin credentials for payment records.
- `CAPACITOR_ALLOWED_ORIGINS`: allowed local app origins for API CORS.
- `NEXT_PUBLIC_API_BASE_URL`: only needed when building the bundled APK.
- `GOOGLE_SERVICES_JSON_BASE64`: only needed for the APK build workflow; contains Firebase Android config, not a server secret.
- Flutterwave: `FLW_CLIENT_ID`, `FLW_CLIENT_SECRET`, `FLW_ENCRYPTION_KEY`, and `FLW_V4_BASE_URL`; use the same merchant credentials and matching environment (sandbox or production) in WyCut and WyBuild. WyCut also needs `WYBUILD_WEBHOOK_SHARED_SECRET` for WyBuild-to-WyCut confirmation. WyBuild alone needs `FLW_SECRET_HASH` for the registered webhook.

## Payments and production blockers

The checkout, order ownership, encrypted card/PIN fields, v4 customer/payment-method/charge flow, PIN/OTP/redirect continuation, WyBuild webhook forwarding, per-user pending-payment lock, idempotent recap-credit ledger, and generation credit gate are implemented in code. The exact merchant v4 payload and encryption contract still require a successful sandbox test against your enabled product. **Do not enable live payments until that test passes.** See [AUDIT-AND-REMAINING-BLOCKERS.md](./AUDIT-AND-REMAINING-BLOCKERS.md) for the release gate.

## Main files

- `app/page.tsx` — landing page and pricing.
- `app/dashboard/page.tsx` — direct-video URL/local-file + transcript URL/SRT/VTT workflow, local slicing and Drive export.
- `lib/ai/script-generator.ts` — validated Gemini/OpenAI script generation.
- `lib/ai/tts-generator.ts` — bounded TTS provider calls and ordered narration segments; SRT captions use audio segment durations and estimated within-segment timing.
- `lib/ffmpeg/client-slicer.ts` — local frame-accurate H.264/AAC re-encoding and rough-cut assembly.
- `lib/drive/export.ts` — direct Google Drive resumable uploads.
- `lib/api-client.ts` — API origin resolver for web and bundled APK.
- `middleware.ts` / `lib/server/origin.ts` — CORS/preflight and allowed-origin checks.
- `scripts/build-capacitor-web.mjs` — safe static export with server routes restored afterward.
- `scripts/build-android.mjs` — Android project generation, sync, and debug APK build.
- `.github/workflows/android-debug-apk.yml` — automated debug APK build artifact.

## Flutterwave v4 billing and NGN pricing

- `/billing` sells **credit packs** (Starter $1/₦1,400 → 100 credits, Plus $3 → 330, Creator $7 → 800, Pro $15 → 1,800). Credits never expire and there is no subscription. Pack prices and per-action rates live in `config/credit-pricing.json`.
- The reference rate is fixed at **₦1,400 / USD** with **no extra gateway fee** (`gatewayFeeRate` = 0 in the config; set it to 0.02 to pass a 2% fee to customers). Action costs (v57): transcription is 1 credit per 80 seconds (typically 4 credits per 5 minutes), script generation starts at 34 credits (44 for transcripts over 60,000 characters, plus source/target complexity), and narration is 11 credits per 1,000 characters (~10–12 credits per spoken minute). New accounts get 30 welcome credits once (locked to account, normalised email and device; `FREE_TRIAL_DAILY_CAP` limits grants per day). Run `npm run audit:pricing` after any price change: it requires at least 75% estimated gross margin on example jobs at the cheapest credit price, using a conservative 1.5x provider/operations cost factor. This is a model-based estimate, not live invoice reconciliation; update `costModelUsd` from current provider pricing and observed usage. Gemini does not directly return a transparent video, so AI background removal is not active until a segmentation/matting pipeline is implemented. Manual masks and chroma key remain available.
- A Google ID token is verified server-side before an order is created. Orders are tied to the Google `sub`, not to a client-supplied email. PIN/OTP continuation checks order ownership.
- WyBuild is the only registered Flutterwave webhook. It verifies the transaction against Flutterwave v4, then forwards verified WyCut charges. WyCut validates the shared secret and matches the transaction against its Firestore order before atomically crediting `wycut_users/{google-sub}` once.
- Set `FLW_CLIENT_ID`, `FLW_CLIENT_SECRET`, `FLW_ENCRYPTION_KEY`, `FLW_V4_BASE_URL`, `WYBUILD_WEBHOOK_SHARED_SECRET`, `NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID`, and `FIREBASE_SERVICE_ACCOUNT_JSON_BASE64`. Set `NEXT_PUBLIC_API_BASE_URL`, `CAPACITOR_ALLOWED_ORIGINS`, and `GOOGLE_SERVICES_JSON_BASE64` only when building the bundled Android app.
- **Merchant-specific contract gate:** WyCut follows the same v4 customer → payment-method → charge structure used by WyBuild, encrypts card fields with AES-GCM using `FLW_ENCRYPTION_KEY`, and submits PIN/OTP continuation to `/charges/{id}`. These details must still be confirmed against the exact Flutterwave v4 product enabled for your merchant account. Keep test mode until a full sandbox run passes; never send raw PAN/CVV to WyCut’s backend.
- Every paid step charges credits transactionally and writes an audit row to `wycut_credit_ledger`. Transcription is charged per audio part; the script is reserved before generation and refunded if generation fails; narration is charged per batch (rounded up cumulatively) and refunded if the provider fails. The browser checks the balance before a paid step, keeps paid transcript parts and narration segments so retries never pay twice, and shows a Top up prompt when credits run low. Legacy per-recap balances convert to 150 credits each the first time the wallet is used. Narration requests require ownership of the generated recap, use the server-stored canonical script rather than client-edited text, and are capped at 25 batches per recap. The app still needs an end-to-end sandbox test to confirm the provider contract and all credit flows.

## AI speed and model operations

- Script generation uses a configurable provider order, a bounded provider timeout, and fallback to the next configured provider. Keep the provider with the best latency and quota first in `config/ai-operations.json`. Fallbacks improve resilience but cannot make a slow or unavailable provider instant.
- Narration generation uses small client batches and two bounded TTS workers per server request to limit cost spikes. This aims to improve elapsed time without launching every voice segment at once. Provider quota, output length, network quality and hosting limits still affect response time.
- For staff who maintain prompts/model identifiers, use the template in `staff-ai-ops-template/` as a **separate GitHub repository**. Grant staff access to that repository only, not the app repository or deployment secrets. GitHub does not offer secure folder-only permissions inside a single repository. The backend can fetch a private config repo using a read-only token; never put secrets or customer data in the config.

## Standalone legal pages

- `/privacy` — Privacy Policy
- `/terms` — Terms of Service
- `/refunds` — Refund Policy
- `/acceptable-use` — Acceptable Use Policy

Page source files live separately under `app/`. Matching Markdown handoff copies live in `legal/`. These are launch templates; add a monitored support contact and have the terms reviewed for your business and markets before live payments.

## Progressive Web App (PWA)

WyCut includes a web app manifest, generated app icons (including maskable Android icons and an Apple touch icon), an install prompt, and a service worker. Deploy the app over HTTPS for installation; service workers do not work on ordinary insecure origins (localhost is allowed for development).

- Manifest: `public/manifest.webmanifest`
- Service worker: `public/sw.js`
- Offline fallback: `public/offline.html`
- Icons: `public/icons/`, `public/apple-touch-icon.png`, and `public/favicon.ico`
- Registration and browser install prompt: `components/pwa-register.tsx`

The service worker caches only public static resources and does **not** cache API, auth, billing, webhook, or private Google Drive responses. The app still needs a connection for AI generation, billing, OAuth and Drive sync; the offline page explains this rather than pretending those server actions work offline. PWA installation requires HTTPS and a supported browser. Test installability and service-worker behavior on the final deployed domain after deployment.

### Flutterwave webhook (WyCut)

Register only WyBuild's webhook in Flutterwave: `https://wybuild-black.vercel.app/api/billing/webhook`. WyBuild retrieves the authoritative charge from Flutterwave v4 and forwards successful WyCut charges for idempotent settlement; verified terminal failures are forwarded only to mark the order rejected. For reference-only webhooks, WyBuild uses a shared-secret read-only lookup to get the stored charge ID before independently verifying it with Flutterwave. WyCut checks the shared secret and stored order before granting credits. See `FLUTTERWAVE-WEBHOOK-SETUP.md` for the minimum variables and sandbox test plan.

### Lifetime-free account

The account `ilemobayotolulope11092003@gmail.com` has a server-side lifetime-free entitlement in `lib/billing/entitlements.ts`. The exemption is checked only after verifying the signed-in Google/Firebase ID token and verified email. An unverified email/password account cannot claim the allowlisted address. It bypasses checkout and recap-credit deductions; it does not weaken verification for other accounts.

## Separate recap input flows

- `/dashboard/url` — direct HTTPS video-file URLs plus a public subtitle URL or an uploaded subtitle file.
- `/dashboard/file` — choose an MP4/M4V/MOV from the device and upload matching SRT/VTT/TXT subtitles.
- `/dashboard/subtitles` — generate the original recap script, narration, and captions from subtitles without requiring a video file. Video slicing becomes available only after loading the matching authorized source video in the video-file flow.

A YouTube watch-page URL is not a direct video-file URL. WyCut does not bypass YouTube's download restrictions and cannot reliably obtain a complete transcript from a watch link alone. To generate a recap from a YouTube video, provide a transcript/subtitle file you are authorized to use or a public subtitle URL; to cut clips, also provide the matching source video through an authorized download or local file. Direct video URLs must be accessible to the browser and the host must permit cross-origin downloads.

### Recap-writing standards

The AI is instructed to create original, transformative commentary grounded in the supplied subtitles; explain story cause-and-effect, character decisions, important turns, climax and resolution; distribute beats across the full source timeline; prioritize scenes viewers need to understand the story; and avoid long verbatim dialogue, lyrics, copied summaries, invented details, or claims that any wording guarantees copyright clearance. This is a writing-quality safeguard, not a guarantee against copyright claims or a legal determination of fair use.


## Reproducible build and verification

Use Node.js 20+ and npm. Install dependencies with `npm ci` after a `package-lock.json` has been generated and committed for the exact dependency set. The current source archive did not include a lockfile, so `npm install` may resolve newer compatible versions until the lockfile is checked in.

```bash
npm install
npm run lint
npm run typecheck
npm run test:timeline
npm run build
```

For a Capacitor static web build, set `NEXT_PUBLIC_API_BASE_URL` to the deployed HTTPS API origin and `NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID` to the configured Google Web OAuth client ID:

```bash
npm run build:capacitor-web
npm run android:debug
```

`android:debug` runs the static web build, generates the Android project if missing, runs `npx cap sync android`, and invokes Gradle `assembleDebug`. A release build additionally requires a stable signing keystore and registered Firebase SHA fingerprints. Do not treat a successful static audit as proof of Android runtime compatibility. Run on-device tests for Google sign-in, media import, timeline editing, background/restore, audio sync, export, and payment flows before release.

## Timeline model (schema v1)

`lib/editor/timeline-model.ts` introduces a renderer-neutral, versioned timeline model with fixed lane ordering, typed clips, compatibility-checked moves, main-lane conversion protection, split, trim, duplicate, delete/ripple-delete, selection toggling, and undo/redo primitives. It is a migration foundation; the current editor UI and export renderer still use legacy project/edit-plan state in several paths. Do not claim the new multi-track model is fully integrated into the UI or export until those paths are migrated and parity tests pass.

Run its focused invariants with:

```bash
npm run test:timeline
```

## v64 timeline interaction wiring

The editor timeline supports long-press dragging for video beats and sound clips, frame-snapping toggle, fit-to-screen zoom, haptic feedback, and tap-again-to-deselect behavior. Video beat drags update the beat's source interval; sound drags update the sound track's actual start time. Run `npm run audit:v64` for a static wiring check and `npm run test:timeline` for timeline-model unit tests. These checks do not replace Android touch testing or prove full preview/export parity.


## v65 timeline reliability update

The editor now renders each audio clip on its own timeline row, keeps the add-audio action available after the first track, commits clip drags on release, and persists versioned undo/redo history with project data in IndexedDB. History stores audio blobs once per track ID and snapshots refer to those IDs. Very long histories can still hit browser/WebView storage quotas; verify long sessions on target Android devices.

### Verification commands

```bash
npm run test:timeline
npm run audit:v64
npm run audit:v65
npm run typecheck
npm run lint
npm run build
npm run build:capacitor-web
npx cap sync android
npm run android:debug
```

The final five build/device commands require dependency installation and a complete native Android project. They are not represented as passed by the static audit suite.

## v68 integrated timeline and media export

- Added a versioned timeline model snapshot to saved editor state, a dedicated visual-overlay lane, timed video/image compositing, synchronized audio preview, and export mixing with per-track trim/source offset/fades.
- Export billing now rejects replay of a previously refunded export attempt ID. Flutterwave v4 remains the credit purchase provider; Google Play Billing is not enabled.
- Run `npm run test:all-static` for timeline model tests, FFmpeg motion/audio fixtures, billing contract checks and static audits.
- `npm run test:export-motion` uses a local FFmpeg binary to prove two independently timed overlays create changing output frames. `npm run test:audio-mix` checks audio mix filters using a local FFmpeg fixture.
- Before building the Android app, install dependencies and configure `NEXT_PUBLIC_API_BASE_URL`, `NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID`, the Firebase Android config and the required server-side Flutterwave/Firebase credentials. Then run `npm run lint`, `npm run typecheck`, `npm run build`, `npm run build:capacitor-web`, and `npm run android:debug`.
- See `VERIFICATION-REPORT-v68.md` for the checks that passed and the build/live-service checks blocked in the current environment.
