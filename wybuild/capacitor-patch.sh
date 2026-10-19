#!/usr/bin/env bash
# Run by the WyBuild Capacitor workflow after `cap sync`, from the repository root.
# Installs WyCut's Android foreground service (v30.6 background work + progress notification).
set -euo pipefail
: "${WB_ANDROID_DIR:?}"; : "${WB_APP_ID:?}"
node --input-type=module -e "
import { installBackgroundService } from './scripts/native/install-background-service.mjs';
await installBackgroundService({ root: process.cwd(), androidDir: process.env.WB_ANDROID_DIR, appId: process.env.WB_APP_ID });
"
