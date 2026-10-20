# WyCut v50 — Cost, storage, and creator reliability hardening

## AI cost safeguards
- AI recap generation now calculates a response-token budget from requested runtime, capped at 12,000 tokens and with a floor suitable for short recaps.
- A script-generation operation invokes at most one model provider per attempt. It does not automatically retry an invalid model response or fall through to another provider after a provider request has started, preventing accidental duplicate billable requests.
- The script reservation is marked `started` in Firestore immediately before the first model request. Stale-reservation cleanup only refunds `reserved` jobs; started jobs are not automatically refunded.
- If a provider request starts and then times out, fails validation, or the user cancels the client operation, the reserved credits remain consumed. If provider configuration fails before any provider request is issued, the reservation can still be refunded.
- OpenAI SDK automatic retries remain disabled (`maxRetries: 0`). Narration and transcription now mark ledger rows `started` before the first provider request; cancellation only refunds reservations that never crossed that boundary. Transcription no longer falls through to a second, potentially billable provider after the first provider attempt fails.

## Local storage and Firestore
- Project drafts and local editor settings remain in IndexedDB.
- Transcription chunks are treated as disposable cache and pruned to at most 500 entries from the most recent 14 days.
- IndexedDB project-save failures now emit a `wycut:project-storage-error` event rather than disappearing silently. Generation is not crashed by a local-history failure.
- Asset catalogs remain bundled static configuration/code; previewing an effect or filter does not upload its image/video or preview frames to Firestore.
- Firestore continues to hold operational records needed for billing, credit ledger/audit, premium unlock entitlements, and script usage needed for server-side narration validation. This release does not add a Firestore collection for project media, preview frames, or local timeline data.

## Creator preview UX
- Existing grid previews for filters, effects, animations, and transitions remain brief and are triggered by hover, keyboard focus, or tap/click.
- Reduced-motion preferences remain respected by the preview CSS.

## Verification boundary
- Static file/config and PWA audits were run after the edits.
- Production build, provider billing behavior, Firestore rules/indexes, Drive sync, and installed Capacitor APK behavior require a dependency-installed environment and live credentials; they are not claimed as verified here.
