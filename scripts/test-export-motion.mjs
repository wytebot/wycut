import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const renderer = await readFile(path.join(root, 'lib/ffmpeg/edit-export.ts'), 'utf8');
if (!renderer.includes("enable='between(t\\\\,")) throw new Error('Export renderer no longer contains time-gated timeline overlays.');
if (!renderer.includes('overlayAnimation') || !renderer.includes('plan.text?.animation')) throw new Error('Animated text rendering path is missing.');
if (!renderer.includes('validTimelineOverlays')) throw new Error('Independent timeline visual clips are not wired to export.');
function run(args) { return new Promise((resolve, reject) => { const child = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] }); let out = ''; let err = ''; child.stdout.on('data', x => out += x); child.stderr.on('data', x => err += x); child.once('error', e => reject(e)); child.once('exit', code => code === 0 ? resolve(out) : reject(new Error(`ffmpeg failed (${code}): ${err.slice(-1500)}`))); }); }
const dir = await mkdtemp(path.join(os.tmpdir(), 'wycut-motion-test-'));
try {
  const output = path.join(dir, 'motion.mp4');
  await run(['-v','error','-f','lavfi','-i','color=c=blue:s=320x180:r=10:d=2','-f','lavfi','-i','color=c=red@0.8:s=64x64:r=10:d=2,format=rgba','-f','lavfi','-i','color=c=lime@0.8:s=40x40:r=10:d=2,format=rgba','-filter_complex',"[1:v]scale=212:119:force_original_aspect_ratio=decrease,format=rgba,pad=320:180:(ow-iw)/2:(oh-ih)/2:color=black@0,format=rgba[ov1];[2:v]scale=212:119:force_original_aspect_ratio=decrease,format=rgba,pad=320:180:(ow-iw)/2:(oh-ih)/2:color=black@0,format=rgba[ov2];[0:v][ov1]overlay=x='20+80*t':y=0:enable='between(t\\,0.5\\,1.5)'[v1];[v1][ov2]overlay=x=0:y=0:enable='between(t\\,1.0\\,1.8)'[vout]",'-map','[vout]','-an','-c:v','libx264','-pix_fmt','yuv420p','-y',output]);
  const md5 = await run(['-v','error','-i',output,'-f','framemd5','-']);
  const frames = md5.split(/\r?\n/).filter(line => /^0,\s*\d+,/.test(line)).map(line => line.split(',').at(-1).trim());
  if (frames.length < 18) throw new Error(`Expected 20 sample frames, got ${frames.length}.`);
  if (frames[0] === frames[8]) throw new Error('Motion test failed: frame hashes did not change while the animated overlay was visible.');
  if (frames[0] !== frames[8] && new Set(frames.slice(5, 16)).size < 3) throw new Error('Motion test failed: expected several distinct rendered frames during the animation.');
  console.log(`PASS: rendered ${frames.length} frames with two independently timed overlay clips; ${new Set(frames.slice(5,16)).size} distinct hashes during motion.`);
  console.log('PASS: application export source contains the time-gated overlay and animated-text paths.');
} finally { await rm(dir, { recursive: true, force: true }); }
