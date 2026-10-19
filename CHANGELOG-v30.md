# v30 — pay-as-you-go credits

## Pricing model
- Replaced per-recap pricing with non-expiring credit packs: $1/₦1,400 → 100 credits, $3 → 330, $7 → 800, $15 → 1,800. No subscription, no gateway surcharge (price shown = price paid).
- Usage burns credits per step: transcription (2 credits / 5 min audio), script (14, or 18 for very long transcripts), narration (5 credits / 1,000 characters).
- 30 one-time welcome credits replace the old two free generations (about $0.07 of provider cost per new user instead of ~$0.30 per free recap).
- All rates in `config/credit-pricing.json`; `npm run audit:pricing` verifies >=50% margin on example jobs at the cheapest pack (typical 55-62%).

## Fixes
- Video transcription was previously unbilled (only capped at 80 parts/day). It now charges credits, refunds failed parts and has a minimum charge based on audio size.
- Balance is checked before any paid step starts; paid transcript parts and narration segments are cached in the browser so a retry/top-up never pays twice; narration batches retry automatically.
- Welcome-credit abuse lock now normalises Gmail dots/plus-addresses and honours claims made by the old free-trial code.
- Webhook failure path no longer depends on today's price book (orders made before a price change still reconcile).
- Whisper transcription fallback can be disabled with TRANSCRIBE_ALLOW_WHISPER_FALLBACK=0.
- Legacy balances/orders: old recap credits convert to 150 credits each; in-flight single_recap / recap_pack_10 orders still settle (200 / 1,500 credits).

## Not verified here
No dependencies were installed in the build environment: `npm install`, `npm run typecheck`, lint, build and Flutterwave sandbox tests must be run before going live. Static TypeScript checking was done with dependency errors filtered out.
