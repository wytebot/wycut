# WyCut billing — Flutterwave v4 verified by WyBuild

Flutterwave should call the WyBuild webhook only: `https://wybuild-black.vercel.app/api/billing/webhook`. WyBuild uses its v4 OAuth credentials to retrieve and verify the charge, then sends the verified transaction to WyCut over HTTPS.

## WyBuild Vercel environment variables
- `FLW_CLIENT_ID`
- `FLW_CLIENT_SECRET`
- `FLW_V4_BASE_URL=https://f4bexperience.flutterwave.com` for production (use `https://developersandbox-api.flutterwave.com` with sandbox credentials)
- `FLW_SECRET_HASH` (exact secret hash from the Flutterwave dashboard)
- `WYCUT_PAYMENT_CONFIRM_URL=https://YOUR-WYCUT-DOMAIN/api/wybuild-payment-confirmation`
- `WYCUT_WEBHOOK_SHARED_SECRET` (long random secret)

## WyCut Vercel environment variables
- `FLW_CLIENT_ID` and `FLW_CLIENT_SECRET` for v4 charge initiation and authenticated status reconciliation
- `FLW_V4_BASE_URL` matching the account environment
- `FLW_V4_CHARGES_PATH=/charges`
- `FLW_SECRET_HASH` only if you intentionally configure the direct WyCut webhook (not recommended for the single-webhook setup)
- `WYBUILD_WEBHOOK_SHARED_SECRET` exactly matching WyBuild's `WYCUT_WEBHOOK_SHARED_SECRET`
- `FIREBASE_SERVICE_ACCOUNT_JSON_BASE64` for Firebase Admin / Firestore
- `NEXT_PUBLIC_FLW_CARD_RSA_PUBLIC_KEY` only if required by your enabled direct-card v4 product

WyCut validates the shared secret, reference, stored order, exact amount/currency, provider charge ID and customer email before granting recap credits. The settlement is idempotent. Keep all client secrets server-side and test with sandbox credentials first. The exact direct-card charge payload/card encryption fields can vary by the enabled Flutterwave v4 merchant product; verify those against the merchant's v4 docs before production.
