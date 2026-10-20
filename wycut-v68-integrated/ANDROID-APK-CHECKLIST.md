# WyCut APK checklist (Capacitor)

The APK bundles the static UI; every API call (credits, transcription, script, narration, payments) goes to your deployed HTTPS backend.

## One-time setup (Google sign-in)
Native login = Google's account chooser inside the app, then a Firebase session (no hourly sign-out). It needs three things to line up:
1. **Package**: the app id is `app.wycut.vercel` (it has an Android OAuth client in `config/android/google-services.json`). The old `app.wycutrecap.vercel` had no SHA-1 registered, so it could never sign in.
2. **Web client ID**: set `NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID=725460027937-u6vvtrcaj07tsm5k2bece3dcfc4vf4tg.apps.googleusercontent.com` (the *Web* client) on Vercel and as a GitHub secret.
3. **Signing key**: the APK must be signed with the key whose SHA-1 is registered in Firebase.
   - The file you uploaded registers `1A:DD:8A:E4:AC:21:F9:AC:E6:CF:C0:CF:6C:F6:73:B0:5A:AF:C9:BE`. If you still have the keystore behind it, base64 it into the secrets below.
   - Otherwise run **Actions > Create Android signing keystore** once, copy its 4 values into GitHub secrets (`ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`), delete the artifact, then add the SHA-1 shown in the run summary under Firebase > Project settings > `app.wycut.vercel` > Add fingerprint.
4. Backend env vars (Vercel): `CAPACITOR_ALLOWED_ORIGINS=https://localhost,capacitor://localhost`, Firebase Admin, Flutterwave, AI keys, `TRIAL_PEPPER`, `FREE_TRIAL_DAILY_CAP=60`. In Firebase Authentication, the Google provider must be enabled.
5. GitHub secrets: `NEXT_PUBLIC_API_BASE_URL` (backend origin only, no `/api`) and `NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID`. `google-services.json` is already bundled, so `GOOGLE_SERVICES_JSON_BASE64` is optional.

The build prints the APK's signing SHA-1 (and shows it in the run summary): it must equal the fingerprint in Firebase. If the app says DEVELOPER_ERROR / error 10, they differ.

## Build
- GitHub: push to `main` or run **Build WyCut Android APK**. The artifact is `wycut-debug-apk-<run number>`; the run number becomes the Android versionCode, `package.json` version becomes versionName.
- Local: `npm install && npm run audit:files && npm run audit:pricing && npm run android:debug` (needs Java 17 + Android SDK). Output: `android/app/build/outputs/apk/debug/app-debug.apk`.

## Test on a real phone before sharing
- Sign in with Google; the header shows your credit balance (new accounts get 30 welcome credits).
- Subtitle file -> script (14 credits) -> narration; confirm the balance drops and a forced failure refunds.
- Small video file (< 80 MB) -> transcription; confirm the pre-check, charge, and that a retry does not charge twice.
- Top up with a card: PIN/OTP, and 3-D Secure (opens the browser, then return to the app and tap Check status).
- Drive export, saving files via the share sheet.
- Check the first page on a small phone (360 px wide) for cut-off text.

## Not done here
- Launcher icon: the default Capacitor icon is used. Run `npx @capacitor/assets generate` with a 1024 px icon if you want WyCut branding.
- Play Store release needs a signed release build (`assembleRelease` + keystore); this project builds debug APKs.
