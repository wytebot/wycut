# WyCut v55 — Duration-aware AI credits and long-video prompt optimization

## Changes
- Script-generation credits now scale with transcript/source duration when SRT/VTT timecodes are available, target recap runtime, and requested beat count. The baseline credit charge remains, and long jobs no longer cost the same as short script-only jobs.
- The script API derives source duration from the transcript on the server rather than trusting a client-provided duration, then reserves the calculated credits before invoking the AI provider.
- Billing examples and the pricing margin audit use the same duration/complexity model.
- Long subtitle transcripts over 52,000 characters are sampled uniformly across the full timeline for the model prompt to reduce latency and prompt size. Original full transcript still supplies the complete set of source timecodes for timestamp validation/alignment.
- Existing transcription charging remains duration-based per 150-second credit unit; narration remains character-based. Provider-start billing/refund semantics remain in place: if an AI provider request starts, cancellation/failure does not refund that operation's credits.

## Validation performed
- `node scripts/audit-pricing.mjs` — passed; example jobs exceed configured minimum margin at the cheapest per-credit pack using the configured provider cost estimates.
- `node scripts/audit-v51-export-tools.mjs` — passed.
- `node scripts/audit-storage-cost-guards.mjs` — passed.
- `node scripts/audit-files.mjs` — passed.
- `node scripts/audit-v53-image-export.mjs` — passed.

## Not claimed as implemented in this version
- Masking UI/export, composited video-overlay tracks, and manual/chroma-key/AI background removal are not implemented by these changes. AI background removal must be connected to a real provider and its provider-specific usage/cost must be configured before billing it. This ZIP does not pretend those tools are operational.
- Provider costs in the pricing audit are configured estimates, not live invoices from Gemini/OpenAI. Actual costs can vary by selected model, tokens, and provider pricing changes.
- A full Next.js typecheck/production build and live Firebase/provider tests were not run in this environment because project dependencies are not installed here.
