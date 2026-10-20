# WyCut v58 — Provider-aware credits and margin guard

- Kept the $1 = ₦1,400 starter pack and existing credit-pack prices.
- Split transcription rates by the actual configured provider: Gemini Flash-Lite uses the lower duration rate; OpenAI Whisper fallback uses a higher rate based on its published per-minute billing allowance.
- Added `/api/transcribe/estimate` so the client pre-check uses the provider configured on the server, while the transcription route independently computes and enforces the actual charge.
- Kept a 1.5x modeled cost allowance and changed the margin floor to the user's requested 65% minimum.
- Added a second deterministic margin audit covering Gemini and Whisper scenarios. Lowest modeled margin is 68.2% for the Whisper fallback at the largest-pack credit rate.
- Added a provider capability/pricing note with official verification links.
- Did not enable AI video background removal: Gemini/OpenAI standard APIs do not provide the required full-video alpha mattes, and Deepgram is not a video segmentation provider. The AI button remains unavailable and does not charge credits; local manual masks and chroma key remain available.
- Full Next.js typecheck/build and live provider tests were not run because dependencies and live provider access are unavailable in this environment.
