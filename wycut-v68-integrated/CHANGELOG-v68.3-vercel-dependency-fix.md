# WyCut v68.3 — Vercel dependency install fix

## Changes
- Corrected `@capacitor/filesystem` from the unresolvable `5.0.7` pin to `5.0.6`.
- Corrected `@capacitor/share` from the unresolvable `5.0.7` pin to `5.0.6` as a preventive fix for the same Capacitor plugin version issue.
- Kept the v68.2 Google sign-in changes and the native Capacitor Google authentication implementation.
- No intended changes to editor behavior, Firebase project configuration, or Flutterwave billing.

## Verification limits
- Confirmed no `5.0.7` dependency pins remain in `package.json`.
- Confirmed package manifest parses as valid JSON and ZIP integrity passes.
- A live Vercel install/deployment and live web/native Google login were not available from this environment; do not treat these as end-to-end verified.
