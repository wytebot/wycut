import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import { extractAacTrack } from './audio-demux';

export type ClipRange = { index: number; id: string; startSeconds: number; endSeconds: number };
export type SlicedClip = { filename: string; blob: Blob; size: number };
let ffmpegInstance: FFmpeg | null = null;
let loadPromise: Promise<FFmpeg> | null = null;
let operationQueue: Promise<unknown> = Promise.resolve();
let coreCache: { coreURL: string; wasmURL: string } | null = null;

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
        // Prefer the copy bundled with the app (cached, works offline, no 30 MB download each time); fall back to the CDN.
        const sources = ['/ffmpeg', 'https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd'];
        let coreURL = coreCache?.coreURL || ''; let wasmURL = coreCache?.wasmURL || ''; let lastError: unknown = null;
        for (const base of coreCache ? [] : sources) {
          try {
            [coreURL, wasmURL] = await Promise.all([
              toBlobURL(`${base}/ffmpeg-core.js`, 'text/javascript'),
              toBlobURL(`${base}/ffmpeg-core.wasm`, 'application/wasm'),
            ]);
            lastError = null; break;
          } catch (error) { lastError = error; }
        }
        if (lastError || !coreURL) throw lastError instanceof Error ? lastError : new Error('Could not load the video engine.');
        coreCache = { coreURL, wasmURL };
        await ffmpeg.load({ coreURL, wasmURL });
        return ffmpeg;
      })().finally(() => { loadPromise = null; });
    }
    await loadPromise;
  }
  return ffmpeg;
}
/** Largest video WyCut will open. The file is read in place (not copied into memory), so this is a technical limit, not a RAM limit. */
/** Starts loading the video engine in the background so the first cut does not wait for it. Safe to call repeatedly. */
export function warmFFmpeg(): void { if (typeof window === 'undefined') return; void getFFmpeg().catch(() => undefined); }

export const MAX_SOURCE_BYTES = 2 * 1024 * 1024 * 1024 - 1;
export const MAX_SOURCE_LABEL = '2 GB';
const MEMORY_FALLBACK_BYTES = 100 * 1024 * 1024;

/**
 * Mounts the picked file into FFmpeg's filesystem with WORKERFS, which reads it from disk on demand.
 * The old approach copied the whole video into JavaScript memory and then again into WebAssembly memory (2-3x the file size),
 * which is why phones crashed on anything big. Falls back to the in-memory copy for small files if mounting is unavailable.
 */
