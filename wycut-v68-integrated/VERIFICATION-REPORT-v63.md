# WyCut v63 — Verification report

Date: 2026-10-20

## What was actually run

| Check | Result | Evidence / limits |
|---|---|---|
| Timeline model tests | PASS | `node scripts/test-timeline-model.mjs`; exercises lane ordering, insertion, split, duplicate, deselection-on-second-tap, lane conversion guard, incompatible move rejection, undo/redo, and ripple delete. The script compiles `lib/editor/timeline-model.ts` with TypeScript before running assertions. |
| Static audit scripts | PASS 23/23 | All `scripts/audit-*.mjs` plus timeline test pass after repairing stale assertions in `audit-free-trial-policy.mjs`, `audit-v36-editing-tools.mjs`, and `audit-v37-creative-tools.mjs`. These are static source checks, not runtime integration tests. |
| Pricing model script | PASS, with warning | Provider-cost script reports the lowest modeled margin as 68.2%; figures are estimates, not live invoices. This does not prove the desired 75% margin on every real operation. |
| Full TypeScript typecheck | BLOCKED/FAIL | `npm run typecheck` exits 1 because dependencies and their type declarations are not installed. Reported examples include missing `next`, `react`, `@capacitor/*`, Firebase/provider packages, and Node types. The resulting JSX/type errors are not reliable evidence of source-level correctness until dependencies are installed. |
| ESLint | BLOCKED | `npm run lint` exits 127: `eslint` executable is unavailable because `node_modules` is absent. |
| Next production build | BLOCKED | `npm run build` exits 127: `next` executable is unavailable because `node_modules` is absent. |
| Dependency installation | BLOCKED | `npm install --offline --ignore-scripts --no-audit --no-fund` exits with `ENOTCACHED`; required packages are not present in the local npm cache. Network access is unavailable in this environment. |
| Capacitor sync | UNVERIFIED/BLOCKED | `android/` is not included in the supplied project archive and Capacitor CLI is not installed. Sync cannot create a verified native project without the CLI/dependencies. |
| Gradle assembleDebug/Release | UNVERIFIED/BLOCKED | No `android/` directory or Gradle wrapper is included in the source archive. No APK/AAB was built. |
| Android device tests | UNVERIFIED | No Android emulator/device runtime is available in this check. |
| Shared preview/export motion parity | NOT IMPLEMENTED/UNVERIFIED | No render-sample frame-comparison test exists; CSS preview presets and FFmpeg export mappings are not a shared renderer. |
| Google Play Billing receipt validation | UNVERIFIED | Static checks do not establish Play Billing integration; no verified Android billing plugin or native project was present. |

## Source-audit corrections

Three static checks were stale rather than evidence of broken current features:

- The free-trial audit expected `scriptCredits`, but the route passes `requiredCredits` to `reserveRecapCredit`.
- The transition audit expected obsolete wording; the editor currently wires `onTransitionChange` and has an export-boundary note.
- The creative-tools audit assumed exactly 30 filters/effects/transitions and exactly 31 animations. The catalog has 30+ filter presets, 30+ effect presets, 18 transition choices, and a much larger animation catalog. The assertion now checks the real stated inventory without claiming 30 transitions.

The revised checks prove source structure only. They do not prove that every catalog item renders correctly, has real motion, survives export, or is supported by all media types.

## Important implementation boundary

`lib/editor/timeline-model.ts` is a renderer-neutral foundation, not a completed timeline rebuild. It is not yet wired into the legacy editor UI, project autosave/migration, export renderer, or Android lifecycle handling. Drag-and-drop gestures, virtualization, waveform/frame workers, snapping guides, haptics, persistent unlimited undo history, multi-select operations, keyframe editing UI, and full audio/video tool compatibility remain outstanding or unverified. The project should not be described as release-ready based on this report.
