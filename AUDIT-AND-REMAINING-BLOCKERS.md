# WyCut + WyBuild reliability audit (v18 work)

## Fixes in this revision

### WyCut environment and billing
- Removed obsolete WyCut direct-webhook configuration and its receiver. Flutterwave has one registered webhook: WyBuild `/api/billing/webhook`.
- Removed old/duplicate WyCut variables and code paths: `FLW_SECRET_KEY`, `FLW_V4_API_BASE`, `FLW_V4_CHARGES_PATH`, `FLW_V4_CARD_FIELD`, `FLW_WEBHOOK_SECRET_HASH`, `FLW_V4_VERIFY_URL_TEMPLATE`, `FLW_V4_VALIDATE_PATH_TEMPLATE`, `NEXT_PUBLIC_FLW_CARD_RSA_PUBLIC_KEY`, and `GOOGLE_WEB_CLIENT_ID`.
- Kept variables still used by live code: Flutterwave v4 client credentials/base URL/encryption key, the WyBuild→WyCut shared secret, Firebase Admin credentials, Google OAuth Web client ID, AI provider keys/optional model overrides, and Capacitor build/origin variables.
- The lifetime-free allowlist requires a verified Google/Firebase email; an unverified email/password account cannot claim the allowlisted address.
- WyCut checkout follows the same v4 customer → payment method → charge structure as WyBuild. A Firestore per-user active-payment lock prevents a second charge while a prior order is unresolved; the lock clears on verified success, verified terminal failure, or a pre-charge provider error. Card fields and PIN data are AES-GCM encrypted in the browser. PIN/OTP continuation uses v4 `/charges/{id}`; WyCut does not independently settle payments.
- Added stable idempotency keys for customer/payment-method/charge creation, and ambiguous charge timeouts now remain `unknown_provider_result` so the UI warns against a duplicate payment.
- Prevented charge/authorization responses from overwriting a `credited` order if WyBuild's webhook settles it concurrently. Settlement also repairs an order's status if the payment ledger already exists.
- Narration calls use server-stored script beats rather than trusting client-edited narration text. Failed TTS requests release their narration quota slot.

### Google Drive and local media
- Google Drive sign-in is preloaded and reports OAuth/script/config errors. The access-token popup is requested synchronously from the button click to avoid popup-blocking after an `await`. The Connect button remains clickable and reports the exact configuration problem instead of staying disabled forever.
- Drive files upload directly from the browser to Google Drive using 8 MiB resumable chunks, offset probing and bounded retries. Uploads are sequential to reduce mobile memory pressure. A full export interrupted between files can still leave a partial folder; whole-kit resume/cleanup is not implemented.
- Subtitle URL reads are byte-limited while streaming, not after buffering the full response. Direct video URLs remain browser/CORS-dependent; YouTube/TikTok watch pages are not scraped or bypassed.
- Video cuts are locally re-encoded to H.264/AAC for frame-accurate boundaries; 80 MiB Android / 100 MiB low-memory mobile browser / 300 MiB desktop browser source limits reduce out-of-memory risk. Timestamped SRT/VTT is required before cutting. Model timestamps are snapped to nearby subtitle cue boundaries and validated for range, overlap, duration and source coverage. Review scene selection before export; semantic accuracy cannot be guaranteed by code alone.
- Captions use each generated audio segment's measured duration and split text proportionally. This is more accurate than word-count-only timing, but it is not word-level forced alignment. The full voiceover still concatenates MP3 segment blobs; validate it in target editors, especially if fallback providers are mixed.

### AI and cost controls
- Script output is JSON-validated; beat count, narration length, source ranges, overlaps, dialogue-cue ranges and approximate word count are checked. Invalid output triggers provider fallback.
- TTS is limited to small batches, two workers per server request, 3,500 characters per batch and 25 narration calls per recap. Failed provider calls release their quota slot.
- The existing IP rate limiter is in-memory per process, but script generation now also enforces a transactional five-script-per-10-minute limit per verified Google account in Firestore. The IP limiter is still not distributed; the per-account guard protects the expensive generation path across instances.