async function openSource(ffmpeg: FFmpeg, file: File, name: string): Promise<{ path: string; close: () => Promise<void> }> {
  const mountPoint = `/src_${Date.now()}`;
  try {
    await ffmpeg.createDir(mountPoint);
    const mounted = await ffmpeg.mount('WORKERFS' as unknown as Parameters<FFmpeg['mount']>[0], { files: [new File([file], name, { type: file.type })] }, mountPoint);
    if (mounted === false) throw new Error('mount refused');
    return { path: `${mountPoint}/${name}`, close: async () => { try { await ffmpeg.unmount(mountPoint); } catch { /* already unmounted */ } try { await ffmpeg.deleteDir(mountPoint); } catch { /* cleanup is best effort */ } } };
  } catch {
    try { await ffmpeg.deleteDir(mountPoint); } catch { /* not created */ }
    if (file.size > MEMORY_FALLBACK_BYTES) throw new Error(`This browser could not open the video directly from your device, and it is too large to load into memory (over ${Math.round(MEMORY_FALLBACK_BYTES / 1024 / 1024)} MB). Try Chrome, or upload subtitles instead.`);
    await ffmpeg.writeFile(name, await fetchFile(file));
    return { path: name, close: async () => { try { await ffmpeg.deleteFile(name); } catch { /* already removed */ } } };
  }
}
function safeName(value: string): string { return value.toLowerCase().replace(/[^a-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 45) || 'scene'; }

/** Re-encodes each clip to make trim boundaries frame-accurate. This is slower than stream copy and uses more CPU/memory. */
export async function sliceVideoLocally(file: File, ranges: ClipRange[], onProgress?: (progress: number, current: number, total: number) => void, options: { fast?: boolean; aspectRatio?: '9:16' | '16:9' | '1:1' | '4:5'; resolution?: '720p' | '1080p' } = {}): Promise<SlicedClip[]> {
  return serialized(async () => {
  if (!file || file.size === 0) throw new Error('Choose a non-empty local video file.');
  const extension = (file.name.split('.').pop() || '').toLowerCase();
  if (!['mp4', 'm4v', 'mov'].includes(extension)) throw new Error('Frame-accurate re-encoding currently supports MP4, M4V, and MOV sources. Convert other containers locally first or choose a supported file.');
  if (file.size > MAX_SOURCE_BYTES) throw new Error(`This video is larger than ${MAX_SOURCE_LABEL}. Split it first, or use a lower-resolution copy.`);
  if (!ranges.length || ranges.length > 60) throw new Error('Provide between 1 and 60 clip ranges.');
  const sorted = ranges.map((r, i) => ({ ...r, index: Number.isFinite(r.index) ? Math.max(1, Math.floor(r.index)) : i + 1 })).sort((a, b) => a.index - b.index);
  for (const r of sorted) if (!Number.isFinite(r.startSeconds) || !Number.isFinite(r.endSeconds) || r.startSeconds < 0 || r.endSeconds <= r.startSeconds) throw new Error(`Invalid range for ${r.id}.`);
  const ffmpeg = await getFFmpeg();
  const sourceName = `source_${Date.now()}.${extension}`;
  let source: Awaited<ReturnType<typeof openSource>> | null = null;
  let activeClip = 0;
  const progressHandler = ({ progress }: { progress: number }) => { const within = Number.isFinite(progress) ? Math.min(0.99, Math.max(0, progress)) : 0; onProgress?.(Math.min(0.99, (activeClip + within) / sorted.length), activeClip + 1, sorted.length); };
  ffmpeg.on('progress', progressHandler);
  const results: SlicedClip[] = [];
  try {
    source = await openSource(ffmpeg, file, sourceName);
    for (let i = 0; i < sorted.length; i++) {
      activeClip = i; onProgress?.(i / sorted.length, i + 1, sorted.length);
      const range = sorted[i]; const id = safeName(range.id); const filename = `${String(range.index).padStart(3, '0')}_${id}.mp4`;
      if (range.endSeconds - range.startSeconds > 3600) throw new Error(`Clip ${filename} is over one hour long; split the range before processing.`);
      // Re-encode after accurate seeking. All clips use the same H.264/AAC settings so the rough-cut concat is more reliable.
      const output = `out_${i}.mp4`;
      const duration = range.endSeconds - range.startSeconds;
      const start = range.startSeconds.toFixed(3); const length = duration.toFixed(3);
      // Precise path: start half a millisecond early so rounding can never drop the first frame, and end 3 ms early so the last frame is never one too many.
      const preciseStart = Math.max(0, range.startSeconds - 0.0005).toFixed(4); const preciseLength = Math.max(0.01, duration - 0.003).toFixed(4); // ffmpeg's -t keeps one frame too many on frame-aligned ends; 3 ms is less than any frame gap up to 240 fps (tested: exact frame counts)
      // Fast cut copies the streams (no re-encode): seconds instead of minutes, but it starts at the nearest earlier keyframe.
      const lowResolution = options.resolution === '720p';
      const dimensions = options.aspectRatio === '9:16' ? (lowResolution ? '720:1280' : '1080:1920')
        : options.aspectRatio === '16:9' ? (lowResolution ? '1280:720' : '1920:1080')
        : options.aspectRatio === '1:1' ? (lowResolution ? '720:720' : '1080:1080')
        : options.aspectRatio === '4:5' ? (lowResolution ? '720:900' : '1080:1350') : '';
      const vf = dimensions ? `scale=${dimensions}:force_original_aspect_ratio=increase,crop=${dimensions},setsar=1` : '';
      let code = options.fast && !options.aspectRatio ? await ffmpeg.exec(['-ss', start, '-i', source.path, '-t', length, '-map', '0:v:0', '-map', '0:a?', '-c', 'copy', '-sn', '-dn', '-avoid_negative_ts', 'make_zero', '-y', output]) : -1;
      const encodeArgs = ['-accurate_seek', '-ss', preciseStart, '-i', source.path, '-t', preciseLength, '-map', '0:v:0', '-map', '0:a?', ...(vf ? ['-vf', vf] : []), '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23', '-c:a', 'aac', '-b:a', '128k', '-af', 'aresample=async=1:first_pts=0', '-sn', '-dn', '-pix_fmt', 'yuv420p', '-avoid_negative_ts', 'make_zero', '-y', output];
      if (code !== 0 && !(options.fast && file.size > 150 * 1024 * 1024)) code = await ffmpeg.exec(encodeArgs);
      if (code !== 0) {
        if (options.fast && file.size > 150 * 1024 * 1024) throw new Error(`Fast cutting could not read clip ${filename}. To protect memory on this large source, WyCut did not automatically retry with a memory-heavy re-encode. Try another MP4/MOV copy or disable Fast Cut only for smaller files.`);
        throw new Error(`FFmpeg failed while cutting ${filename}. The source may use an unsupported codec or this device may be out of memory.`);
      }
      const data = await ffmpeg.readFile(output);
      if (typeof data === 'string' || data.length === 0) throw new Error(`FFmpeg produced an empty clip for ${filename}.`);
      results.push({ filename, blob: new Blob([data as unknown as BlobPart], { type: 'video/mp4' }), size: data.length });
      await ffmpeg.deleteFile(output);
      onProgress?.((i + 1) / sorted.length, i + 1, sorted.length);
    }
    return results;
  } finally {
    ffmpeg.off('progress', progressHandler);
    await source?.close();
    for (let i = 0; i < sorted.length; i++) { try { await ffmpeg.deleteFile(`out_${i}.mp4`); } catch { /* cleanup is best effort */ } }
  }
  });
}

/** Stops whatever FFmpeg is doing right now (used by Cancel). The running job fails and the next job starts a fresh engine. */
export function abortFFmpeg(): void {
  try { ffmpegInstance?.terminate(); } catch { /* already stopped */ }
  ffmpegInstance = null; loadPromise = null;
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
    return new Blob([output as unknown as BlobPart], { type: 'video/mp4' });
  } finally {
    ffmpeg.off('progress', progressHandler);
    for (const name of [...names, 'concat_list.txt', 'Full_RoughCut.mp4']) { try { await ffmpeg.deleteFile(name); } catch { /* cleanup is best effort */ } }
  }
  });
}

