# v30.8 - cut + script only, faster

- Removed the voiceover (TTS) step from the studio. The app now: transcribe -> script written for each clip -> cut clips -> export to Drive.
  `/api/narration`, `lib/ai/tts-generator.ts` and the Deepgram/OpenAI TTS config are left in place but no longer called.
- Script prompt now writes each beat for its own clip (about 2.3 words/second of clip length, link from the previous clip, clip lengths add up to the target runtime).
- Each clip row shows words, read time and whether the script fits the clip. Export adds `NNN_name.txt` next to every `NNN_name.mp4`, plus `Timeline_Script.txt`.
- New "Fast cut" toggle (on by default): stream copy instead of re-encoding. Falls back to the old frame-accurate re-encode if copy fails. A fast clip may start a second or two before its start time.
- Transcription now sends 4 audio parts at once instead of 2.
- Not run here: npm install, typecheck, build, a phone test.
