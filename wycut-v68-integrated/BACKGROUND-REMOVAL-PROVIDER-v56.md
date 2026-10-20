# WyCut AI background removal — provider policy

WyCut must not require or call a separate background-removal AI provider. AI work should use the existing configured providers (Gemini, OpenAI, and Deepgram) where the selected provider actually supports the operation.

## Important capability boundary

Gemini can analyze images and video and can help identify a subject, but the standard Gemini text/multimodal API does not directly return a production-ready transparent-background video or reliable per-pixel segmentation masks for every frame. Do not claim AI background removal works merely because `GEMINI_API_KEY` is configured. Actual removal needs a segmentation/matting model or a real mask-generation and compositing pipeline. Manual masks and chroma key remain local tools and need no separate AI provider.

The old `WY_CUT_BG_REMOVE_API_URL`, `WY_CUT_BG_REMOVE_API_KEY`, `WY_CUT_BG_PROVIDER_USD_PER_MINUTE`, `WY_CUT_BG_PROVIDER_USD_PER_GB`, `WY_CUT_USD_PER_CREDIT`, and `WY_CUT_BG_COST_SAFETY_MULTIPLIER` variables are retired and must not be configured.

## Billing policy

Paid AI operations must be charged from server-side credit logic, based on the provider actually selected, actual/estimated model usage, source duration/complexity, output length, and allocated operational costs. The business target is approximately 75% gross profit margin, meaning total attributable costs should be about 25% of collected revenue. Provider usage that is not available synchronously must be reconciled from usage metadata/provider reports. Never claim a guaranteed 75% margin where the model's real usage cost is unknown; use conservative estimates until reconciliation is available.
