# WyCut v23 engineering pass

## Changed
- Extracted `DashboardWorkspace` from the route module into `components/dashboard-workspace.tsx`; legacy source routes redirect to `/dashboard`.
- Increased AI generation output budget to 10,000 tokens and default timeout to 75 seconds (90-second maximum); Gemini thinking budget is set to zero.
- Changed Flutterwave settlement to validate the verified amount against the stored order amounts and grant the stored recap quantity, avoiding price-book changes breaking in-flight orders.
- Moved lifetime-free allowlisting to server-only `LIFETIME_FREE_EMAILS`; added email normalization for Gmail aliases.
- Added HMAC-hashed account/email/device trial claims, transactional daily cap, one-trial reservation, trial refund cleanup, and a server-authoritative free-trial response field. Added `TRIAL_PEPPER` and `FREE_TRIAL_DAILY_CAP` to `.env.example`.
- Raised narration batch reservation limit from 25 to 80 calls per recap.
- Added a token-refresh helper and used it immediately before script and narration requests.
- Tightened OTP transaction-reference validation and require `requires_auth` before submitting an authorization PUT.
- Documented trial claim hashes in the privacy policy.

## Verification status / blockers
- `npm install --package-lock-only` timed out against the package registry; offline retry failed because the required packages were not cached. No lockfile could be generated safely.
- `npm run typecheck`, `npm run lint`, and `npm run build` could not be meaningfully validated because dependencies are absent. Typecheck output is dominated by missing package/type declarations; lint/build report `eslint`/`next` not found.
- Firestore transaction behavior, the Flutterwave sandbox, Firebase App Check, Play Integrity, scheduled reservation cleanup, real-device FFmpeg/WORKERFS, and the requested 5-run long-script acceptance test remain unverified.
- Device ID is a first-party browser-generated identifier and is not App Check or Play Integrity attestation. Configure and enforce those controls before treating the trial system as resistant to device spoofing.
- Reservation expiry currently runs lazily on the next credit reservation; a scheduled job still needs to invoke cleanup periodically.
- AI validation repair/retry, shared authenticated-user rate limiting, JWT-issuer-specific verification, full three-step UI decomposition, FFmpeg self-hosting/WORKERFS, script progress streaming, and full acceptance tests remain outstanding.
