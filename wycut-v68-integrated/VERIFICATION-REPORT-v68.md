# WyCut v68 verification report

Date: 2026-10-20

## Passed

| Check | Result |
|---|---|
| `npm run test:all-static` | PASS |
| All `scripts/audit-*.mjs` scripts | PASS |
| Timeline model tests | PASS |
| Motion fixture with two time-gated overlays | PASS — 20 frames, 11 distinct hashes during motion |
| Audio mix fixture | PASS — source audio, additional track, trim, delay and fades |
| TS/TSX syntax transpile check | PASS — 72 files, zero syntax diagnostics |
| ZIP archive integrity | PASS after packaging |

## Blocked / not verified

| Check | Result and reason |
|---|---|
| `npm run lint` | BLOCKED: `eslint` is not installed |
| `npm run build` | BLOCKED: `next` is not installed |
| `npm run typecheck` | BLOCKED by missing Next/React/Capacitor/Firebase/Node type dependencies; the full semantic check cannot be trusted until install completes |
| `npm run build:capacitor-web` | BLOCKED: `NEXT_PUBLIC_API_BASE_URL` is not configured in the environment |
| `npm run android:debug` | BLOCKED: missing `NEXT_PUBLIC_API_BASE_URL` and `NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID`; no generated `android/` directory or Gradle wrapper is present |
| Flutterwave v4 live/sandbox charge + settlement + refund | NOT RUN: no `.env`, `FLW_CLIENT_ID`, `FLW_CLIENT_SECRET`, `FLW_ENCRYPTION_KEY`, `WYBUILD_WEBHOOK_SHARED_SECRET`, or deployed API URL configured in this environment |
| Android WebView preview/export parity | NOT RUN: no APK and no real device available |

`npm install --offline` fails because required package metadata is not cached. A normal install timed out. No fake credentials or live transactions were attempted.

## Functional changes in this package

- Multiple added video/image assets are timed visual layers in preview and MP4 export.
- Added visual clips are visible on their own timeline row and support long-press move with snap/drop preview.
- Audio tracks preview in sync with the playhead and are mixed into video export with per-track timing, volume and fades.
- Export visual layers are mapped across the kept main-video segments after cuts/reordering.
- Export attempt IDs whose credits have already been refunded are rejected on replay.

## Still risky / incomplete

- The versioned timeline model is integrated and persisted, but the legacy beat/script state remains authoritative for some main-track trim/split/delete operations. This is not yet a full single-source-of-truth migration.
- Motion test proves temporal frame changes in FFmpeg and validates the app wiring; it does not prove pixel-identical preview/export for every catalog item or execute the FFmpeg WASM package in Android WebView.
- Live Flutterwave transaction, webhook forwarding, Firestore ledger settlement/refund and device-delivery failure paths still require end-to-end sandbox tests.
