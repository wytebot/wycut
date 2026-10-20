import { spawn } from 'node:child_process';
import { mkdtemp, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
if (!apiBase) throw new Error('Set NEXT_PUBLIC_API_BASE_URL to your deployed HTTPS WyCut API domain before building the Capacitor app.');
let parsed;
try { parsed = new URL(apiBase); } catch { throw new Error('NEXT_PUBLIC_API_BASE_URL must be a valid absolute URL.'); }
if (parsed.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(parsed.hostname)) {
  throw new Error('NEXT_PUBLIC_API_BASE_URL must use HTTPS for a production APK.');
}
if (parsed.pathname !== '/' || parsed.search || parsed.hash) throw new Error('NEXT_PUBLIC_API_BASE_URL must be the backend origin only; do not append /api or a path.');
if (parsed.hostname.endsWith('.example') || /your-deployed|your-wycut-domain/i.test(parsed.hostname)) throw new Error('Replace the example NEXT_PUBLIC_API_BASE_URL with your real deployed HTTPS backend domain.');
const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim();
if (!googleClientId || !googleClientId.endsWith('.apps.googleusercontent.com')) {
  throw new Error('Set NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID to the full Google Web OAuth client ID ending in .apps.googleusercontent.com.');
}

const root = process.cwd();
const apiPath = path.join(root, 'app', 'api');
const middlewarePath = path.join(root, 'middleware.ts');
const backupRoot = await mkdtemp(path.join(root, '..', '.wycut-capacitor-build-'));
const apiBackup = path.join(backupRoot, 'api');
const middlewareBackup = path.join(backupRoot, 'middleware.ts');
let apiMoved = false;
let middlewareMoved = false;

function run(command, args, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, env, stdio: 'inherit', shell: process.platform === 'win32' });
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolve() : reject(new Error(`${command} ${args.join(' ')} failed with exit code ${code}`)));
  });
}

try {
  await rename(apiPath, apiBackup); apiMoved = true;
  await rename(middlewarePath, middlewareBackup); middlewareMoved = true;
  await run(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['next', 'build'], { ...process.env, CAPACITOR_STATIC_EXPORT: '1' });
} finally {
  let restoreFailure = null;
  if (middlewareMoved) { try { await rename(middlewareBackup, middlewarePath); } catch (error) { restoreFailure = error; } }
  if (apiMoved) { try { await rename(apiBackup, apiPath); } catch (error) { restoreFailure ||= error; } }
  if (restoreFailure) {
    console.error(`Could not restore server files automatically. Backup retained at ${backupRoot}.`);
    throw restoreFailure;
  }
  await rm(backupRoot, { recursive: true, force: true });
}
console.log('Capacitor static web export is ready in ./out. Server API routes were restored.');