export type AudioChunk = { index: number; blob: Blob; mimeType: string; offsetSeconds: number; durationSeconds: number };

/**
 * Extracts only the audio track (mono, 16 kHz, 24 kbps) and splits it into short chunks.
 * Speech models bill by audio duration, not file size, so the small bitrate costs nothing in accuracy
 * for speech but keeps every upload far below serverless body limits.
 */
export async function extractAudioChunksLocally(file: File, chunkSeconds: number, onProgress?: (progress: number) => void): Promise<AudioChunk[]> {
  return serialized(async () => {
    if (!file || file.size === 0) throw new Error('Choose a non-empty local video file.');
    const extension = (file.name.split('.').pop() || '').toLowerCase();
    if (!['mp4', 'm4v', 'mov'].includes(extension)) throw new Error('Audio extraction supports MP4, M4V and MOV sources.');
    if (file.size > MAX_SOURCE_BYTES) throw new Error(`This video is larger than ${MAX_SOURCE_LABEL}. Use a smaller copy or upload subtitles instead.`);
    // Fast path: copy just the audio track out of the video (reads ~2-3% of the file), then let FFmpeg work on that small file.
    const demuxed = await extractAacTrack(file, p => onProgress?.(p * 0.5));
    const workFile = demuxed?.file ?? file;
    const workExtension = demuxed ? 'aac' : extension;
    const base = demuxed ? 0.5 : 0; const span = demuxed ? 0.5 : 1;
    const ffmpeg = await getFFmpeg();
    const sourceName = `audio_src_${Date.now()}.${workExtension}`;
    const handler = ({ progress }: { progress: number }) => onProgress?.(base + Math.min(1, Math.max(0, progress)) * span);
    ffmpeg.on('progress', handler);
    const created: string[] = [];
    let source: Awaited<ReturnType<typeof openSource>> | null = null;
    try {
      source = await openSource(ffmpeg, workFile, sourceName);
      const attempts: Array<{ ext: string; mime: string; codec: string[] }> = [
        { ext: 'mp3', mime: 'audio/mp3', codec: ['-c:a', 'libmp3lame', '-b:a', '24k'] },
        { ext: 'aac', mime: 'audio/aac', codec: ['-c:a', 'aac', '-b:a', '32k'] },
      ];
      for (const attempt of attempts) {
        const code = await ffmpeg.exec(['-i', source.path, '-vn', '-map', '0:a:0', '-ac', '1', '-ar', '16000', ...attempt.codec, '-f', 'segment', '-segment_time', String(chunkSeconds), '-reset_timestamps', '1', '-y', `achunk_%03d.${attempt.ext}`]);
        const listing = await ffmpeg.listDir('.');
        const names = listing.filter(item => !item.isDir && item.name.startsWith('achunk_') && item.name.endsWith(`.${attempt.ext}`)).map(item => item.name).sort();
        created.push(...names);
        if (code !== 0 || !names.length) { for (const n of names) { try { await ffmpeg.deleteFile(n); } catch { /* ignore */ } } continue; }
        const chunks: AudioChunk[] = [];
        for (let i = 0; i < names.length; i++) {
          const data = await ffmpeg.readFile(names[i]);
          if (typeof data === 'string' || !data.length) continue;
          const bytes = new Uint8Array(data as Uint8Array);
          // Only the final part is shorter than a full chunk; estimate it from its size so it is not billed as a full part.
          const bytesPerSecond = attempt.ext === 'mp3' ? 3000 : 4000;
          const durationSeconds = i === names.length - 1 ? Math.min(chunkSeconds, Math.max(2, Math.round(bytes.byteLength / bytesPerSecond))) : chunkSeconds;
          chunks.push({ index: i, blob: new Blob([bytes.buffer as ArrayBuffer], { type: attempt.mime }), mimeType: attempt.mime, offsetSeconds: i * chunkSeconds, durationSeconds });
        }
        if (chunks.length) return chunks;
      }
      throw new Error('This video has no readable audio track, or FFmpeg could not decode it on this device.');
    } finally {
      ffmpeg.off('progress', handler);
      await source?.close();
      for (const n of created) { try { await ffmpeg.deleteFile(n); } catch { /* cleanup is best effort */ } }
    }
  });
}

