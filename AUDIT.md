# WyCut v62 — Engineering Audit (Phase 1)

**Audit date:** 2026-10-20  
**Scope:** Source and configuration in `WyCut-v62-capcut-creator-tools.zip`. Static inspection plus the repository's self-audit scripts. This is not a real-device certification.

## Verification limits

- `node scripts/audit-*.mjs` was run for all audit scripts present. Most passed; failures are listed below.
- Static checks do not prove visual fidelity, successful provider calls, real Android WebView behavior, frame-accurate A/V sync, or production billing correctness.
- The ZIP contains no `android/` directory, no `node_modules/`, and no npm lockfile. Therefore Gradle/Manifest/R8/plugin-sync checks and dependency-backed lint/typecheck/build cannot be truthfully reported as passed from this archive. The build script generates `android/` and runs `npx cap sync android`.
- Some source files have many declarations compressed onto one physical line. References below use file and line numbers as stored in the archive; where a line is very long, the named symbol is the useful locator.

## Severity-ranked findings

### Critical

1. **Preview/export parity is not proven; animated CSS previews are not a shared render pipeline.**  
   **Files:** `components/advanced-editor-tools.tsx:1-237`; `lib/editor/asset-catalog.ts:1-100`; `lib/editor/edit-plan.ts:1-198`; `lib/ffmpeg/edit-export.ts:1-176`; `scripts/audit-v38-export-parity.mjs`; `scripts/audit-v60-live-effects.mjs`; `scripts/audit-v61-text-templates.mjs`.  
   **Cause:** The catalog includes CSS filter strings and CSS animation keyframes, while export is an FFmpeg/WASM renderer driven by `normalizeEditPlan`, `videoFilterForPlan`, and `audioFilterForPlan`. A passing static audit only checks that names/map entries exist; it does not render samples or compare frames at multiple timestamps. CSS motion (including per-letter/word motion) is not inherently reproduced by FFmpeg. The v38 audit itself is source-presence based and the v60/v61 scripts explicitly describe themselves as static audits.  
   **Fix:** Make effects declarative and time-based in a versioned render graph consumed by preview and export, or render the same WebGL/Canvas composition to export frames. Add a deterministic sample-project export test that samples decoded frames at multiple times and fails if animated layers are identical/static. Do not claim parity until it passes.

2. **Android build and runtime compatibility cannot be certified from the archive.**  
   **Files:** `capacitor.config.ts:1-20`; `scripts/build-android.mjs:8-94`; `scripts/build-capacitor-web.mjs:6-51`; `package.json`; `ANDROID-APK-CHECKLIST.md`.  
   **Cause:** `android/` is absent, so `AndroidManifest.xml`, Gradle wrapper/plugin versions, native plugin registration, R8/ProGuard rules, and generated native permissions are not available to inspect. There is no lockfile to pin the resolved dependency graph. Build script depends on a valid Firebase Android config and `NEXT_PUBLIC_API_BASE_URL`/Google client ID.  
   **Fix:** Generate the native project from the pinned package graph, inspect and commit required native configuration, commit a package-manager lockfile, run `npx cap sync android`, then run `./gradlew assembleDebug` and `assembleRelease` in CI. Test the installed APK on real Android versions and record results.

3. **Unbounded/multi-track timeline requirement is not implemented as a verified timeline model.**  
   **Files:** `components/advanced-editor-tools.tsx:1-237`; `components/dashboard-workspace.tsx:1-...`; `lib/editor/edit-plan.ts:1-198`; `lib/projects/store.ts:1-183`.  
   **Cause:** The central edit plan is a single-project settings/overlay shape (filter/effect/transition/speed/volume/fades, a keyframe array and overlay fields), not a general collection of arbitrary clip instances with lane IDs, source ranges, per-clip effects, and order constraints. The existing editing UI exposes tools but the source shape does not demonstrate unlimited lanes, virtualization, magnetic main-track semantics, per-clip history, or complete compatibility-matrix dispatch. “Unlimited” cannot be promised by a single fixed edit-plan object.  
   **Fix:** Introduce a versioned project/timeline schema with clip IDs, lane IDs/types, source ranges, transforms, audio settings, keyframes, and effect stacks; implement schema migration from existing `EditPlan` and project manifests. Virtualize visible timeline regions and test 1000+ clips without imposing a hidden hard cap.

