import { spawn } from 'node:child_process';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const androidDir = path.join(root, 'android');
const googleServicesPath = path.join(androidDir, 'app', 'google-services.json');
const bundledGoogleServicesPath = path.join(root, 'config', 'android', 'google-services.json'); // Firebase client config (not a secret)
const appId = /appId:\s*'([^']+)'/.exec(await readFile(path.join(root, 'capacitor.config.ts'), 'utf8'))?.[1];
if (!appId) throw new Error('Could not read appId from capacitor.config.ts.');

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
if (!process.env.GOOGLE_SERVICES_JSON_BASE64 && !await exists(googleServicesPath) && !await exists(bundledGoogleServicesPath)) {
  throw new Error('Missing Firebase Android config. Put google-services.json (Firebase project wycut5) at config/android/google-services.json, or set GOOGLE_SERVICES_JSON_BASE64.');
}
const firebaseJsonText = process.env.GOOGLE_SERVICES_JSON_BASE64
  ? Buffer.from(process.env.GOOGLE_SERVICES_JSON_BASE64, 'base64').toString('utf8')
  : await readFile(await exists(googleServicesPath) ? googleServicesPath : bundledGoogleServicesPath, 'utf8');
let firebaseConfig;
try { firebaseConfig = JSON.parse(firebaseJsonText); } catch { throw new Error('Firebase Android config is not valid JSON/base64.'); }
if (firebaseConfig.project_info?.project_id !== 'wycut5') throw new Error('google-services.json must belong to Firebase project wycut5.');
const configuredPackages = (firebaseConfig.client || []).map(client => client.client_info?.android_client_info?.package_name).filter(Boolean);
if (!configuredPackages.includes(appId)) throw new Error(`google-services.json must include Android package ${appId}.`);
const hasAndroidOAuth = (firebaseConfig.client || []).some(client => client.client_info?.android_client_info?.package_name === appId && (client.oauth_client || []).some(oauth => oauth.client_type === 1));
if (!hasAndroidOAuth) throw new Error(`Native Google sign-in will fail: ${appId} has no Android OAuth client (no SHA-1 fingerprint registered). In Firebase > Project settings > ${appId} > Add fingerprint, add your APK signing SHA-1, then download a fresh google-services.json.`);

await run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build:capacitor-web']);
if (!await exists(androidDir)) {
  await run(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['cap', 'add', 'android']);
}
await mkdir(path.dirname(googleServicesPath), { recursive: true });
await writeFile(googleServicesPath, firebaseJsonText);
await run(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['cap', 'sync', 'android']);
// Stamp a version into the generated Android project so every APK can be told apart (and updates install over each other).
{
  const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  const versionCode = Math.max(1, Number.parseInt(process.env.ANDROID_VERSION_CODE || process.env.GITHUB_RUN_NUMBER || '30', 10) || 30);
  const gradlePath = path.join(androidDir, 'app', 'build.gradle');
  let gradle = await readFile(gradlePath, 'utf8');
  gradle = gradle.replace(/versionCode\s+\d+/, `versionCode ${versionCode}`).replace(/versionName\s+"[^"]*"/, `versionName "${pkg.version}"`);
  await writeFile(gradlePath, gradle);
  console.log(`Android version: ${pkg.version} (code ${versionCode})`);
}

// Sign with a STABLE keystore. Google sign-in only works when the APK's signing SHA-1 is registered in Firebase, and the default
// debug keystore is regenerated on every CI run (a new SHA-1 each time). Provide ANDROID_KEYSTORE_BASE64 (+ password/alias secrets).
const keystoreBase64 = process.env.ANDROID_KEYSTORE_BASE64?.trim();
let keystorePath = path.join(process.env.HOME || '', '.android', 'debug.keystore');
let keystoreCreds = ['-storepass', 'android'];
if (keystoreBase64) {
  for (const key of ['ANDROID_KEYSTORE_PASSWORD', 'ANDROID_KEY_ALIAS', 'ANDROID_KEY_PASSWORD']) if (!process.env[key]) throw new Error(`Missing ${key} (required together with ANDROID_KEYSTORE_BASE64).`);
  keystorePath = path.join(androidDir, 'app', 'wycut.keystore');
  await writeFile(keystorePath, Buffer.from(keystoreBase64, 'base64'));
  const gradlePath = path.join(androidDir, 'app', 'build.gradle');
  let gradle = await readFile(gradlePath, 'utf8');
  if (!gradle.includes('wycut.keystore')) {
    gradle = gradle.replace(/android\s*\{\n/, `android {\n    signingConfigs {\n        debug {\n            storeFile file("wycut.keystore")\n            storePassword System.getenv("ANDROID_KEYSTORE_PASSWORD")\n            keyAlias System.getenv("ANDROID_KEY_ALIAS")\n            keyPassword System.getenv("ANDROID_KEY_PASSWORD")\n        }\n        release {\n            storeFile file("wycut.keystore")\n            storePassword System.getenv("ANDROID_KEYSTORE_PASSWORD")\n            keyAlias System.getenv("ANDROID_KEY_ALIAS")\n            keyPassword System.getenv("ANDROID_KEY_PASSWORD")\n        }\n    }\n`);
    await writeFile(gradlePath, gradle);
  }
  keystoreCreds = ['-storepass', process.env.ANDROID_KEYSTORE_PASSWORD];
} else if (process.env.CI) {
  console.warn('WARNING: no ANDROID_KEYSTORE_BASE64 secret. This APK is signed with a throwaway debug key, so Google sign-in will NOT work until you add the keystore secrets (see ANDROID-APK-CHECKLIST.md).');
}
const gradle = process.platform === 'win32' ? path.join(androidDir, 'gradlew.bat') : path.join(androidDir, 'gradlew');
await run(gradle, ['assembleDebug'], { cwd: androidDir });

// Show the SHA-1 that Google sees, so it can be compared with the fingerprint registered in Firebase.
await new Promise(resolve => {
  const child = spawn('keytool', ['-list', '-v', '-keystore', keystorePath, ...keystoreCreds], { cwd: root, shell: process.platform === 'win32' });
  let out = ''; child.stdout.on('data', d => { out += d; }); child.once('error', () => resolve()); child.once('exit', async () => {
    const sha1 = /SHA1:\s*([0-9A-F:]{59})/i.exec(out)?.[1];
    if (sha1) {
      console.log(`APK signing SHA-1: ${sha1}  (package ${appId})`);
      console.log('Register this fingerprint in Firebase > Project settings > Your apps > ' + appId + ' if Google sign-in shows DEVELOPER_ERROR / error 10.');
      if (process.env.GITHUB_STEP_SUMMARY) await writeFile(process.env.GITHUB_STEP_SUMMARY, `### APK signing SHA-1\n\n\`${sha1}\`\n\nPackage: \`${appId}\`\n`, { flag: 'a' });
    }
    resolve();
  });
});
console.log('APK build complete: android/app/build/outputs/apk/debug/app-debug.apk');
