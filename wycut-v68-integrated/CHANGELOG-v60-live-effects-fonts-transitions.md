# WyCut v60 — Live Effects, Mood Categories, Transitions and Fonts

- Added mood/use-case categories for filters: All, Trending, Cinematic, Mood, Warm, Cool, Retro, Nature, Party, Portrait and B&W.
- Added categories for visual effects: All, Trending, Dreamy, Cinematic, Glitch, Party, Horror, Retro, Color and Motion.
- Added moving preview animations for Shake, Glitch/RGB Glitch, Flash, Flicker, Shimmer, Lens Flare, Light Leak, Motion Blur, Zoom Blur, Punch Zoom, Heatwave, Ghost, Night Vision and VHS.
- Added a dedicated Transition button in the timeline control row. It opens the Effects panel directly on Transitions.
- Expanded transitions from 10 to 18 and added FFmpeg boundary treatment for Blur, Zoom Blur, Spin, Shake, RGB split, Color flash, White flash and Fade to black.
- Added transition categories: All, Basic, Cinematic, Motion, Energetic and Retro.
- Expanded font selection to 40 choices, including modern sans, display, serif, mono, handwritten and Arabic-friendly choices. Common Google fonts load when the device is online; installed/system fallbacks remain available offline.
- Added animation mappings for all named text-animation presets so every option has a preview/apply mapping; some variants share a base animation class.

Validation: TypeScript syntax transpilation and static catalog/UI checks passed. Full Next.js build and live Android/browser playback/export tests were not run because node_modules are not installed in this environment.
