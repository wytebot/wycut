import { spawn } from 'node:child_process';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const androidDir = path.join(root, 'android');
const googleServicesPath = path.join(androidDir, 'app', 'google-services.json');

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, env: process.env, stdio: 'inherit', shell: process.platform === 'win32', ...options });
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolve() : reject(new Error(`${command} ${args.join(' ')} failed with exit code ${code}`)));
  });
}
async function exists(file) { try { await access(file); return true; } catch { return false; } }

if (!process.env.NEXT_PUBLIC_API_BASE_URL) throw new Error('Missing NEXT_PUBLIC_API_BASE_URL. The APK uses a bundled UI and calls your deployed API over HTTPS.');
if (!process.env.NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID) throw new Error('Missing NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID.');
if (!process.env.GOOGLE_SERVICES_JSON_BASE64 && !await exists(googleServicesPath)) {
  throw new Error('Missing Firebase Android config. Set GOOGLE_SERVICES_JSON_BASE64 to the base64 contents of the google-services.json from Firebase project wycut5, or place that file at android/app/google-services.json locally.');
}
const firebaseJsonText = process.env.GOOGLE_SERVICES_JSON_BASE64
  ? Buffer.from(process.env.GOOGLE_SERVICES_JSON_BASE64, 'base64').toString('utf8')
  : await readFile(googleServicesPath, 'utf8');
let firebaseConfig;
try { firebaseConfig = JSON.parse(firebaseJsonText); } catch { throw new Error('Firebase Android config is not valid JSON/base64.'); }
if (firebaseConfig.project_info?.project_id !== 'wycut5') throw new Error('google-services.json must belong to Firebase project wycut5.');
const configuredPackages = (firebaseConfig.client || []).map(client => client.client_info?.android_client_info?.package_name).filter(Boolean);
if (!configuredPackages.includes('app.wycutrecap.vercel')) throw new Error('google-services.json must include Android package app.wycutrecap.vercel.');

await run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build:capacitor-web']);
if (!await exists(androidDir)) {
  await run(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['cap', 'add', 'android']);
}
if (process.env.GOOGLE_SERVICES_JSON_BASE64) {
  await mkdir(path.dirname(googleServicesPath), { recursive: true });
  await writeFile(googleServicesPath, Buffer.from(process.env.GOOGLE_SERVICES_JSON_BASE64, 'base64'));
}
await run(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['cap', 'sync', 'android']);
const gradle = process.platform === 'win32' ? path.join(androidDir, 'gradlew.bat') : path.join(androidDir, 'gradlew');
await run(gradle, ['assembleDebug'], { cwd: androidDir });
console.log('APK build complete: android/app/build/outputs/apk/debug/app-debug.apk');
