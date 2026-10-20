# WyCut v68.4 — browser sign-in recovery

- Updated the project version to 0.68.4.
- Browser login no longer treats a failed/stale Firebase redirect-result recovery as a fatal session initialization error. It logs the underlying error and continues to offer a fresh Google popup sign-in.
- Preserved the native Capacitor Google login branch and its bridge/plugin fallback.
- Dependency pins in this package remain: Capacitor core/android 5.7.8, browser/share 5.0.6, filesystem 5.1.4.

## Verification and limits

- `package.json` parses successfully.
- `app/login/page.tsx` has a targeted redirect-recovery change only.
- No live Firebase OAuth transaction or Vercel build was run here.
- The HTTP 307 warning shown by WyBuild is emitted by WyBuild's PWA discovery checker, not by this WyCut source tree. The checker should follow the redirect and validate the final response; fixing that requires the WyBuild project source, which is not included in this WyCut archive.