### WyBuild payment webhook
- Downstream confirmation failures and Flutterwave lookup/reconciliation exceptions return HTTP 500 so webhook delivery can retry rather than silently returning success. WyCut confirmation URLs must use HTTPS.
- Idempotency keys are stable per logical write. Payment-method keys now include the unique checkout reference so a later checkout does not accidentally reuse the previous checkout's idempotency key.
- The webhook still needs a real merchant sandbox test to confirm Flutterwave's signature header/raw-body behavior and exact response payload for this account. Do not treat static code inspection as proof of provider integration.

## Environment variables: only keep active ones

WyCut's `.env.example` is the authoritative list for that project. The remaining variables are referenced by code or by the Android build workflow; do not add old `FLW_SECRET_KEY`, `FLW_V4_API_BASE`, `FLW_WEBHOOK_SECRET_HASH`, or RSA card-key variables back. WyBuild retains `FLW_CLIENT_ID`, `FLW_CLIENT_SECRET`, `FLW_ENCRYPTION_KEY`, `FLW_V4_BASE_URL`, and `FLW_SECRET_HASH` because its charge/webhook code uses them. WyBuild also needs `WYCUT_PAYMENT_CONFIRM_URL` and `WYCUT_WEBHOOK_SHARED_SECRET` to forward WyCut payments.

## Checks performed in this workspace

- ZIP structure/required-file and PWA audits are run before packaging.
- JavaScript syntax checks run for WyBuild's API and utility scripts.
- TypeScript/TSX files are transpiled with the installed TypeScript compiler to catch syntax diagnostics.
- `tsc --noEmit`, ESLint, Next.js production build, Capacitor/Gradle build and live provider tests are not considered passed unless dependencies are installed and those commands complete successfully. This environment did not have the app dependencies installed, so those full checks remain a release gate.

## Required real-world release tests

1. `npm install`, `npm run typecheck`, `npm run lint`, `npm run build`, and `npm run android:debug` in a network-enabled environment.
2. Web Google Drive: authorize an OAuth Web client, ensure Drive API is enabled, upload one small and one >8 MiB test file, revoke access, and confirm clear expired-token errors.
3. Android Google Drive: install the built APK signed with the configured SHA-1/SHA-256, authorize the Android OAuth client, and confirm a Drive access token is returned.
4. AI: test Gemini success, Gemini failure → OpenAI fallback, OpenAI failure → configured fallback, malformed/short AI output, and timeout errors.
5. Media: use a licensed sample MP4 with matching SRT/VTT; inspect several clips for exact boundaries, audio continuity, rough-cut playback, and out-of-memory handling on a target Android device. Plain-text transcript timing cannot be considered accurate.
6. Captions: compare SRT segment timing against the exported voiceover in CapCut/Premiere; use word-level alignment if exact syllable timing is required.
7. Flutterwave sandbox: success, PIN, OTP, redirect/3DS, pending, failed, duplicate webhook, mismatched amount/currency/reference/charge ID, downstream WyCut 5xx, and charge timeout. Confirm credits are granted once and only after WyBuild verifies the charge.
8. Check that `ilemobayotolulope11092003@gmail.com` receives WyCut free access after Google identity verification and that other accounts still require purchased credits.

## Honest limitations

- Google OAuth client setup, authorized origins, Android fingerprints, Drive API enablement, provider quotas and merchant account settings cannot be validated from source code alone.
- Frame-accurate re-encoding makes the cut boundaries precise relative to selected timestamps, but AI scene selection still requires review.
- Browser CORS prevents downloading from some otherwise public hosts; WyCut intentionally does not proxy large video files through its server.
- The complete Flutterwave, Drive and native Android flows must pass the real sandbox/device tests above before production/live billing.
