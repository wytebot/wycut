# Android manual QA — v46 AI target runtime

1. Open a supported MP4/M4V/MOV file. Confirm a project appears in History before generating a script.
2. Tap the AI action and confirm the duration dialog opens.
3. Enter 3 minutes and generate. Confirm the request uses a 180-second target and the result notice shows the requested duration and estimated combined clip duration.
4. Tap Cut clips on this device. Confirm each clip is produced locally and the rough-cut output is offered when within the existing memory safety limit.
5. Repeat with 1 minute, 10 minutes, and a long source video; review whether selected ranges span the source and total duration is close to target.
6. Enter 0, 61, and blank values; confirm invalid values are rejected.
7. Download the script and timeline JSON on Android and in a desktop browser.
8. Force-close/reopen the APK after selecting the source. Confirm the project remains in History.
9. Test Fast Cut off/on, low-memory behavior, cancellation, and an unsupported codec.
