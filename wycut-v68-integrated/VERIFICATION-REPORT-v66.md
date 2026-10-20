# Verification report — WyCut v66

## Automated checks (run 2026-10-20)
- `npm run test:timeline`: PASS — ordering, split, duplicate, copy/paste, selection toggle, lane validation, undo/redo, and timeline-wide ripple delete.
- `npm run audit:v66`: PASS — server-configured export prices, identity/origin/transaction checks, idempotency spec hash, client cost confirmation, and Flutterwave-only purchase architecture.
- All 26 `scripts/audit-*.mjs` static audits: PASS.
- `npm run typecheck`: BLOCKED/FAIL because dependencies and type declarations (including Next.js, React, Firebase Admin, and Node types) are not installed.
- `npm run lint`: BLOCKED because ESLint is not installed.
- No `node_modules`, package lockfile, Android project, or Gradle wrapper was supplied, so production build, Capacitor sync, and Gradle assembly could not be run.

## Billing behavior
- Purchase of credits continues through the existing Flutterwave v4 server integration and verified settlement path.
- Editor export charges are separate credit consumption, not a payment-provider charge.
- Server price book is authoritative; the browser only displays a cost estimate.
- Export charges are keyed by user + export attempt ID. Reusing an attempt ID with different quality/watermark settings is rejected.

## Not verified in this environment
- Next.js typecheck/lint/production build because dependencies are not installed and no lockfile was supplied.
- Capacitor sync or Gradle APK assembly because the archive has no Android project/wrapper.
- Real Android WebView memory, haptics, gesture, playback, and download behavior.
- Flutterwave live/sandbox charge, webhook, and restore flows against configured merchant credentials.
- Pixel-by-pixel preview/export parity for every effect and animation.
