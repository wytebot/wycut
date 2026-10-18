# WyCut Google-only authentication setup

The `/login` page uses **Google sign-in only**. On the web, it attempts a Google account-selection popup first and falls back to redirect sign-in if the popup is blocked or unsupported. Capacitor native builds continue to use the existing native Google sign-in integration.

## Firebase environment variables

The `.env.example` file now contains the Firebase Web SDK values for project `wycut5`. For local development, copy it to `.env.local` and keep the existing Firebase values. In Vercel, add these `NEXT_PUBLIC_FIREBASE_*` variables under **Project → Settings → Environment Variables** using the values shown in `.env.example`, then redeploy. These web SDK values are public client configuration; do not put service-account credentials in any `NEXT_PUBLIC_` variable.

## Firebase Console checklist

1. Open Firebase Console for project `wycut5`.
2. Go to **Authentication → Sign-in method** and enable **Google**.
3. If WyCut should accept only Google sign-ins, disable **Email/Password** and **Phone** under Sign-in method. This prevents those providers from being used for new sign-ins through Firebase.
4. Under **Authentication → Settings → Authorized domains**, add the production Vercel domain and any custom domain. The Firebase client uses `wycut5.firebaseapp.com` as its auth domain.
5. In Vercel, set `FIREBASE_SERVICE_ACCOUNT_JSON_BASE64` to the base64-encoded JSON for a Firebase service account from the same `wycut5` project. This must be a server-only environment variable (do not prefix it with `NEXT_PUBLIC_`). Redeploy after changing it. The server uses Firebase Admin to verify Firebase ID tokens.
6. Keep `NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID` configured if required by the existing native Google OAuth and Google Drive integration. Firebase web sign-in does not replace the separate Google Drive OAuth permission flow.

## Behavior and security notes

- The Firebase web client config is public configuration, not a private key. Never expose the Firebase service-account JSON or Flutterwave secret in a `NEXT_PUBLIC_` variable.
- Login state currently uses browser session storage to fit the existing API contract. This is not an HttpOnly server session cookie.
- The Google popup requests account selection with `prompt: select_account`; popup-blocked or unsupported cases fall back to redirect.
- Test on the deployed HTTPS domain. A successful local build does not prove that Google OAuth, authorized domains, service-account permissions, or the native OAuth configuration are correct.
