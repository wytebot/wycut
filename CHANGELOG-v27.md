# WyCut v27 — Generate recap reliability fix

## Fixed
- Fixed a runtime auth bug in Firebase ID-token verification: `decoded.normalizeEmail(...)` called a nonexistent method and caused valid Firebase Google sign-ins to be rejected. It now calls the local `normalizeEmail(...)` helper.
- Removed the two-field Firestore cleanup query that could require a composite index before every recap reservation. Expired reservations are now found with a bounded `status == reserved` query and filtered in application code.
- Added server-side structured logs for credit reservation, generation-provider, and refund failures without returning provider internals or secrets to the browser.
- Added actionable error codes/messages for missing AI provider configuration, timeouts, invalid AI output, and billing database setup failures.
- Added `npm run audit:generation` to guard against regressions in the two primary blockers.

## Verification limits
- `npm install --package-lock-only --ignore-scripts --no-audit --no-fund` timed out in this environment.
- Typecheck, lint, Next.js build, live Firebase authentication, Firestore transaction, and live AI provider tests were not run. Run them in CI/Vercel before production deployment.
