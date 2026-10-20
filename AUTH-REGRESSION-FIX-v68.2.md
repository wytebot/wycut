# WyCut v68.2 — Google Sign-In regression hardening

## Changes
- Replaced custom `initializeAuth()` persistence-array initialization with Firebase's standard `getAuth(firebaseApp)` initialization. The web login flow explicitly applies `browserLocalPersistence` before OAuth. This avoids Auth initialization differing depending on module-load order.
- Added step-specific Firebase authentication diagnostics to the login page. If the deployed sign-in still fails, the visible error and browser console identify whether failure occurred during session restoration, persistence setup, popup OAuth, redirect OAuth, or session saving, including the Firebase error code.
- Added a clear message for `auth/argument-error` rather than leaving users with an unexplained SDK error.
- No changes to editor behavior, user data handling, or Flutterwave billing.

## Verification
- TypeScript transpile syntax checks passed for `app/login/page.tsx` and `lib/firebase/client.ts`.
- This environment cannot run a live Firebase OAuth transaction or a Vercel deployment. After deploying, test `/login` on the production domain. If it still fails, the added step/code detail should pinpoint the failing operation without guessing at Firebase Console settings.
