# WyCut storage and AI cost policy

## Storage placement

| Data | Authoritative location | Firestore policy |
|---|---|---|
| Filter/effect/animation/transition definitions | Bundled TypeScript catalog | Do not store catalog definitions or preview media per user |
| Short asset preview animation | CSS and local UI | Never upload preview frames or clips |
| Local project draft and edit state | IndexedDB | Do not mirror every keystroke/timeline drag to Firestore |
| Transcription cache | IndexedDB, disposable | No Firestore copy |
| Finished production assets | User's Google Drive | Store only a compact reference in local history; avoid media blobs in Firestore |
| Credit wallet and audit ledger | Firestore | Required for trustworthy balance accounting |
| Premium asset unlock | Firestore | One compact entitlement/ledger entry per unlock, not a copy of the asset |
| Recap usage/script | Firestore usage metadata | Script text is retained only because server-side narration validation relies on it; do not store rendered media or base64 narration here |

Firestore will still grow with billable usage, credit ledger entries, and premium unlocks. Those are required operational records. The goal is to prevent large media files, repeated preview assets, and per-edit state from inflating Firestore.

## AI operation lifecycle

1. Validate identity, request size, rate limit, and available credits.
2. Reserve credits and create one usage record.
3. Immediately before the first model call, mark the usage `started`.
4. Started requests are not refunded automatically because the provider may have billed the request even if the user cancels or the response is unusable.
5. Only failures before a provider request begins may release the reservation.
6. Do not automatically retry or invoke a fallback provider after a billable request starts. A user can explicitly initiate a new operation and see its cost first.
7. Bound output tokens by requested runtime, enforce per-account rate limits, and keep provider SDK retries disabled.

## Operations to monitor

- Firestore document count/size for `wycut_usage`, `wycut_credit_ledger`, `wycut_editor_asset_unlocks`, and `wycut_users`.
- AI provider spend per successful and failed request, by model and requested runtime.
- Rate-limit rejections, provider timeouts, invalid responses, and started jobs without a terminal state.
- IndexedDB storage errors and Drive export failures.

Do not enable verbose prompt/transcript logging in production. Never log API keys, OAuth tokens, full transcripts, or narration base64.

## Editor export and visual-tool costs (v52)

- 720p and 1080p local exports do not call an AI provider and do not create per-export Firestore media documents.
- 2K exports are separately priced at `editorAssets.premiumExportCostCredits` (currently 5 credits). The server verifies the Google identity, checks the wallet in a Firestore transaction, and records one compact `editor_export_2k` ledger row keyed to the user/export attempt. This is financial accounting metadata only; the rendered video remains local until the normal Drive export flow uploads it.
- 2K credit deduction occurs only after the local render has completed and before the download is handed to the user. A failed render does not charge; an idempotent ledger ID prevents a retried charge request from deducting twice for the same attempt.
- The visual filter/effect catalog is bundled in the app and processed locally. No effect preview, filter, keyframe, text transform, or transition writes media payloads to Firestore.
