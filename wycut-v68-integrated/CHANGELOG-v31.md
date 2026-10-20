# WyCut v31 — Recap Timeline Studio

- Replaced the multi-entry dashboard UI with a local-video-first, CapCut-inspired recap workspace.
- Preserved Google login, billing/credits, Drive connection/export, local project/history storage, and existing native Capacitor integrations.
- Removed URL and subtitle workflow navigation from the main studio and app menu; generation uses the selected video and its locally extracted/transcribed audio.
- Set the recap target to 12 scenes and constrained the server-side recap workflow to 10–15 scenes.
- Added video preview canvas ratios (9:16, 16:9, 1:1, 4:5), optional local FFmpeg reframing/cropping for exported clips, playback speed preview controls, a horizontal scene/script timeline, free local auto-cut controls, individual clip saves, recap TXT/JSON downloads, and a combined device/Drive export action.
- Kept source video processing local; only transcription text is sent to configured AI services. No watermark is added.
- Important limitation: aspect-ratio selection changes the preview; to apply it to exported clips, enable Reframe exports, which locally re-encodes and takes longer. Fast-cut mode retains the existing keyframe-boundary tradeoff.
- Validation: syntax transpilation and repository file, generation-regression, and credit-policy audits passed. A full dependency install, TypeScript typecheck, production build, Android build, and live Google Drive/payment tests were not run in this environment.
