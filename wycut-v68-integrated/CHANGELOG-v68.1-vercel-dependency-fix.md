# WyCut v68.1 — Vercel dependency install fix

- Changed `@capacitor/browser` from the unpublished/nonexistent `5.0.7` version to the published Capacitor 5 release `5.0.6`.
- Bumped the app package version to `0.68.1`.
- No runtime feature code was changed.

## Why the deployment failed
Vercel stops during `npm install` because npm cannot resolve `@capacitor/browser@5.0.7` (`ETARGET`). This package version correction addresses that specific failure.

## Deploy
Commit the updated `package.json` to the `main` branch, or replace the repository contents with this archive and redeploy. If you maintain a lockfile, regenerate and commit it with the updated manifest (`npm install`) so the manifest and lockfile agree.