4. **Some AI work is charged before the provider call; only pre-provider failures are generally refunded.**  
   **Files:** `app/api/transcribe/route.ts:102-142`; `app/api/script/route.ts:27-74`; `app/api/narration/route.ts:1-54`; `lib/billing/credits.ts:85-345`.  
   **Cause:** Transcription calls `chargeCredits` before provider execution and intentionally retains the charge after `providerStarted`; the route's refund path returns credits only if the provider was not started. Script generation reserves credits and treats post-start failures as billable. This can be reasonable for provider-cost protection but differs from a user-visible “refund on every failure” policy. There is also a risk of confusing a failed delivery with completed work unless the UI clearly distinguishes provider-started failures.  
   **Fix:** Make the policy explicit per operation: estimate and show cost before initiation; idempotently reserve; mark provider-started; settle on completion; refund only when provider was not called or provider usage is confirmed zero. Show this distinction in UI and ledger. Add concurrency/failure-injection tests.

### High

5. **Creator-tool catalog entries do not prove that all items render correctly in export.**  
   **Files:** `lib/editor/asset-catalog.ts:1-100`; `lib/editor/edit-plan.ts:1-198`; `lib/ffmpeg/edit-export.ts:1-176`; `scripts/audit-v62-creator-tools.mjs:1-18`.  
   **Cause:** `audit-v62-creator-tools.mjs` checks for named catalog strings, export-map strings and CSS keyframes. This can pass even if a filter/effect name is not selected by the renderer, a font/asset is missing at runtime, a motion is preview-only, or FFmpeg filter syntax is invalid for the bundled build.  
   **Fix:** Add one test per catalog item that selects it, renders a short fixture, decodes output, checks output is valid and visually changed, and for animated items checks temporal variance. Track `real`, `preview-only`, `exported-static`, and `exported-motion` status explicitly.

6. **Timeline/history persistence is not proven for rotate, process death, or long edits.**  
   **Files:** `lib/projects/store.ts:1-183`; `components/history-view.tsx`; `scripts/audit-v59-history-resume.mjs`.  
   **Cause:** The v59 audit confirms source blobs/settings/timeline assets are written to IndexedDB and history navigates to the editor. It is a static check; it does not kill/restart the Android process, rotate during a write, test quota exhaustion, or validate atomic project snapshots during concurrent autosave. IndexedDB persistence is a positive foundation, but these lifecycle guarantees remain unverified.  
   **Fix:** Use atomic versioned project snapshots and debounced writes with transaction boundaries; recover the last committed snapshot on startup. Add lifecycle/device tests for rotate, background, force-stop, storage-full, and upgrade migration.

7. **Large media performance risks in the client-side FFmpeg/WASM pipeline.**  
   **Files:** `lib/ffmpeg/edit-export.ts:1-176`; `lib/ffmpeg/client-slicer.ts`; `lib/ffmpeg/audio-demux.ts`; `scripts/copy-ffmpeg-core.mjs`; `package.json`.  
   **Cause:** FFmpeg runs in browser/WebView memory and the project has no demonstrated proxy/transcode strategy or benchmark. Large video/audio blobs, intermediate output files, decode and export can pressure Android WebView memory. The presence of `@ffmpeg/ffmpeg` and `@ffmpeg/core` does not prove that core files are copied, load under the APK origin, or work on low-memory devices.  
   **Fix:** Measure bundle/WASM size and peak memory; serialize heavy jobs; clean virtual FS in `finally`; use chunked/proxy media for long sources; move thumbnail decoding and waveform work to Workers where supported; provide clear low-memory recovery.

8. **Native build signing fallback produces APKs whose Google sign-in may not work.**  
   **File:** `scripts/build-android.mjs:60-76`; `ANDROID-APK-CHECKLIST.md`.  
   **Cause:** When `ANDROID_KEYSTORE_BASE64` is absent, the script warns that it signs with a throwaway debug key. The SHA-1 then changes between CI runs, which can break native Google OAuth.  
   **Fix:** Fail release builds without a stable keystore; permit throwaway signing only for explicitly labeled local debug builds. Register the stable SHA-1/SHA-256 fingerprints with Firebase.

