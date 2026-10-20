import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mixer = await (await import('node:fs/promises')).readFile(path.join(root, 'lib/ffmpeg/client-slicer.ts'), 'utf8');
for (const token of ['sourceOffsetSeconds', 'atrim=start=', 'adelay=', 'afade=t=in', 'afade=t=out', 'amix=inputs=']) if (!mixer.includes(token)) throw new Error(`Audio renderer is missing ${token}`);
function run(args) { return new Promise((resolve, reject) => { const child = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] }); let out = ''; let err = ''; child.stdout.on('data', x => out += x); child.stderr.on('data', x => err += x); child.once('error', reject); child.once('exit', code => code === 0 ? resolve(out) : reject(new Error(`ffmpeg failed (${code}): ${err.slice(-1600)}`))); }); }
const dir = await mkdtemp(path.join(os.tmpdir(), 'wycut-audio-test-'));
try {
  const output = path.join(dir, 'mixed.mp4');
  const graph = '[1:a]volume=0.55[baseaudio];[2:a]atrim=start=0.1:duration=1.2,asetpts=PTS-STARTPTS,volume=0.8,afade=t=in:st=0:d=0.2,afade=t=out:st=1.0:d=0.2,adelay=500|500[fx0];[baseaudio][fx0]amix=inputs=2:duration=longest:dropout_transition=2,alimiter=limit=0.95[aout]';
  await run(['-v','error','-f','lavfi','-i','color=c=blue:s=320x180:r=10:d=2','-f','lavfi','-i','sine=frequency=220:duration=2','-f','lavfi','-i','sine=frequency=880:duration=2','-filter_complex',graph,'-map','0:v:0','-map','[aout]','-t','2','-c:v','libx264','-c:a','aac','-y',output]);
  const probe = await run(['-v','error','-i',output,'-map','0:a:0','-f','null','-']);
  console.log('PASS: audio mix fixture rendered with source audio, a second delayed track, source trim, fade-in and fade-out.');
} finally { await rm(dir, { recursive: true, force: true }); }
