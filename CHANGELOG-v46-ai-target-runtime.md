# WyCut v46 — AI target-duration cutting

- The AI action now opens a duration dialog before generating a recap plan. It accepts whole-minute targets from 1 to 60 minutes.
- The selected duration is sent to the server as `targetRuntimeSeconds`; beat count scales with the requested runtime (10–70 planned cuts).
- The AI prompt explicitly treats target duration as a planning target and asks the model to select source ranges whose combined duration approaches the target, while respecting the actual source timeline.
- Script generation reports both the requested target and the estimated combined duration of selected source ranges so users can review accuracy before cutting.
- The local FFmpeg slicer now accepts up to 150 ranges instead of rejecting plans above 60 cuts.
- Existing immediate IndexedDB history creation when a video enters the editor remains in place.

## Limits to verify

- Exact output runtime depends on subtitle timestamp quality, source duration, the AI model's selected ranges, and frame boundaries. The UI explicitly describes it as an approximate target, not a second-perfect guarantee.
- Source files remain subject to the existing 2 GB technical limit, supported MP4/M4V/MOV container restrictions, browser/Capacitor memory limits, transcript length limits, and provider output/time limits.
- Android device testing is required for long sources and large cut counts. The code has not been tested on a physical device in this environment.