9. **The Capacitor build temporarily moves `app/api` and `middleware.ts`.**  
   **File:** `scripts/build-capacitor-web.mjs:20-51`.  
   **Cause:** It renames these paths away before `next build` and restores them in `finally`. A process kill or filesystem failure between rename and restoration can leave the working tree damaged; concurrent builds can race.  
   **Fix:** Build from a disposable worktree/copy or use a separate static-export configuration that excludes server routes without mutating source paths. Add a failure-injection test.

10. **Dependency versions are ranges and the resolved graph is not locked.**  
    **File:** `package.json`.  
    **Cause:** Many dependencies use caret ranges (`^`); no `package-lock.json`, `pnpm-lock.yaml`, or `yarn.lock` is in the archive. A clean install can resolve different versions over time.  
    **Fix:** Choose one package manager, pin versions, commit its lockfile, and use frozen/locked installs in CI.

11. **Billing provider and Google Play Billing requirements are not equivalent.**  
    **Files:** `app/api/billing/charge/route.ts:1-102`; `app/api/wybuild-payment-confirmation/route.ts`; `lib/billing/flutterwave-v4.ts`; `lib/billing/settlement.ts`; `app/api/editor/export/charge/route.ts:17-48`.  
    **Cause:** The app has a server-side Flutterwave card-charge flow and server-side Google identity checks. This is not Google Play Billing receipt validation, purchase acknowledgement, restore-purchases handling, or Play Billing RTDN. The export-charge route charges 2K only after render, which is a good pattern, but does not itself implement Google Play receipt verification.  
    **Fix:** If selling digital goods inside a Play-distributed APK, implement Play Billing and server-side purchase-token verification/acknowledgement, idempotent grants, restore, pending state, and Real-time Developer Notifications as appropriate. Keep Flutterwave only where policy and distribution channel permit it.

12. **The client-side feature/premium catalog is not sufficient entitlement enforcement by itself.**  
    **Files:** `components/advanced-editor-tools.tsx`; `lib/editor/unlock-premium-asset.ts`; `app/api/editor/assets/unlock/route.ts:17-55`; `config/credit-pricing.json`.  
    **Cause:** Server-side asset unlock has an allowlist and transaction-backed one-time purchase (positive), but a lock badge or preview gating in the UI is not proof that export rejects every locked premium asset. Export route checks 2K charges, while a general per-project export entitlement check for all premium filter/effect/template IDs was not verified.  
    **Fix:** Validate every premium asset ID against the user's server-side unlock/entitlement state at export time, or create a signed/versioned entitlement manifest. Test direct API calls and locally edited project JSON.

13. **The rate limiter appears process-local rather than a distributed global limiter.**  
    **File:** `lib/server/rate-limit.ts:1-...`; callers include `app/api/script/route.ts`, `app/api/transcribe/route.ts`, and billing routes.  
    **Cause:** In-memory limits reset across serverless instances/restarts and do not enforce one account-wide quota globally. It is useful as a local abuse guard, not a complete billing safeguard.  
    **Fix:** Use a shared atomic store/database-backed quota keyed by authenticated user and operation; retain process-level throttling as an additional layer.

### Medium

14. **Filter and effect names are a mix of real CSS previews and FFmpeg mappings; parity is uneven.**  
    **Files:** `lib/editor/asset-catalog.ts:1-100`; `lib/editor/edit-plan.ts:1-198`; `components/advanced-editor-tools.tsx:1-237`.  
    **Cause:** Catalog includes CSS filter strings (e.g. `grayscale`, `sepia`, `hue-rotate`, blur/contrast/saturation) and CSS keyframes. Export uses FFmpeg filter chains. CSS filter functions and FFmpeg filter graphs are different implementations and do not produce identical pixels. Some effects can only be approximated by FFmpeg filters; CSS-only keyframes cannot automatically export as motion.  
    **Fix:** Define explicit renderer implementations and supported capabilities per item. Mark unsupported export items disabled rather than silently dropping them.

15. **Text animation is represented as an animation name rather than a complete per-glyph timed motion model.**  
    **Files:** `lib/editor/edit-plan.ts:1-198`; `lib/editor/asset-catalog.ts:1-100`; `app/globals.css:1-...`.  
    **Cause:** The edit plan's text shape contains a single `animation` string and style/position values. It does not model per-letter/word timing, in/out/loop phases, easing curves, or per-glyph keyframes. CSS animations in the preview can appear dynamic while export remains static or differently timed.  
    **Fix:** Extend schema with animation preset/version, phase durations, easing, stagger mode, glyph grouping and keyframes; use the same evaluator for preview and export.

