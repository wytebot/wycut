# WyCut v57 — Provider-aligned billing policy

- Removed the policy of requiring a separate AI background-removal provider. Use existing Gemini/OpenAI/Deepgram integrations only when they support the operation; do not pretend Gemini directly produces a transparent video.
- Raised configured credit rates for transcription, script generation and narration to target approximately 75% gross margin at the cheapest per-credit pack, using a 1.5x cost factor to conservatively account for provider cost variance, infrastructure, payment and operational leakage.
- Raised the pricing audit's minimum target to 75% gross margin.
- Clarified that actual margin must be reconciled against real provider usage and payment/operational costs; estimates alone cannot guarantee a margin. The pricing audit now requires at least 75% estimated gross margin on its example jobs at the cheapest credit rate.
- Manual masks and chroma key remain local/non-AI tools. Gemini-only video background removal is not claimed as operational until a segmentation/matting and compositing pipeline is implemented.
