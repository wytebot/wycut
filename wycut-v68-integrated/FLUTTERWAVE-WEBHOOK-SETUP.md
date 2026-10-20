# WyCut + WyBuild Flutterwave v4 payment flow

## Single registered webhook
Register only this webhook in the Flutterwave dashboard:

`https://wybuild-black.vercel.app/api/billing/webhook`

WyBuild verifies the webhook signature, retrieves the charge from Flutterwave v4 using its server-side OAuth credentials, and forwards only a verified successful WyCut charge to WyCut. WyCut validates the shared secret and matches the stored order, provider charge ID, NGN amount/currency, and customer email before granting recap credits. WyCut's own direct webhook route has been removed to avoid two competing webhook receivers.

## WyBuild Vercel variables
- `FLW_CLIENT_ID`
- `FLW_CLIENT_SECRET`
- `FLW_SECRET_HASH` (Flutterwave webhook secret hash)
- `FLW_ENCRYPTION_KEY` (merchant-provided base64 AES-256 encryption key for WyBuild card entry)
- `FLW_V4_BASE_URL` (`https://f4bexperience.flutterwave.com` in production; use the sandbox base URL with sandbox credentials)
- `WYCUT_PAYMENT_CONFIRM_URL=https://YOUR-WYCUT-DOMAIN/api/wybuild-payment-confirmation`
- `WYCUT_WEBHOOK_SHARED_SECRET` (long random secret)

## WyCut Vercel variables
- `FLW_CLIENT_ID`
- `FLW_CLIENT_SECRET`
- `FLW_ENCRYPTION_KEY` (same merchant encryption key format used by the browser card encryption flow)
- `FLW_V4_BASE_URL` (same environment as WyBuild)
- `WYBUILD_WEBHOOK_SHARED_SECRET` (must exactly match WyBuild's `WYCUT_WEBHOOK_SHARED_SECRET`)
- `FIREBASE_SERVICE_ACCOUNT_JSON_BASE64`
- `NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID`

The Flutterwave client credentials and encryption key must belong to the same merchant/environment used by the registered webhook. Never place client secrets, service-account credentials, or shared webhook secrets in client-side variables. `NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID` is an OAuth client ID, not a secret.

## Required sandbox tests
1. A successful charge credits exactly the ordered recap quantity once.
2. A duplicate webhook does not grant duplicate credits.
3. Failed/pending/incorrect amount/currency/reference/charge ID transactions grant no credits.
4. A webhook forwarding failure returns a retryable server error in WyBuild logs.
5. A user cannot check another account's order or submit a different user's narration.

Do not enable live charges until the exact Flutterwave v4 merchant product accepts the card/payment-method/charge payloads and an end-to-end sandbox test passes.
