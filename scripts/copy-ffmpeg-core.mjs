// Copies the FFmpeg WebAssembly core into public/ffmpeg so the app serves it itself (cached, offline-capable, bundled in the APK).
import { copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
const from = path.join(process.cwd(), 'node_modules', '@ffmpeg', 'core', 'dist', 'umd');
const to = path.join(process.cwd(), 'public', 'ffmpeg');
try {
  await mkdir(to, { recursive: true });
  for (const f of ['ffmpeg-core.js', 'ffmpeg-core.wasm']) await copyFile(path.join(from, f), path.join(to, f));
  console.log('FFmpeg core copied to public/ffmpeg');
} catch (error) {
  console.warn('Could not copy FFmpeg core (the app will fall back to the CDN):', error instanceof Error ? error.message : error);
}
