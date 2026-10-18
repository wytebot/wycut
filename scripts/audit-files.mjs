import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const required = [
  'app/page.tsx', 'app/dashboard/page.tsx', 'app/billing/page.tsx', 'app/api/script/route.ts',
  'app/api/narration/route.ts', 'app/privacy/page.tsx', 'app/terms/page.tsx', 'app/refunds/page.tsx', 'app/acceptable-use/page.tsx', 'components/legal-layout.tsx', 'config/ai-operations.json', 'lib/ai/operations-config.ts', 'staff-ai-ops-template/README.md', 'staff-ai-ops-template/ai-operations.json', 'app/api/auth/google/verify/route.ts', 'app/api/billing/charge/route.ts',
  'app/api/billing/config/route.ts', 'app/api/billing/entitlement/route.ts', 'app/api/billing/validate-otp/route.ts', 'app/api/billing/status/route.ts', 'app/api/wybuild-payment-confirmation/route.ts', 'lib/billing/pricing.ts', 'lib/billing/settlement.ts', 'lib/billing/credits.ts', 'lib/billing/flutterwave-v4.ts', 'lib/billing/google-identity.ts', 'lib/firebase/client.ts',
  'lib/ai/script-generator.ts', 'lib/ai/tts-generator.ts',
  'lib/ffmpeg/client-slicer.ts', 'lib/drive/export.ts', 'lib/server/rate-limit.ts',
  'lib/api-client.ts', 'lib/auth/google-native.ts', 'lib/server/origin.ts', 'middleware.ts', 'next.config.mjs', 'capacitor.config.ts',
  'scripts/build-capacitor-web.mjs', 'scripts/build-android.mjs', '.github/workflows/android-debug-apk.yml',
];
let failed = false;
for (const item of required) {
  try {
    const info = await stat(path.join(root, item));
    if (!info.isFile() || info.size === 0) throw new Error('not a non-empty file');
    console.log(`OK ${item}`);
  } catch (error) {
    failed = true;
    console.error(`MISSING ${item}: ${error instanceof Error ? error.message : String(error)}`);
  }
}
const envText = await readFile(path.join(root, '.env.example'), 'utf8');
for (const key of ['GEMINI_API_KEY', 'OPENAI_API_KEY', 'AI_OPERATIONS_CONFIG_URL', 'AI_OPERATIONS_CONFIG_TOKEN', 'AI_SCRIPT_PROVIDER', 'DEEPGRAM_API_KEY', 'FLW_CLIENT_ID', 'FLW_CLIENT_SECRET', 'FLW_ENCRYPTION_KEY', 'FLW_V4_BASE_URL', 'FIREBASE_SERVICE_ACCOUNT_JSON_BASE64', 'NEXT_PUBLIC_API_BASE_URL', 'CAPACITOR_ALLOWED_ORIGINS', 'GOOGLE_SERVICES_JSON_BASE64', 'NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID', 'WYBUILD_WEBHOOK_SHARED_SECRET']) {
  if (!envText.includes(`${key}=`)) { failed = true; console.error(`MISSING env key ${key}`); }
}
const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
for (const dependency of ['@capacitor/android', '@capacitor/core', '@capacitor/filesystem', '@capacitor/share', '@capacitor/browser']) {
  if (!packageJson.dependencies?.[dependency]) { failed = true; console.error(`MISSING dependency ${dependency}`); }
}
if (!failed) console.log('Static file/config audit passed. This does not replace typecheck, build, or live integration tests.');
process.exit(failed ? 1 : 0);
