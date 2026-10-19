# WyCut v38 manual QA checklist (real Android device)

## Install/build
- [ ] Run `npm ci` with the repository lockfile in CI; confirm it completes without dependency changes.
- [ ] Run `npm run typecheck`, `npm run lint`, `npm run build`, `npm run build:capacitor-web`, and `npm run android:debug`.
- [ ] Install the generated APK on a low-RAM Android device and a newer device.

## Auth, app lifecycle, storage
- [ ] Sign in with Google, force-stop the app, relaunch, and verify login state and project history.
- [ ] Connect Drive; upload a project with source video, timeline assets, and sound tracks; force-stop; reopen from History and verify source/settings restore.
- [ ] Deny/revoke Drive permission; confirm export reports a reconnect action and does not show a false success.
- [ ] Background during generation/export, resume, and verify progress does not duplicate or remain permanently stuck.

## Editing/export parity
- [ ] Export a short MP4 with each of the four aspect ratios and confirm dimensions/playback.
- [ ] Try Original, Monochrome, Cinematic, Vivid, and one premium-listed filter; compare preview with exported MP4.
- [ ] Test mirror, speed 0.5x/1x/2x, volume 0, fade in/out, text, emoji, sticker, and watermark.
- [ ] Cancel during rendering; verify the UI returns to an actionable state and no temp files remain in the FFmpeg FS.
- [ ] Test an MP4 below the mobile size guard and a larger MP4 above it; confirm the larger file fails safely with a clear explanation rather than crashing.
- [ ] Confirm no credit is deducted for previewing assets; premium charging is not enabled in this build.

## Existing core flows
- [ ] Test file, URL, and subtitles entry separately.
- [ ] Generate a script, cancel a generation, and verify any eligible credits are refunded once.
- [ ] Cut/concatenate clips, add sound, export to device, export to Drive, and reopen from History.
- [ ] Run two rapid taps on Generate/Export and verify only one operation starts.
- [ ] Test offline launch and then reconnect; ensure API/billing responses are never served from service-worker cache.

## Payments
- [ ] Use Flutterwave test credentials only; verify successful, declined, pending, timeout, and repeated webhook cases.
- [ ] Verify the WyBuild shared-secret path cannot grant credits with a forged payload or mismatched amount/reference.
