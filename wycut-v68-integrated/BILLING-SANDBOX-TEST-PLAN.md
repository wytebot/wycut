# WyCut Flutterwave v4 sandbox test plan

## Minimum WyCut variables
- `FLW_CLIENT_ID` and `FLW_CLIENT_SECRET` (v4 OAuth client credentials)
- `FLW_ENCRYPTION_KEY` (merchant-provided base64 AES-256 key)
- `FLW_V4_BASE_URL` (sandbox endpoint while testing)
- `WYBUILD_WEBHOOK_SHARED_SECRET` (same value as WyBuild `WYCUT_WEBHOOK_SHARED_SECRET`)
- `FIREBASE_SERVICE_ACCOUNT_JSON_BASE64`
- `NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID`

Configure the WyBuild webhook URL in Flutterwave: `https://wybuild-black.vercel.app/api/billing/webhook`. Do not register WyCut's domain as a second webhook.

## Test cases
1. Sign in with Google, start one-recap purchase, complete any required bank challenge, and confirm WyCut remains pending until WyBuild forwards the verified transaction.
2. Confirm one successful payment increases recap credits by exactly one. Repeat with the 10-pack and expect ten credits.
3. Replay the same webhook and confirm no additional credits are added.
4. Confirm pending, failed, wrong-reference, wrong-amount, wrong-currency, and wrong-provider-ID events do not add credits.
5. Try checking another account's order and altering narration text/index IDs; both must be rejected.
6. Disconnect/revoke Drive permissions and confirm export gives a clear reconnect message rather than claiming success.

A successful local build does not prove the merchant-specific Flutterwave v4 request format. Keep sandbox mode until every test passes against the actual enabled merchant product.
