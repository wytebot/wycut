# v30.7 - native Google login + WyBuild Capacitor builds

- `/api/auth/google/verify` now uses `verifyGoogleIdentity`, which accepts Firebase ID tokens as well as raw Google ID tokens.
  Native sign-in exchanges the Google credential for a Firebase session and sends the Firebase token, which the old route always rejected.
- `lib/auth/google-native.ts` uses the WyBuild bridge (`window.WyBuildNative.auth.google`, Capacitor Firebase Authentication) when it exists,
  and keeps `@codetrix-studio/capacitor-google-auth` for `npm run android:debug`. Error messages now explain DEVELOPER_ERROR / SHA-1 problems.
- `wybuild/capacitor-patch.sh` lets WyBuild's Capacitor workflow install the Android foreground service.
- Required for native login in any build: the APK's signing SHA-1 (and the Play app-signing SHA-1 for Play installs) must be added to the
  Firebase Android app `app.wycut.vercel`, then a fresh `config/android/google-services.json` committed.
- Not run here: npm install, typecheck, an Android build or a phone test.
