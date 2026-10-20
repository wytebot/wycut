# WyCut v66 — Flutterwave export billing and timeline operations

## Implemented
- Kept the existing Flutterwave v4 purchase and credit-pack flow; no Google Play Billing dependency or purchase flow was added.
- Expanded server-side editor export settlement to price 1080p exports, 2K exports, and watermark removal from server-owned configuration.
- Added server-side identity/origin checks, Firestore transactional credit deduction, per-user idempotency, and a payload/specification hash to reject reusing one export ID for different export options.
- Added a pre-export confirmation showing the configured credit cost. Paid export settlement is called only after the renderer returns a non-empty output Blob.
- Added timeline model copy/paste helpers and made ripple delete move later clips across all lane types rather than only the source lane.
- Added regression assertions for copy/paste, cross-lane ripple deletion, export pricing and idempotency.

## Pricing
- 720p with watermark: 0 credits.
- 1080p: 3 credits.
- 2K: 5 credits.
- Watermark removal: additional 2 credits.
- Lifetime-free accounts remain exempt according to the existing server entitlement policy.

## Known limitations
- This does not claim that all timeline model features are integrated into the visual editor. The existing editor still has a legacy beat/audio representation alongside the versioned timeline model.
- A local browser download cannot provide a cryptographically verifiable proof of successful user-side file persistence. Settlement happens after rendering and before delivery to avoid allowing a client to receive a paid export when the server rejects settlement.
- Premium asset entitlement is unlocked on apply through the existing server endpoint, but every catalog item has not yet been independently verified for render/export parity.
- The project archive does not include installed dependencies or a complete Android Gradle project; production build and real-device verification remain outstanding.
