# WyCut v28 — Generate recap: silent failures fixed

## Why "Generate recap" looked dead
- Errors were only written to the "Build status" card in the sidebar, which sits below the whole page on phones. A failed request looked like nothing happened. Errors/status now appear directly under the Generate button and scroll into view (covers script, narration, slicing and Drive export).
- `getAuthToken` ran before Firebase restored the saved session, so a quick tap failed with a false "session expired". It now waits for `authStateReady()` and falls back to the cached token on a transient refresh failure. The old early "Sign in first" exit that blocked the request is removed.
- CORS did not allow the `X-Device-Id` header the app sends, so the installed Android app's preflight was rejected (browser: "Failed to fetch"). Added to middleware.
- Script validation rejected valid AI output: 20 s snap limit to subtitle cues (films have long silences), strict beat count (±4), strict 100–180 words/min, any overlapping ranges, any malformed optional dialogue cue. Now: snap to nearest cue, ±12 beats, 70–210 words/min, overlaps trimmed, bad cues dropped. One automatic retry when a model's output fails validation.
- Every provider failure was reported as a timeout because the message contained "timed out". Classification now distinguishes invalid output, bad/missing API key, quota/rate limit, timeout; invalid-output errors include the reason.
- Failed generations no longer use up one of the five script attempts per 10 minutes (refund restores the slot).

## Still needs checking in your environment
- Typecheck, lint, build and live tests were not run here (no dependencies installed / no network). Run `npm run build` and `npm run audit:generation`, then try one generation.
- If it still fails, the toast now shows a code: `AI_PROVIDER_NOT_CONFIGURED` → check GEMINI_API_KEY / OPENAI_API_KEY; `CREDIT_DATABASE_CONFIGURATION` → check FIREBASE_SERVICE_ACCOUNT_JSON_BASE64 and Firestore rules; 401 → sign in again.
- Installed Android app: CAPACITOR_ALLOWED_ORIGINS must include the app origin (e.g. https://localhost) and NEXT_PUBLIC_API_BASE_URL must point at the deployment.
- Vercel: `maxDuration = 120` needs a plan that allows it; on a 60 s limit, long generations will be cut off.
