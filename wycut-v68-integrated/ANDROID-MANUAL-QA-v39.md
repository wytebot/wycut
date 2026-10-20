# WyCut v39 manual QA checklist

- [ ] On mobile Android, open an existing project and confirm the dark-purple editing UI fits without horizontal page overflow.
- [ ] Load an authorized local video and confirm preview/aspect ratio controls work.
- [ ] Tap Generate 10–15 recap clips; confirm progress/status appears and errors identify source/auth/credit issues.
- [ ] Confirm generated recap blocks show timestamps and narration.
- [ ] Tap Start auto-cut (free) and confirm local FFmpeg progress, then verify clip files play and timestamps match the source.
- [ ] Test with no timestamped transcript and confirm the app explains why accurate cutting cannot proceed.
- [ ] Confirm busy state disables conflicting actions and re-cut action is labelled Re-cut clips locally after a cut exists.
- [ ] Verify Drive connection and export on a real account/device; static audits do not verify OAuth or upload behavior.
- [ ] Verify export output visually/audio-wise, including selected aspect ratio and any effects/overlays expected to be baked into MP4.

This is a manual checklist, not evidence that these device tests have already passed.
