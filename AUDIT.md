# WyCut v38 engineering audit

## Scope and method

Audited the project ZIP `WyCut-v37-creative-tools-suite.zip`. Reviewed all files in `app/`, `components/`, `lib/`, `config/`, `scripts/`, `public/sw.js`, `capacitor.config.ts`, `.github/workflows/`, and `next.config.mjs` (inventory below). Ran every shipped `scripts/audit*.mjs` plus the new v38 audit. This is a static source audit, not a claim of a complete runtime verification: dependencies were not installed in the supplied project, and no browser/device, Firebase, Google Drive, Flutterwave, or provider credentials were available for live tests.

## Confirmed findings

| Location | Severity | Root cause / impact | Fix or status |
|---|---|---|---|
| `lib/ffmpeg/client-slicer.ts:47-55,105-123` | crash / data-loss risk | Source mounting reduces input copies, but output is still read into a `Uint8Array` and retained as `Blob`s. A 2 GB accepted source size is not a safe promise for all WebViews; fallback can allocate a whole file. Cleanup is best-effort. | Existing WORKERFS path retained. v38 export renderer has stricter platform-specific size guards and `finally` cleanup. True filesystem-streamed FFmpeg output remains unimplemented; see remaining risks. |
| `lib/ffmpeg/client-slicer.ts:128-137` | crash / UX | `abortFFmpeg()` terminates the shared worker immediately while a queued/running operation may still be in its cleanup path. | Existing serialization protects normal operations, but cancellation races are not fully proven safe without runtime stress tests. v38 renderer has an isolated cancel entry point. |
| `public/sw.js:3,24-29` (v37 baseline) | UX | Service-worker cache namespace was fixed at `wycut-pwa-v1`, so stale cached assets could persist across releases. | Bumped to `wycut-pwa-v38`; activation removes old `wycut-pwa-*` caches. |
| `lib/server/rate-limit.ts:3-21` | security / billing | Rate-limit buckets are in process memory and reset when an instance restarts; multiple serverless instances do not share counters. The file itself documents this. | Not replaced because no shared Redis/Upstash dependency or service is configured. Production deployments need a distributed limiter. |
| `components/advanced-editor-tools.tsx` preview block | UX / data integrity | Previous creative controls primarily changed CSS preview styles; selections did not guarantee an equivalent MP4 render. | Added versioned `EditPlan` and wired filter/effect mapping to the shared preview helper. v38 renders supported filters, crop/aspect, mirror, speed, fades, and static text/emoji/sticker/watermark overlays to MP4. |
| `components/dashboard-workspace.tsx:528-558` (baseline export flow) | UX / data integrity | Project export stored original source/assets/settings, but was not itself a complete final-video renderer; extra media, transition presets, and text animation were not rendered. | Rendered rough-cut MP4 is now passed through the EditPlan renderer before download and Drive upload. Additional timeline media, transitions, text animation timing, and SFX/musical ducking are still not fully composed (remaining items below). |
| `config/credit-pricing.json` | billing | No complete server-enforced editor-asset entitlement/reservation/refund path existed for preview-only premium assets. Charging client-side would be unsafe and could double-charge. | Added explicit free/premium asset manifest and a 5-credit policy placeholder, with an explicit note that it is **not active** until server reservation/refund is deployed. No new client-side premium charges were introduced. |
| `lib/ffmpeg/edit-export.ts` (v38) | crash / UX | FFmpeg WASM cannot stream its encoded output directly to Capacitor Filesystem with the current wrapper, so large exports can exhaust WebView memory. | Renderer rejects files over 90 MB on mobile and 220 MB in browser, cleans temporary files in `finally`, reports progress, and offers cancel. This is a conservative guard, not large-file streaming. |

## Billing and security review

- API routes for script, transcription, narration, and billing include Google identity verification, origin checks, and per-process rate limiting in their source. `app/api/wybuild-payment-confirmation/route.ts` requires a shared secret, validates the WyBuild source/reference, and calls the stored-order settlement path rather than granting credits from a client-supplied success flag.
- `lib/billing/credits.ts` uses Firestore transactions for wallet updates, ledger entries, and idempotent refunds for existing generation operations. This static review did not simulate concurrent webhook delivery, provider timeouts, account deletion, or multi-region Firestore contention.
- The in-memory rate limiter is not sufficient as the only production abuse control across serverless instances (`lib/server/rate-limit.ts:3-21`).
- Premium editing assets are **not charged** by v38. The pricing manifest is policy metadata only; no client-controlled price is trusted for a payment, and no unfinished feature is advertised as an active paid export entitlement.
- A complete upload threat model (malformed MP4/MP4Box edge cases, decompression bombs, provider payload fuzzing) could not be verified from static checks alone.

## Export parity checklist

| Feature | v38 status | Notes |
|---|---|---|
| Color filter chains | Partial implementation | 30 named filter definitions; WASM filter availability still needs a real runtime test. |
| Selected visual effects | Partial implementation | Several effects map to FFmpeg filters; some CSS-only preview effects have no exact render equivalent. |
| Aspect ratio/crop | Implemented in renderer | 720p output dimensions are selected for 9:16, 1:1, 16:9, and 4:5. |
| Mirror/flip | Implemented | `hflip` in video filter chain. |
| Speed | Implemented | Video PTS and audio `atempo` are adjusted for constant speed. Speed ramps are not implemented. |
| Fade in/out | Implemented | Fade-out start is derived from HTML video metadata. |
| Static text/emoji/sticker/watermark overlay | Implemented | Rasterized to PNG with Canvas, then overlaid by FFmpeg. It is not animated in the output. |
| Text/sticker animation timing | Not implemented | Preview animation remains CSS-based; exported overlay is static. |
| Clip transitions (`xfade`) | Not implemented | Selection is saved, but export does not apply transitions between clips. |
| Music/SFX mixing and ducking | Partial | Existing separate local mix function remains. Export does not yet automatically mix all timeline audio tracks with ducking. |
| Extra image/video tracks, PiP, masks, freeze/reverse/stabilize | Not implemented in final MP4 | Some timeline assets can be saved to Drive, but are not yet composed into final render. |
| Large-file chunked output to native Filesystem | Not implemented | WASM output is held in memory; conservative size limits are used to avoid OOM. |
| Premium asset reservation, atomic charge and refund | Not implemented | Config manifest only; no charge is taken. |