export type LocalAudioLayer = { blob: Blob; name: string; startSeconds: number; volume: number; loop?: boolean };

/** Mixes user-provided/generated audio layers into an existing MP4 locally. Guard the caller against huge blobs first. */
export async function mixAudioTracksLocally(video: Blob, tracks: LocalAudioLayer[], onProgress?: (progress: number) => void): Promise<Blob> {
  return serialized(async () => {
    if (!video.size) throw new Error('The recap video is empty. Re-create the rough cut and try again.');
    if (!tracks.length || tracks.length > 12) throw new Error('Add between 1 and 12 sound layers before mixing.');
    for (const [i, track] of tracks.entries()) {
      if (!track.blob.size) throw new Error(`Sound layer ${i + 1} is empty. Remove it and add it again.`);
      if (!Number.isFinite(track.startSeconds) || track.startSeconds < 0) throw new Error(`Sound layer ${i + 1} has an invalid start time.`);
      if (!Number.isFinite(track.volume) || track.volume < 0 || track.volume > 1) throw new Error(`Sound layer ${i + 1} has an invalid volume.`);
    }
    const ffmpeg = await getFFmpeg();
    const videoName = `mix_video_${Date.now()}.mp4`;
    const audioNames: string[] = [];
    const handler = ({ progress }: { progress: number }) => onProgress?.(Math.min(1, Math.max(0, progress)));
    ffmpeg.on('progress', handler);
    try {
      await ffmpeg.writeFile(videoName, await fetchFile(video));
      for (let i = 0; i < tracks.length; i++) {
        const ext = /wav/i.test(tracks[i].blob.type) ? 'wav' : /ogg/i.test(tracks[i].blob.type) ? 'ogg' : /aac/i.test(tracks[i].blob.type) ? 'aac' : /m4a/i.test(tracks[i].blob.type) ? 'm4a' : /flac/i.test(tracks[i].blob.type) ? 'flac' : 'mp3';
        const name = `mix_sound_${i}_${Date.now()}.${ext}`;
        await ffmpeg.writeFile(name, await fetchFile(tracks[i].blob)); audioNames.push(name);
      }
      const buildFilter = (includeOriginal: boolean) => {
        const filters: string[] = []; const inputs: string[] = [];
        if (includeOriginal) { filters.push('[0:a]volume=0.55[baseaudio]'); inputs.push('[baseaudio]'); }
        tracks.forEach((track, i) => {
          const delay = Math.max(0, Math.round(track.startSeconds * 1000));
          filters.push(`[${i + 1}:a]adelay=${delay}|${delay},volume=${Math.max(0, Math.min(1, track.volume)).toFixed(2)}[fx${i}]`);
          inputs.push(`[fx${i}]`);
        });
        filters.push(`${inputs.join('')}amix=inputs=${inputs.length}:duration=longest:dropout_transition=2,alimiter=limit=0.95[aout]`);
        return filters.join(';');
      };
      const outputName = `mix_output_${Date.now()}.mp4`;
      const baseArgs = ['-i', videoName, ...audioNames.flatMap((name, i) => [...(tracks[i].loop ? ['-stream_loop', '-1'] : []), '-i', name])];
      // Prefer preserving the movie's original audio. If it has no audio stream, retry with just the added sound layers.
      let code = await ffmpeg.exec([...baseArgs, '-filter_complex', buildFilter(true), '-map', '0:v:0', '-map', '[aout]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', '-y', outputName]);
      if (code !== 0) {
        try { await ffmpeg.deleteFile(outputName); } catch { /* retry output may not exist */ }
        code = await ffmpeg.exec([...baseArgs, '-filter_complex', buildFilter(false), '-map', '0:v:0', '-map', '[aout]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', ...(tracks.some(track => track.loop) ? ['-shortest'] : []), '-movflags', '+faststart', '-y', outputName]);
      }
      if (code !== 0) throw new Error('FFmpeg could not mix the audio layers. Try shorter MP3/WAV files, reduce the number of layers, or export the video and sounds separately.');
      const output = await ffmpeg.readFile(outputName);
      if (typeof output === 'string' || !output.length) throw new Error('The audio mix produced an empty file. Try again with a shorter video.');
      onProgress?.(1);
      return new Blob([new Uint8Array(output as Uint8Array)], { type: 'video/mp4' });
    } finally {
      ffmpeg.off('progress', handler);
      for (const name of [videoName, ...audioNames]) { try { await ffmpeg.deleteFile(name); } catch { /* cleanup is best effort */ } }
      try { await ffmpeg.deleteFile(`mix_output_${Date.now()}.mp4`); } catch { /* timestamp differs; output cleanup below is best effort */ }
      try { const files = await ffmpeg.listDir('.'); for (const item of files) if (!item.isDir && item.name.startsWith('mix_output_') && item.name.endsWith('.mp4')) { try { await ffmpeg.deleteFile(item.name); } catch { /* ignore */ } } } catch { /* cleanup is best effort */ }
    }
  });
}
