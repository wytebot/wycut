# WyCut v29 — Recap from video, no subtitles needed

## New
- If you load a video (file or direct MP4 link) and give no subtitles, WyCut extracts the audio on-device with FFmpeg (mono, 16 kHz, 24 kbps, 5-minute parts), transcribes each part with AI, builds a timestamped SRT and feeds the normal recap script generator. Real cut timestamps, so slicing works.
- Cheapest provider by default: Gemini 2.5 Flash-Lite (uses your existing GEMINI_API_KEY). OpenAI Whisper is used automatically only if Gemini fails and OPENAI_API_KEY is set. Override model with GEMINI_TRANSCRIBE_MODEL.
- Uploaded or linked subtitles are always used first (no transcription cost).
- Transcript is cached in the page, so retrying a failed recap never re-transcribes.
- New route /api/transcribe: requires sign-in, IP rate limit, and a per-account daily cap (TRANSCRIBE_DAILY_CHUNK_CAP, default 80 parts ≈ 6.7 h).

## Limits / honesty
- Still needs a video file on the device (MP4/M4V/MOV within the existing 80/100/300 MB limits). YouTube links are still not downloaded.
- AI timestamps are usually within a second or two, not frame-exact; review cut points.
- Not typechecked or run here (no dependencies/network). Run `npm run build`, test with a short video first, and check Gemini pricing/quota for your account.
- Transcription is not charged against recap credits; the daily cap is the cost guard. Tell me if you want it to consume a credit instead.