16. **Browser API compatibility matrix is not documented or runtime-tested.**  
    **Files:** `components/advanced-editor-tools.tsx`; `components/dashboard-workspace.tsx`; `lib/ffmpeg/*`; `lib/projects/store.ts`; `capacitor.config.ts`.  
    **Cause:** Dependencies show FFmpeg/WASM and Capacitor Filesystem/Share plugins, but no committed matrix verifies File System Access API, Blob URLs, WebCodecs, MediaRecorder, OffscreenCanvas, SharedArrayBuffer, localStorage, IndexedDB, and fallback behavior in Android System WebView. Blob URLs/IndexedDB are commonly available; File System Access and WebCodecs availability varies; SharedArrayBuffer needs cross-origin isolation; Capacitor static origin differs from a hosted browser.  
    **Fix:** Feature-detect APIs, use Capacitor Filesystem/native picker fallbacks, avoid requiring SharedArrayBuffer unless headers/runtime support are proven, and add a startup capability report plus Android instrumentation tests.

17. **Accessibility and haptic behavior for timeline gestures are not verified.**  
    **Files:** `components/advanced-editor-tools.tsx`; `components/dashboard-workspace.tsx`; `capacitor.config.ts`.  
    **Cause:** The archive does not demonstrate a complete native haptics integration, long-press accessibility alternatives, keyboard equivalents, or gesture arbitration tests. A touch gesture can conflict with scroll/pinch unless pointer capture and cancellation are carefully managed.  
    **Fix:** Add `@capacitor/haptics` if needed, keyboard/context-menu alternatives, touch-action policy, pointer-cancel handling, and tests for drag vs scroll vs pinch.

18. **Autosave/project lifecycle edge cases remain unverified.**  
    **Files:** `lib/projects/store.ts:1-183`; `components/history-view.tsx`; `HISTORY-RESUME-v59.md`.  
    **Cause:** Existing storage supports history/resume but no runtime test establishes recovery after interrupted writes, schema upgrade, quota exhaustion, or simultaneous edit/export.  
    **Fix:** Version project schema and migration chain, persist edits transactionally, store a recovery checkpoint before destructive operations, and expose autosave status.

19. **Static audit suite has stale/failed checks.**  
    **Files:** `scripts/audit-free-trial-policy.mjs`; `scripts/audit-v36-editing-tools.mjs`; `scripts/audit-v37-creative-tools.mjs`.  
    **Cause:** `audit-free-trial-policy.mjs` fails because it expects `reserveRecapCredit(...scriptCredits...)`; `audit-v36-editing-tools.mjs` fails transition-selector assertion; `audit-v37-creative-tools.mjs` fails catalog count assertions for filters/effects/transitions/text animations. Some may be stale expectations rather than actual regressions, but they are not green and must be reconciled with current requirements.  
    **Fix:** Update tests to assert observable behavior and current catalog policy, not brittle source substrings. Preserve the failing tests until their expectation is reviewed; do not simply silence them.

### Low

20. **Project version and native app versioning are not fully aligned.**  
    **Files:** `package.json`; `scripts/build-android.mjs:48-56`.  
    **Cause:** Package version is `0.41.0`, while the build script defaults Android `versionCode` to `30` unless CI variables override it. This may be intentional but makes release traceability less obvious.  
    **Fix:** Define a documented versionCode policy and stamp a build ID/commit SHA into the APK.

21. **Documentation overstates what static audits prove.**  
    **Files:** `CHANGELOG-v62-capcut-creator-tools.md`; `scripts/audit-v62-creator-tools.mjs`; `scripts/audit-v60-live-effects.mjs`; `scripts/audit-v61-text-templates.mjs`.  
    **Cause:** The v62 audit checks string presence and reports success, but it cannot establish that all items export with motion.  
    **Fix:** Separate “catalog wiring verified” from “runtime export verified” in changelogs and release checklist.

## Feature truth table (source-level verification)

