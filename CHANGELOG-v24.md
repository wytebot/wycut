# WyCut v24 — two-generation lifetime trial

## Changed
- Replaced the old one-use free-trial boolean check with a fixed allowance of **two lifetime free generations** tracked transactionally across the account/Google-sub, normalized email, and device claim documents.
- Trial claim documents contain HMAC hashes for identifiers, per-claim usage counts, and usage IDs; legacy one-use claim documents are interpreted as one generation already used so existing users can receive at most one additional free generation rather than being reset to two.
- Failed generation reservations refund one trial slot only when no script was persisted, decrementing account/email/device claim counts and the global daily counter without deleting another in-flight reservation's claim.
- Added server-authoritative `freeTrialRemaining` and `freeTrialAvailable` to billing entitlement; dashboard displays the remaining free generations when entitlement can be checked for the current device.
- Changed the global daily emergency cap default from 100 to 3 free generations per UTC day. This cap is separate from the two-lifetime-generation account/device rule and can be configured with `FREE_TRIAL_DAILY_CAP`.
- Added `npm run audit:trial` as a dependency-free static regression audit.
- Paid users with available recap credits are not blocked solely because `TRIAL_PEPPER` is unset; the pepper is required only when reserving a free-trial generation.

## Verification performed
- `node scripts/audit-free-trial-policy.mjs`: PASS.
- Reviewed the transaction path for reservation, per-claim count increments, and failed-script refunds.

## Verification not completed
- Typecheck, lint, and Next.js production build cannot be verified in this environment because dependencies are not installed (`next`, `eslint`, Firebase Admin types, and other packages are missing). The TypeScript compiler therefore emits dependency/type-declaration errors; those are not evidence that the changed code compiles.
- Firestore emulator/concurrency tests, App Check enforcement, Play Integrity attestation, Flutterwave sandbox, and real-device generation/narration/cutting/Drive tests were not run.
- The device identifier remains client-supplied and spoofable without the separately required App Check/Play Integrity enforcement. Do not treat the device limit as strong anti-abuse protection until those attestation checks are enforced server-side.
