# WyCut v42 Android manual QA checklist

Test on a real Capacitor APK and Chrome/PWA. Record device, Android version, and build SHA.

- [ ] 360×640 viewport: no horizontal page overflow; all targets at least 44×44 px; toolbar horizontally scrolls without moving the page.
- [ ] 412×915 viewport: preview remains centered, ratio is correct, timeline and bottom toolbar remain visible.
- [ ] System status bar and gesture/navigation bar do not cover top bar or bottom tools.
- [ ] Open keyboard in text editing: focused input remains visible and preview/timeline can still be reached.
- [ ] Rotate portrait → landscape → portrait; check preview ratio and controls restore sensibly.
- [ ] Android Back: dismiss tool sheet/search first; then show the editor-close confirmation; do not accidentally clear the source.
- [ ] Test browser/WebView back-swipe and pull-to-refresh while horizontally scrolling tools/timeline.
- [ ] Test video play/pause, seek, ratio, speed, fullscreen and source replacement.
- [ ] Generate recap with matching timestamped SRT/VTT; verify credits/entitlement behavior and clear errors when timestamps are missing.
- [ ] Auto-cut and re-cut; verify clip count, playback, export, and memory behavior on a 80 MB or smaller source.
- [ ] Add sound and text; export MP4; inspect actual exported media for parity with preview.
- [ ] Connect Drive, export project, close app, reopen from History and verify source/settings restoration.
- [ ] Background the app during a long operation; confirm progress/cancel and draft recovery.
- [ ] Low-memory device: repeated preview, timeline scroll, tool sheet open/close, export, and recovery after process eviction.
- [ ] Verify no uncaught Capacitor plugin call in browser/PWA.