| Feature claim | Finding | Evidence / caveat |
|---|---|---|
| Filters | **Real selection/catalog + preview CSS; export mappings exist for a subset. Exact parity UNVERIFIED.** | `lib/editor/asset-catalog.ts`, `lib/editor/edit-plan.ts`, `lib/ffmpeg/edit-export.ts`. CSS filters are not the same pixel pipeline as FFmpeg filters. |
| Visual effects | **Catalog and preview mappings exist; actual export quality/motion UNVERIFIED.** | `asset-catalog.ts`, `edit-plan.ts`, `edit-export.ts`; v62 audit checks names rather than rendered output. |
| Transitions | **Catalog exists; selection/render completeness UNVERIFIED.** | `asset-catalog.ts`; `scripts/audit-v36-editing-tools.mjs` fails its transition-selector assertion. |
| Text animations | **CSS keyframes/previews exist; per-letter/word model and export motion UNVERIFIED.** | `app/globals.css`, `asset-catalog.ts`, `edit-plan.ts`; single animation-name field is insufficient to prove export motion. |
| Text templates | **Template catalog/UI insertion and PRO badges are present; final export fidelity UNVERIFIED.** | `components/advanced-editor-tools.tsx`, `scripts/audit-v61-text-templates.mjs`; static check only. |
| Stickers/emoji | **Catalog and UI choices exist; full export persistence for every sticker UNVERIFIED.** | `asset-catalog.ts`, `edit-plan.ts`, export renderer. |
| Audio editing | **Volume/fade/speed/trim/split/export code paths exist in project, but full per-sound-clip tool compatibility matrix is NOT demonstrated.** | `edit-plan.ts`, `client-slicer.ts`, `audio-demux.ts`; current plan is not a complete arbitrary clip graph. |
| Premium asset lock/unlock | **Server-side allowlist and one-time unlock transaction exist. Export-time enforcement for every premium item UNVERIFIED.** | `app/api/editor/assets/unlock/route.ts`, `config/credit-pricing.json`. |
| History/resume | **IndexedDB persistence and history wiring are present; Android lifecycle survival UNVERIFIED.** | `lib/projects/store.ts`, `scripts/audit-v59-history-resume.mjs`. |
| AI script/narration/transcription | **Server routes, identity verification and credit ledger logic exist. Provider-started failure policy retains charges; runtime provider reliability UNVERIFIED.** | `app/api/script/route.ts`, `app/api/narration/route.ts`, `app/api/transcribe/route.ts`, `lib/billing/credits.ts`. |
| 2K export charge | **Server-side authenticated/idempotent charge after render is represented in route contract; actual UI ordering/runtime flow UNVERIFIED.** | `app/api/editor/export/charge/route.ts`. |
| Google Play Billing | **NOT PRESENT as verified Play purchase-token validation.** | Billing code shown uses Flutterwave and Google identity; no Android project/Play Billing integration in archive. |

## API / native compatibility audit

| API / capability | Evidence-based status |
|---|---|
| Blob URLs | Likely used by browser media/export code; should be supported in modern WebView, but revoke/lifetime behavior under long sessions needs runtime test. |
| IndexedDB | Project store uses IndexedDB for media/project persistence; quota/process-kill recovery is unverified. |
| localStorage | Used by browser-facing app state/auth/preferences; not suitable for large media blobs. Storage quota and multi-account persistence need tests. |
| File System Access API | No Android-native compatibility proof in archive; do not rely on it as the only picker/save path. |
| WebCodecs | No verified cross-device fallback established by the static audit. |
| MediaRecorder | Runtime availability/permissions not established; must test microphone permission and lifecycle on target WebView. |
| OffscreenCanvas / Workers | No verified worker-based decoding/thumbnails pipeline demonstrated. |
| SharedArrayBuffer | Must not be assumed; WebAssembly threading requires correct cross-origin isolation/runtime support. |
| ffmpeg.wasm | Dependency and FFmpeg core-copy script exist; Android memory/runtime performance remains unverified. |
| Capacitor Filesystem/Share/Browser/GoogleAuth | Declared in package and config, but generated Android plugin registration/sync cannot be inspected without `android/`. |
| Android permissions / Gradle / R8 | **UNVERIFIED** because `android/` is absent. |
| Assets/fonts/imports | Static asset catalog and build scripts exist; full resolution cannot be certified without dependency-backed build and actual APK export tests. |

## Audit script execution results

