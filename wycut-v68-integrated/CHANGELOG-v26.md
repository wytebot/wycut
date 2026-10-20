# WyCut v26 — Source mode navigation and generation diagnostics

## Changes
- Fixed Video URL, Video file, and Subtitles navigation: each route now renders `DashboardWorkspace` with the intended initial mode instead of redirecting every route to `/dashboard`.
- Kept direct video URL downloads limited to authorized, HTTPS direct-file URLs; YouTube/TikTok watch pages are not downloadable video-file URLs and are explained to the user.
- Kept transcript requirement explicit: video URLs alone do not supply transcript text.
- Fixed source-download timeout lifetime so the timeout covers reading the response body, not just receiving response headers.
- Fixed subtitle URL timeout lifetime to cover reading the subtitle body.
- Improved generation status: the primary CTA changes to a spinner and processing message whenever work is active; progress/status is announced via ARIA live regions.
- Improved API error diagnosis for network failures, non-JSON server responses, HTTP errors, backend error codes, and empty AI responses.

## Verification
- Static source inspection completed.
- ZIP integrity checked after packaging.
- `npm run typecheck`, `npm run lint`, and `npm run build` require dependency installation and must be run in CI/Vercel; no passing result is claimed here.
- Browser navigation, cross-origin URL hosting/CORS, real video downloads, AI provider calls, and device file-picker behavior were not exercised in this environment.
