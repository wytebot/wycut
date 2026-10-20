# WyCut v68.5 — deployment and authentication recovery package

## Root cause established from supplied GitHub Actions log
The failed run checked out commit `1bf558f87bfa242cf258a92769b17437ed1fbadf` and attempted to install `@capacitor/filesystem@5.0.6`, which npm returned as ETARGET. That commit therefore does not contain the corrected dependency manifest in the later v68.4 package.

## Source corrections included
- `@capacitor/filesystem` is pinned to `5.1.4` (not the failing `5.0.6`).
- Existing Capacitor 5 core/android/CLI pins remain `5.7.8`; browser and share remain at their existing `5.0.6` pins. Native Google Auth dependency remains installed.
- Browser Firebase login uses standard `getAuth(firebaseApp)`, sets `browserLocalPersistence` before OAuth, catches redirect recovery errors so popup login remains usable, and reports the failing step/code.
- Native login implementation and WyBuild native bridge are retained.
- `build:capacitor-web` still intentionally requires `NEXT_PUBLIC_API_BASE_URL` and `NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID`; these are required for a safe static APK build. The workflow attempts to infer them, but a real Google Web OAuth client ID must be available from the repo's `google-services.json` or GitHub environment.

## Important deployment note
This archive does not push changes to GitHub/Vercel. The supplied Actions log proves the failing run used the older commit above. To use this correction, commit the updated source to `main` and ensure the next Actions log shows the new commit and no `@capacitor/filesystem@5.0.6` resolution.

## Verification limits
Manifest JSON parsing and archive integrity can be checked locally. This environment has no internet access, npm registry access, Vercel deployment access, Firebase project access, or Android device access; therefore it cannot truthfully certify a fresh npm install, live browser OAuth, or APK compilation. Those need to be confirmed by the next hosted run.
