/**
 * Fast audio pull-out for MP4/M4V/MOV files.
 *
 * Instead of pushing the whole video (up to 2 GB) through ffmpeg.wasm just to reach its audio, this reads ONLY the
 * movie header (moov) and then ONLY the byte ranges that hold audio samples, using File.slice(). The AAC samples are
 * copied (no decoding / re-encoding) into a small ADTS .aac file, typically 2-3% of the video size. FFmpeg then
 * downmixes and chunks that small file, which takes seconds instead of minutes and uses little memory.
 *
 * Returns null whenever the fast path does not apply (non-AAC audio, HE-AAC, unusual layout, parse problem), and the
 * caller falls back to the original full-file FFmpeg route, so nothing gets worse.
 */

type Sample = { offset: number; size: number; dts?: number; duration?: number };
const HEADER_READ = 1024 * 1024;
const MAX_HEADER_SCAN_STEPS = 400;
const READ_CONCURRENCY = 6;
const MAX_RUN_BYTES = 8 * 1024 * 1024;
const ADTS_FREQ = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350];

export type DemuxResult = { file: File; sampleRate: number; channels: number };

async function readBytes(file: File, start: number, end: number): Promise<ArrayBuffer> {
  return file.slice(start, Math.min(end, file.size)).arrayBuffer();
}

/** Feeds mp4box only the parts of the file it asks for until the movie header is parsed. */
async function loadMovieInfo(file: File): Promise<{ mp4: any; track: any } | null> {
  // @ts-ignore mp4box ships without types in some versions
  const mod: any = await import('mp4box');
  const MP4Box = mod.default || mod;
  const mp4 = MP4Box.createFile();
  let ready: any = null; let failed = false;
  mp4.onError = () => { failed = true; };
  mp4.onReady = (info: any) => { ready = info; };
  let offset = 0;
  for (let step = 0; step < MAX_HEADER_SCAN_STEPS && !ready && !failed && offset < file.size; step++) {
    const buffer: any = await readBytes(file, offset, offset + HEADER_READ);
    buffer.fileStart = offset;
    const next = mp4.appendBuffer(buffer);
    offset = typeof next === 'number' && next > offset ? next : offset + buffer.byteLength;
  }
  mp4.flush?.();
  if (!ready || failed) return null;
  const info = ready.audioTracks?.[0];
  if (!info) return null;
  const track = mp4.getTrackById(info.id);
  if (!track?.samples?.length) return null;
  return { mp4, track };
}

/** Reads sampling rate / channels / profile from the AAC AudioSpecificConfig. */
function readAudioConfig(track: any): { profile: number; freqIndex: number; channels: number } | null {
  try {
    const esds = track.mdia.minf.stbl.stsd.entries[0].esds;
    const data: Uint8Array = esds.esd.descs[0].descs[0].data;
    const objectType = data[0] >> 3;
    if (objectType !== 2 && objectType !== 1 && objectType !== 3) return null; // AAC Main/LC/SSR only (HE-AAC needs the slow path)
    const freqIndex = ((data[0] & 7) << 1) | (data[1] >> 7);
    const channels = (data[1] >> 3) & 15;
    if (freqIndex > 12 || channels < 1 || channels > 7) return null;
    return { profile: objectType - 1, freqIndex, channels };
  } catch { return null; }
}

function adtsHeader(size: number, cfg: { profile: number; freqIndex: number; channels: number }): Uint8Array {
  const len = size + 7; const h = new Uint8Array(7);
  h[0] = 0xff; h[1] = 0xf1;
  h[2] = (cfg.profile << 6) | (cfg.freqIndex << 2) | ((cfg.channels >> 2) & 1);
  h[3] = ((cfg.channels & 3) << 6) | ((len >> 11) & 3);
  h[4] = (len >> 3) & 0xff;
  h[5] = ((len & 7) << 5) | 0x1f;
  h[6] = 0xfc;
  return h;
}

export async function extractAacTrack(file: File, onProgress?: (progress: number) => void): Promise<DemuxResult | null> {
  try {
    const extension = (file.name.split('.').pop() || '').toLowerCase();
    if (!['mp4', 'm4v', 'mov', 'm4a'].includes(extension)) return null;
    const movie = await loadMovieInfo(file);
    if (!movie) return null;
    const cfg = readAudioConfig(movie.track);
    if (!cfg) return null;
    const samples: Sample[] = movie.track.samples;
    // Group samples that sit next to each other in the file so we make a few large reads, not thousands of tiny ones.
    const runs: Array<{ start: number; end: number; items: Sample[] }> = [];
    for (const s of samples) {
      if (!s.size || s.offset < 0 || s.offset + s.size > file.size) return null;
      const last = runs[runs.length - 1];
      if (last && s.offset === last.end && last.end - last.start < MAX_RUN_BYTES) { last.end += s.size; last.items.push(s); }
      else runs.push({ start: s.offset, end: s.offset + s.size, items: [s] });
    }
    const parts: BlobPart[][] = new Array(runs.length);
    let next = 0; let done = 0;
    const worker = async () => {
      while (true) {
        const i = next++;
        if (i >= runs.length) return;
        const run = runs[i];
        const data = new Uint8Array(await readBytes(file, run.start, run.end));
        if (data.byteLength !== run.end - run.start) throw new Error('short read');
        const out: BlobPart[] = [];
        for (const s of run.items) {
          const rel = s.offset - run.start;
          out.push(adtsHeader(s.size, cfg) as BlobPart, data.slice(rel, rel + s.size) as BlobPart);
        }
        parts[i] = out;
        done++;
        if (done % 20 === 0 || done === runs.length) onProgress?.(done / runs.length);
      }
    };
    await Promise.all(Array.from({ length: READ_CONCURRENCY }, worker));
    const blob = new Blob(parts.flat(), { type: 'audio/aac' });
    if (blob.size < 2048) return null;
    return { file: new File([blob], `audio_only_${Date.now()}.aac`, { type: 'audio/aac' }), sampleRate: ADTS_FREQ[cfg.freqIndex], channels: cfg.channels };
  } catch {
    return null; // any problem => caller uses the full FFmpeg path
  }
}
