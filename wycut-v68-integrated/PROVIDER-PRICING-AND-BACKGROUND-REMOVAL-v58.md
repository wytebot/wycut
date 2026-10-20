# WyCut v58 — provider-aware credit prices and model capability review

## Decision

Keep the existing $1 = ₦1,400 starter pack and the existing credit-pack prices. The worst modeled example job stays above the requested 65% gross margin at the lowest credit price in the largest pack. The lowest audited margin is 68.2%, for a five-minute OpenAI Whisper transcription chunk.

Transcription pricing is now provider-aware:

- Gemini Flash-Lite transcription: 80 seconds per credit (4 credits per 5-minute chunk).
- OpenAI Whisper fallback: 18 seconds per credit (17 credits per 5-minute chunk).
- The server independently chooses the configured provider and enforces its corresponding price.
- The client asks `/api/transcribe/estimate` which provider is configured before it checks the full-job balance, so it should not block a Gemini job using Whisper's higher estimate.
- If the estimate endpoint is temporarily unavailable, the client falls back to the conservative local estimate; the server remains the authority for the actual charge.

The 1.5x cost factor remains in the audit to reserve for provider-price variance, payment processing, infrastructure and operational leakage. The modeled margin is a planning safeguard, not a guarantee of net profit.

## Existing AI models and suitability

| Operation | Wired model path | Pricing basis in WyCut | Capability decision |
|---|---|---|---|
| Transcription | Gemini Flash-Lite; Whisper only when Gemini is not configured | Audio duration, with different rates for Gemini vs Whisper | Suitable for speech-to-text. |
| Recap/script generation | Gemini 2.5 Flash, with OpenAI GPT-4o-mini as the configured alternative | Transcript size, source duration, target runtime and beat count | Suitable for text reasoning and writing. |
| Narration | OpenAI TTS-1 when `OPENAI_API_KEY` exists; otherwise Deepgram Aura | Characters generated | Suitable for speech generation. |
| Background removal | Manual brush mask and chroma key are local; AI button remains unavailable | No AI credits charged for a feature that cannot complete | Standard Gemini/OpenAI text/audio APIs do not return a reliable per-frame alpha matte for a full transparent video. Deepgram is speech-focused and is not a video segmentation model. Do not pretend a text response is a usable matte. |

## Provider pricing assumptions

These are conservative list-price assumptions used for the credit audit, not values retrieved from live invoices during this run:

- Gemini transcription: $0.0052 per 300-second chunk allowance.
- OpenAI Whisper fallback: $0.006/minute, or $0.03 per 300-second chunk.
- Script generation allowance: $0.046 per standard generation, scaled by target runtime in the audit.
- Narration allowance: $0.015 per 1,000 characters for OpenAI TTS-1 / Deepgram Aura planning.
- A 1.5x multiplier is applied to modeled costs.

The configured credit rate is calculated from the cheapest credits in the largest pack: $15 / 1,800 credits = $0.008333 per credit. This is the conservative revenue denominator used by the margin audit.

## Official pricing and capability references to verify before launch

Provider prices change by model, region, batch tier, cached tokens, audio duration and account contract. Verify the active models and your account's prices against these official sources before changing rates:

- Gemini API pricing: https://ai.google.dev/gemini-api/docs/pricing
- Gemini video understanding: https://ai.google.dev/gemini-api/docs/video-understanding
- OpenAI API pricing: https://platform.openai.com/docs/pricing
- OpenAI text-to-speech: https://platform.openai.com/docs/guides/text-to-speech
- OpenAI speech-to-text: https://platform.openai.com/docs/guides/speech-to-text
- Deepgram pricing: https://deepgram.com/pricing
- Deepgram text-to-speech: https://developers.deepgram.com/docs/text-to-speech

This run had no live web/pricing-dashboard access, so the links are official verification references rather than proof that today's exact rates were fetched. Use current provider invoices/usage endpoints to reconcile real costs; do not label this estimate an exact live bill.

## Validation

Run:

```bash
npm run audit:pricing
npm run audit:provider-costs
npm run audit:v58
```

The first two audits test representative jobs against a 65% minimum gross margin using conservative model allowances. They are deterministic local audits and do not call provider APIs.
