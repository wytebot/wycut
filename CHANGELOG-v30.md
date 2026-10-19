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

## v30.3 — big videos on phones
- Videos picked from the device are now read in place (FFmpeg WORKERFS) instead of being copied into memory twice, so the 80/100/300 MB limits are gone; the cap is 2 GB. Downloads from a URL still have to be held in RAM and keep the smaller limit.
- The last (shorter) audio part is no longer billed as a full 5-minute part.
- Rough-cut joining is skipped (clips are still saved) when the clips total more than 150 MB on phones / 500 MB on desktop.

## v30.4 — fast audio extraction
- Audio is now copied straight out of the MP4/MOV (reads only the movie header and the audio byte ranges, no re-encode) into a small .aac file, and FFmpeg only processes that. Typically seconds instead of minutes, far less memory, and the 2 GB cap stays. If the audio is not plain AAC or anything fails to parse, it silently uses the old full-file FFmpeg path.
- FFmpeg core is served from /ffmpeg (copied by postinstall from @ffmpeg/core, bundled into the APK) with the unpkg CDN as fallback.
- New dependencies: mp4box, @ffmpeg/core (run npm install). Not run/tested in the build environment: run typecheck and try a real phone video.

## v30.5 — menu + history
- Collapsible floating menu (bottom-right): tap to expand, tap anywhere else on the screen to collapse. Items: Subtitles recap, Video file, Video URL, History, Credits & billing, Account. Shows a pulsing dot while a generation is running.
- The studio now stays mounted while you move between pages (components/app-shell.tsx), so opening History/Billing no longer interrupts a running generation.
- New /history page: Ongoing and Completed tabs. Ongoing projects are saved locally (IndexedDB) at every stage: transcript, script, narration parts, progress. After an app restart tap Resume to return to the project; paid transcription parts and narration are reused, never charged twice. Re-pick the source video to slice clips again.
- Completed projects (exported to Drive) keep only a Drive folder reference locally. Clips, rough cut, voice files, captions and script are read live from the user's Drive (watch/listen/save/read) and are not stored on the device.
- The screen stays awake while a job runs. Android may still freeze or kill a backgrounded WebView; the checkpoints make that recoverable. Truly continuous background work would need a native foreground-service plugin.
- Not run here: run npm install, typecheck, lint and test on a phone.