## Remaining issues requiring implementation or live verification

1. Implement a native/streaming renderer or chunk-and-concat export path that writes output to Capacitor Filesystem without retaining the entire encoded MP4 in JS memory.
2. Implement actual `xfade` transitions between clips; text/sticker animation timing; speed ramps; automatic music/SFX mix with ducking; and composition of added image/video/PiP/mask tracks.
3. Bundle and license-check 20+ real font files; v38 uses Canvas/system font fallbacks and does not claim those files are bundled.
4. Add a server-side editor asset reservation endpoint with atomic idempotency keys, export completion confirmation, refund-on-failure, and per-project unlock records before charging for premium assets.
5. Implement distributed rate limiting in production infrastructure.
6. Run device/browser integration tests for FFmpeg filter availability, Android WebView resume/background behavior, low-RAM stress, Drive OAuth refresh, Firebase persistence, and payment webhook concurrency.
7. Validate all AI provider fallback and parallel-transcription performance with real credentials and quota/error injection. Current static review cannot verify latency or provider availability.
8. Confirm Android Java foreground-service behavior and native Google authentication on a real device. No Android SDK/device build was available in this session.

## Audited file inventory

- `.github/workflows/android-debug-apk.yml`
- `.github/workflows/create-android-keystore.yml`
- `app/acceptable-use/page.tsx`
- `app/api/auth/google/verify/route.ts`
- `app/api/billing/cancel/route.ts`
- `app/api/billing/charge/route.ts`
- `app/api/billing/config/route.ts`
- `app/api/billing/entitlement/route.ts`
- `app/api/billing/status/route.ts`
- `app/api/billing/validate-otp/route.ts`
- `app/api/narration/route.ts`
- `app/api/script/route.ts`
- `app/api/transcribe/route.ts`
- `app/api/wybuild-payment-confirmation/route.ts`
- `app/billing/page.tsx`
- `app/dashboard/file/page.tsx`
- `app/dashboard/page.tsx`
- `app/dashboard/subtitles/page.tsx`
- `app/dashboard/url/page.tsx`
- `app/globals.css`
- `app/history/page.tsx`
- `app/layout.tsx`
- `app/login/page.tsx`
- `app/page.tsx`
- `app/privacy/page.tsx`
- `app/refunds/page.tsx`
- `app/terms/page.tsx`
- `capacitor.config.ts`
- `components/advanced-editor-tools.tsx`
- `components/app-menu.tsx`
- `components/app-shell.tsx`
- `components/dashboard-workspace.tsx`
- `components/history-view.tsx`
- `components/legal-layout.tsx`
- `components/pwa-register.tsx`
- `components/sound-library.tsx`
- `config/ai-operations.json`
- `config/android/google-services.json`
- `config/credit-pricing.json`
- `lib/ai/operations-config.ts`
- `lib/ai/script-generator.ts`
- `lib/ai/tts-generator.ts`
- `lib/api-client.ts`
- `lib/auth/get-auth-token.ts`
- `lib/auth/google-native.ts`
- `lib/billing/client-errors.ts`
- `lib/billing/credits.ts`
- `lib/billing/entitlements.ts`
- `lib/billing/flutterwave-v4.ts`
- `lib/billing/google-identity.ts`
- `lib/billing/pricing.ts`
- `lib/billing/settlement.ts`
- `lib/drive/export.ts`
- `lib/drive/read.ts`
- `lib/editor/edit-plan.ts`
- `lib/ffmpeg/audio-demux.ts`
- `lib/ffmpeg/client-slicer.ts`
- `lib/ffmpeg/edit-export.ts`
- `lib/firebase-admin.ts`
- `lib/firebase/client.ts`
- `lib/native/background.ts`
- `lib/projects/bus.ts`
- `lib/projects/store.ts`
- `lib/server/origin.ts`
- `lib/server/rate-limit.ts`
- `lib/transcribe/client.ts`
- `next.config.mjs`
- `public/sw.js`
- `scripts/audit-files.mjs`
- `scripts/audit-free-trial-policy.mjs`
- `scripts/audit-generation-fixes.mjs`
- `scripts/audit-pricing.mjs`
- `scripts/audit-pwa.mjs`
- `scripts/audit-v32-reliability.mjs`
- `scripts/audit-v34-ux.mjs`
- `scripts/audit-v35-drive-export.mjs`
- `scripts/audit-v36-editing-tools.mjs`
- `scripts/audit-v37-creative-tools.mjs`
- `scripts/audit-v38-export-parity.mjs`
- `scripts/build-android.mjs`
- `scripts/build-capacitor-web.mjs`
- `scripts/copy-ffmpeg-core.mjs`
- `scripts/native/WyCutBackgroundPlugin.java.tpl`
- `scripts/native/WyCutForegroundService.java.tpl`
- `scripts/native/install-background-service.mjs`
