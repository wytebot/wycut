# WyCut — recap production studio

WyCut is a Next.js App Router + TypeScript app for generating original recap scripts from user-provided subtitles, generating narration and estimated SRT captions, locally slicing an authorized video source, and exporting a production kit directly to the user's Google Drive.

## Architecture

- **Web/backend deployment:** deploy the regular Next.js app. This deployment serves `/api/script`, `/api/narration`, Google identity verification, and the Flutterwave webhook/charge endpoints.
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
3. Ensure `NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID` is configured for the backend build and Google OAuth is set up for package `app.wycutrecap.vercel`.

### GitHub Actions build

Add these repository **Actions secrets**:

- `NEXT_PUBLIC_API_BASE_URL`: the backend origin only, e.g. `https://your-wycut-domain.example` (do not append `/api`).
- `NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID`: the Google Web OAuth client ID used by the native Google sign-in plugin.
- `GOOGLE_SERVICES_JSON_BASE64`: base64-encoded `google-services.json` from Firebase project `wycut5`, configured for Android package `app.wycutrecap.vercel`.

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
3. Generate narration/captions if desired; narration is optional for exporting video cuts.
4. Slice the source locally with FFmpeg stream copy.
5. Connect Google Drive and export the cut sections (and any generated narration/script) directly into the Drive production-kit folders.

Important URL limits: a YouTube or TikTok watch-page URL is not a direct media file, and their public APIs do not give this app a generic downloadable full-video URL. WyCut therefore does not scrape or bypass those platforms. For content you own or have permission to edit, use the platform's authorized export/download, then select that video file or use a direct-download URL from a host that allows browser access. Direct media/subtitle hosts must allow browser CORS access. The app currently does not auto-discover or download YouTube/TikTok captions from a watch page. On Android, local FFmpeg processing is limited to 100 MB sources; browser processing is limited to 700 MB. Stream-copy cuts are keyframe-limited, and rough-cut concatenation depends on compatible source streams.

## Environment variables

See `.env.example`. Important settings:

- `GEMINI_API_KEY`, `OPENAI_API_KEY`, `DEEPGRAM_API_KEY`: server-side AI provider keys/fallbacks. Keep model overrides blank if you want the operations JSON to control model names.
- `AI_OPERATIONS_CONFIG_URL`: optional HTTPS URL to `ai-operations.json` in a separate AI operations repository. For a private GitHub repo, use the GitHub Contents API URL and set `AI_OPERATIONS_CONFIG_TOKEN` to a fine-grained token with read-only Contents access. Config is cached for five minutes; local config is the fast fallback. Never put the token in the app or share it with staff. Set `AI_SCRIPT_PROVIDER=openai` or `gemini` only to force provider priority.
- `NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID` and `GOOGLE_WEB_CLIENT_ID`: Google OAuth client IDs.
- `FIREBASE_SERVICE_ACCOUNT_JSON_BASE64`: server-only Firebase Admin credentials for payment records.
- `CAPACITOR_ALLOWED_ORIGINS`: allowed local app origins for API CORS.
- `NEXT_PUBLIC_API_BASE_URL`: only needed when building the bundled APK.
- `GOOGLE_SERVICES_JSON_BASE64`: only needed for the APK build workflow; contains Firebase Android config, not a server secret.
- `FLW_*`: only configure after verifying the exact Flutterwave v4 contract enabled on the merchant account.

## Payments and production blockers

The checkout, order ownership, PIN/OTP continuation, verified settlement, idempotent recap-credit ledger, and generation credit gate are implemented. However, the direct-card encryption and endpoint payload still need a successful sandbox test against the exact Flutterwave v4 product enabled on your merchant account. **Do not enable live payments until that test passes.** See [AUDIT-AND-REMAINING-BLOCKERS.md](./AUDIT-AND-REMAINING-BLOCKERS.md) for the release gate.

## Main files

- `app/page.tsx` — landing page and pricing.
- `app/dashboard/page.tsx` — direct-video URL/local-file + transcript URL/SRT/VTT workflow, local slicing and Drive export.
- `lib/ai/script-generator.ts` — validated Gemini/OpenAI script generation.
- `lib/ai/tts-generator.ts` — bounded TTS, ordered segments, estimated SRT.
- `lib/ffmpeg/client-slicer.ts` — local FFmpeg stream-copy slicing and rough cut.
- `lib/drive/export.ts` — direct Google Drive resumable uploads.
- `lib/api-client.ts` — API origin resolver for web and bundled APK.
- `middleware.ts` / `lib/server/origin.ts` — CORS/preflight and allowed-origin checks.
- `scripts/build-capacitor-web.mjs` — safe static export with server routes restored afterward.
- `scripts/build-android.mjs` — Android project generation, sync, and debug APK build.
- `.github/workflows/android-debug-apk.yml` — automated debug APK build artifact.

## Flutterwave v4 billing and NGN pricing

- `/billing` is the checkout page for the single recap and 10-recap pack.
- The reference rate is fixed at **₦1,400 / USD**. Single recap: $1.99 base = ₦2,786; 2% fee = ₦56; total = **₦2,842**. Ten-pack: $14.99 base = ₦20,986; 2% fee = ₦420; total = **₦21,406**. Fee and total are rounded to whole naira.
- A Google ID token is verified server-side before an order is created. Orders are tied to the Google `sub`, not to a client-supplied email. PIN/OTP continuation checks order ownership.
- The webhook and status route retrieve a transaction from Flutterwave using `FLW_V4_VERIFY_URL_TEMPLATE`, check order amount/currency/reference/provider ID, then atomically record the payment and add recap credits to `wycut_users/{google-sub}`. A transaction ID can be credited only once.
- Set `FLW_SECRET_KEY`, `FLW_V4_API_BASE`, `FLW_V4_CHARGES_PATH`, `FLW_V4_CARD_FIELD`, `FLW_WEBHOOK_SECRET_HASH`, `FLW_V4_VERIFY_URL_TEMPLATE`, `FLW_V4_VALIDATE_PATH_TEMPLATE`, `NEXT_PUBLIC_FLW_CARD_RSA_PUBLIC_KEY`, and `GOOGLE_WEB_CLIENT_ID` / `NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID`. Firebase Admin service credentials must be configured for order and wallet persistence.
- **Merchant-specific contract gate:** this project keeps the v4 charge path at `/charges`, the card field at `card`, the continuation path at `/charges/{id}/validate`, and browser-side RSA-OAEP/SHA-256 encryption as explicit assumptions/configuration points. Before accepting real money, confirm those exact paths, payload shape, encryption algorithm/key format, validation body and webhook signature with the v4 product enabled in your Flutterwave dashboard. The app must remain in test mode until the exact contract passes a full sandbox run. Never collect or send unencrypted PAN/CVV to WyCut's backend.
- The script-generation route reserves one recap credit transactionally before generation and refunds it if generation fails. Narration requests require ownership of the generated recap and are capped at 25 batches per recap. The app still needs an end-to-end sandbox test to confirm the provider contract and all credit flows.

## AI speed and model operations

- Script generation uses a configurable provider order, a bounded provider timeout, and fallback to the next configured provider. Keep the provider with the best latency and quota first in `config/ai-operations.json`. Fallbacks improve resilience but cannot make a slow or unavailable provider instant.
- Narration generation runs up to three batches concurrently in the client; each server request uses bounded TTS concurrency. This aims to improve elapsed time without launching every voice segment at once. Provider quota, output length, network quality and hosting limits still affect response time.
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
