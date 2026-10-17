import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import { Capacitor } from '@capacitor/core';

export type ClipRange = { index: number; id: string; startSeconds: number; endSeconds: number };
export type SlicedClip = { filename: string; blob: Blob; size: number };
let ffmpegInstance: FFmpeg | null = null;
let loadPromise: Promise<FFmpeg> | null = null;
let operationQueue: Promise<unknown> = Promise.resolve();

// FFmpeg uses one in-memory filesystem; serialize jobs so overlapping UI actions
// cannot overwrite shared filenames or terminate another operation.
async function serialized<T>(job: () => Promise<T>): Promise<T> {
  const run = operationQueue.then(job, job);
  operationQueue = run.then(() => undefined, () => undefined);
  return run;
}

async function getFFmpeg(): Promise<FFmpeg> {
  if (typeof window === 'undefined') throw new Error('FFmpeg slicing is only available in a browser.');
  if (!ffmpegInstance) ffmpegInstance = new FFmpeg();
  const ffmpeg = ffmpegInstance;
  if (!ffmpeg.loaded) {
    if (!loadPromise) {
      loadPromise = (async () => {
        const base = 'https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd';
        // Keep the core and JS wrapper on the same pinned 0.12.10 version to avoid ABI mismatches.
        const [coreURL, wasmURL] = await Promise.all([
          toBlobURL(`${base}/ffmpeg-core.js`, 'text/javascript'),
          toBlobURL(`${base}/ffmpeg-core.wasm`, 'application/wasm'),
        ]);
        await ffmpeg.load({ coreURL, wasmURL });
        return ffmpeg;
      })().finally(() => { loadPromise = null; });
    }
    await loadPromise;
  }
  return ffmpeg;
}
function safeName(value: string): string { return value.toLowerCase().replace(/[^a-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 45) || 'scene'; }

/** Stream-copy trimming is fast and avoids re-encoding. Keyframe boundaries may make cuts imprecise; this is not frame-accurate editing. */
export async function sliceVideoLocally(file: File, ranges: ClipRange[], onProgress?: (progress: number, current: number, total: number) => void): Promise<SlicedClip[]> {
  return serialized(async () => {
  if (!file || file.size === 0) throw new Error('Choose a non-empty local video file.');
  const extension = (file.name.split('.').pop() || '').toLowerCase();
  if (!['mp4', 'm4v', 'mov'].includes(extension)) throw new Error('Lossless MP4 stream-copy slicing currently supports MP4, M4V, and MOV sources. Convert other containers locally first or choose a supported file.');
  const maxBytes = Capacitor.isNativePlatform() ? 100 * 1024 * 1024 : 700 * 1024 * 1024;
  if (file.size > maxBytes) throw new Error(`This file exceeds the ${Capacitor.isNativePlatform() ? '100 MB Android' : '700 MB browser'} processing safety limit. FFmpeg uses several times the source size in memory; split the source first.`);
  if (!ranges.length || ranges.length > 60) throw new Error('Provide between 1 and 60 clip ranges.');
  const sorted = ranges.map((r, i) => ({ ...r, index: Number.isFinite(r.index) ? Math.max(1, Math.floor(r.index)) : i + 1 })).sort((a, b) => a.index - b.index);
  for (const r of sorted) if (!Number.isFinite(r.startSeconds) || !Number.isFinite(r.endSeconds) || r.startSeconds < 0 || r.endSeconds <= r.startSeconds) throw new Error(`Invalid range for ${r.id}.`);
  const ffmpeg = await getFFmpeg();
  const sourceName = `source_${Date.now()}.${extension}`;
  const progressHandler = ({ progress }: { progress: number }) => onProgress?.(Math.min(1, Math.max(0, progress)), 0, sorted.length);
  ffmpeg.on('progress', progressHandler);
  const results: SlicedClip[] = [];
  try {
    await ffmpeg.writeFile(sourceName, await fetchFile(file));
    for (let i = 0; i < sorted.length; i++) {
      const range = sorted[i]; const id = safeName(range.id); const filename = `${String(range.index).padStart(3, '0')}_${id}.mp4`;
      if (range.endSeconds - range.startSeconds > 3600) throw new Error(`Clip ${filename} is over one hour long; split the range before processing.`);
      // Recreate output name inside FFmpeg FS. -ss before input is fast; stream copy may snap to keyframes.
      const output = `out_${i}.mp4`;
      const duration = range.endSeconds - range.startSeconds;
      const code = await ffmpeg.exec(['-ss', range.startSeconds.toFixed(3), '-i', sourceName, '-t', duration.toFixed(3), '-map', '0:v:0', '-map', '0:a?', '-c', 'copy', '-avoid_negative_ts', 'make_zero', '-movflags', '+faststart', '-y', output]);
      if (code !== 0) throw new Error(`FFmpeg failed while slicing ${filename}. The source codec/container may not support this operation.`);
      const data = await ffmpeg.readFile(output);
      if (typeof data === 'string' || data.length === 0) throw new Error(`FFmpeg produced an empty clip for ${filename}.`);
      const bytes = new Uint8Array(data as Uint8Array);
      results.push({ filename, blob: new Blob([bytes], { type: 'video/mp4' }), size: bytes.byteLength });
      await ffmpeg.deleteFile(output);
      onProgress?.((i + 1) / sorted.length, i + 1, sorted.length);
    }
    return results;
  } finally {
    ffmpeg.off('progress', progressHandler);
    try { await ffmpeg.deleteFile(sourceName); } catch { /* already removed */ }
    for (let i = 0; i < sorted.length; i++) { try { await ffmpeg.deleteFile(`out_${i}.mp4`); } catch { /* cleanup is best effort */ } }
  }
  });
}

export async function releaseFFmpegMemory(): Promise<void> {
  await serialized(async () => {
    if (ffmpegInstance?.loaded) { ffmpegInstance.terminate(); ffmpegInstance = null; loadPromise = null; }
  });
}

/** Concatenates already sliced clips locally using the concat demuxer and stream copy. Clips should share compatible codecs/streams. */
export async function concatenateClipsLocally(clips: SlicedClip[], onProgress?: (progress: number) => void): Promise<Blob> {
  return serialized(async () => {
  if (!clips.length || clips.length > 60) throw new Error('Provide between 1 and 60 clips to concatenate.');
  const ffmpeg = await getFFmpeg();
  const names: string[] = [];
  const progressHandler = ({ progress }: { progress: number }) => onProgress?.(Math.min(1, Math.max(0, progress)));
  ffmpeg.on('progress', progressHandler);
  try {
    for (let i = 0; i < clips.length; i++) {
      const name = `concat_${i}.mp4`;
      await ffmpeg.writeFile(name, await fetchFile(clips[i].blob));
      names.push(name);
      onProgress?.((i + 1) / (clips.length + 1));
    }
    const list = names.map(name => `file '${name}'`).join('\n');
    await ffmpeg.writeFile('concat_list.txt', list);
    const code = await ffmpeg.exec(['-f', 'concat', '-safe', '0', '-i', 'concat_list.txt', '-c', 'copy', '-y', 'Full_RoughCut.mp4']);
    if (code !== 0) throw new Error('Could not concatenate clips. The clips may use incompatible codecs or stream layouts.');
    const output = await ffmpeg.readFile('Full_RoughCut.mp4');
    if (typeof output === 'string' || !output.length) throw new Error('FFmpeg produced an empty rough cut.');
    onProgress?.(1);
    return new Blob([new Uint8Array(output as Uint8Array)], { type: 'video/mp4' });
  } finally {
    ffmpeg.off('progress', progressHandler);
    for (const name of [...names, 'concat_list.txt', 'Full_RoughCut.mp4']) { try { await ffmpeg.deleteFile(name); } catch { /* cleanup is best effort */ } }
  }
  });
}