- **Passed (static only):** `audit-files`, `audit-v32`, `audit-v34`, `audit-v35`, `audit-v38`, `audit-v42`, `audit-v43`, `audit-v51`, `audit-v53`, `audit-v56`, `audit-v58`, `audit-v59`, `audit-v60`, `audit-v61`, `audit-v62`, `audit-pwa`, `audit-generation-fixes`, `audit-pricing`, `audit-provider-costs`, `audit-storage-cost-guards`.
- **Failed:** `audit-free-trial-policy` (expected `reserveRecapCredit(...scriptCredits...)` pattern missing); `audit-v36-editing-tools` (transition selector); `audit-v37-creative-tools` (expected catalog counts for filters/effects/transitions/text animations).
- **Not run:** dependency-backed lint/typecheck/build and Gradle build, because dependencies are not installed and native project/lockfile are absent. No live AI provider, billing, OAuth, or Android device tests were run.

## Priority remediation order

1. Replace the single-plan editor representation with a versioned clip/lane timeline model and migration.
2. Implement a shared, deterministic preview/export render graph and real export frame tests.
3. Enforce premium entitlements and credit reservation/settlement on the server for all paid export operations.
4. Pin dependencies, generate/inspect Android project, run build/test suite in CI.
5. Add Android lifecycle, memory, audio sync, touch gesture, and large-project performance tests.


## Post-audit change note (after the baseline report was completed)

A first implementation slice was added after the Phase 1 findings were written: `lib/editor/timeline-model.ts` and `scripts/test-timeline-model.mjs`, with the `test:timeline` npm script. The focused test passes and covers lane ordering, clip insertion, split, duplicate, selection toggle, lane conversion protection, incompatible drops, undo/redo and ripple-delete. README and `CHANGELOG-v63-timeline-model.md` document this as a **foundation only**. This does not close the critical finding about integration: the legacy editor UI, persistence, and export paths still need migration to the new schema.

## v63 follow-up verification (2026-10-20)

See `VERIFICATION-REPORT-v63.md` for the exact command outcomes. All 23 static audit scripts and the focused timeline model test pass after stale test assertions were corrected. This is not a clean build: full typecheck cannot resolve packages because dependencies are absent; lint/build executables are unavailable; offline npm installation fails with `ENOTCACHED`; the archive contains neither `android/` nor a Gradle wrapper, so Capacitor sync, Gradle assembly, and Android runtime checks are blocked. Preview/export pixel parity and Play Billing receipt validation remain unverified. Do not treat static audit passes as proof of those runtime features.


## v64 follow-up: editor wiring verification

The existing timeline UI now has long-press drag initiation for video beats and audio clips, frame snapping toggle, fit-to-screen zoom, haptic/lift feedback, audio/video state callbacks, and tap-again-to-deselect behavior. `scripts/audit-v64-timeline-wiring.mjs` statically checks these connections. This is not full unlimited-track virtualization or canonical timeline-model integration. Video dragging changes source intervals, so manual tests should verify discontinuous cuts. TypeScript/build/Capacitor/Gradle and exported-motion parity remain unverified; see `VERIFICATION-REPORT-v64.md`.

## v66 implementation update (2026-10-20)

The current working tree adds server-configured export pricing for 1080p, 2K, and watermark removal, with authenticated transactional Firestore settlement and an export-attempt idempotency hash. This remains credit consumption from the existing Flutterwave v4-funded wallet; it does not add Google Play Billing. The UI displays the estimated credit cost and asks for confirmation before rendering. Charges are submitted only after the renderer returns an output blob.

The timeline model now includes copy/paste helpers and timeline-wide ripple deletion. This is still a model-level capability: the editor UI has not yet migrated fully to the versioned timeline as its single source of truth. Preview/export parity and Android packaging remain unverified.

## v67 follow-up (2026-10-20)

- Added idempotent, authenticated export-credit refund endpoint for device save/share failures after settlement. See `CHANGELOG-v67-refund-delivery.md` and `VERIFICATION-REPORT-v67.md`.
- Removed the fixed count limit on extra media assets, retaining the per-file memory safety limit.
- Confirmed that extra media is currently stored in the project/media bin and is **not** composited as independent clips into the final MP4. This remains a high-priority functional gap, not a shipped feature.
- All available static audits and timeline model tests pass. Typecheck, lint, production build, Capacitor sync, Gradle assembly, live Flutterwave/Firebase tests, and real Android device tests remain unverified because dependencies/network and the Android project/wrapper are unavailable in the supplied archive.
