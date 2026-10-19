import { extractAudioChunksLocally, type AudioChunk } from '@/lib/ffmpeg/client-slicer';
import { apiUrl } from '@/lib/api-client';
import { transcribeCredits } from '@/lib/billing/pricing';
import { TopUpError } from '@/lib/billing/client-errors';

const CHUNK_SECONDS = 300;
const MAX_TRANSCRIPT_CHARS = 110_000; // script API limit is 120,000 characters
type Cue = { start: number; end: number; text: string };
type ApiSegment = { start: number; end?: number; text: string };
// Paid parts are remembered for this browser session, so a retry after a failure never pays for the same audio twice.
const chunkCache = new Map<string, ApiSegment[]>();
function deviceId(): string { try { return localStorage.getItem('wycut_device_id') || ''; } catch { return ''; } }

function srtTime(seconds: number): string {
  const ms = Math.max(0, Math.round(seconds * 1000));
  const h = Math.floor(ms / 3600000), m = Math.floor(ms % 3600000 / 60000), s = Math.floor(ms % 60000 / 1000), milli = ms % 1000;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(milli).padStart(3, '0')}`;
}
async function toBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + 0x8000, bytes.length)));
  return btoa(binary);
}

/** Merge short cues so a feature-length film stays under the transcript size limit. */
function buildSrt(cues: Cue[]): string {
  for (const maxCue of [12, 25, 45, 90]) {
    const merged: Cue[] = [];
    for (const cue of cues) {
      const last = merged[merged.length - 1];
      if (last && cue.end - last.start <= maxCue && cue.start - last.end < 3) { last.end = cue.end; last.text += ` ${cue.text}`; }
      else merged.push({ ...cue });
    }
    const srt = merged.map((cue, i) => `${i + 1}\n${srtTime(cue.start)} --> ${srtTime(cue.end)}\n${cue.text}\n`).join('\n');
    if (srt.length <= MAX_TRANSCRIPT_CHARS || maxCue === 90) {
      if (srt.length > MAX_TRANSCRIPT_CHARS) throw new Error('This video has too much dialogue to analyse in one recap. Use a shorter video or split it first.');
      return srt;
    }
  }
  return '';
}

async function transcribeChunk(chunk: AudioChunk, getToken: () => Promise<string>): Promise<ApiSegment[]> {
  const audioBase64 = await toBase64(chunk.blob);
  let lastError = 'Transcription failed.';
  for (let attempt = 0; attempt < 2; attempt++) {
    let response: Response;
    try {
      response = await fetch(apiUrl('/api/transcribe'), { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Device-Id': deviceId() }, body: JSON.stringify({ idToken: await getToken(), deviceId: deviceId(), audioBase64, mimeType: chunk.mimeType, durationSeconds: chunk.durationSeconds }), cache: 'no-store' });
    } catch (error) { lastError = `Could not reach the transcription API (${error instanceof Error ? error.message : 'network error'}).`; continue; }
    const data = await response.json().catch(() => null) as { error?: string; code?: string; needed?: number; balance?: number; segments?: ApiSegment[] } | null;
    if (response.ok && data && Array.isArray(data.segments)) return data.segments;
    if (response.status === 402 || data?.code === 'INSUFFICIENT_CREDITS') throw new TopUpError(data?.error || 'You need more credits to continue.', data?.needed, data?.balance);
    lastError = `${data?.error || `Transcription failed (HTTP ${response.status}).`}${data?.code ? ` [${data.code}]` : ''}`;
    // Quota/auth/config problems will not fix themselves on retry.
    if ([401, 402, 403, 413, 429, 503].includes(response.status)) break;
  }
  throw new Error(lastError);
}

/** Video file -> audio-only chunks (local FFmpeg) -> timestamped SRT text. Nothing but small audio chunks leaves the device. */
export async function transcribeVideoToSrt(video: File, getToken: () => Promise<string>, onStatus: (stage: string, progress: number) => void, options: { cacheKey?: string; ensureCredits?: (needed: number) => Promise<void> } = {}): Promise<string> {
  onStatus('Extracting audio from your video on this device…', 3);
  const chunks = await extractAudioChunksLocally(video, CHUNK_SECONDS, p => onStatus('Extracting audio from your video on this device…', 3 + Math.round(p * 7)));
  const results: ApiSegment[][] = new Array(chunks.length);
  const keyFor = (i: number) => (options.cacheKey ? `${options.cacheKey}:${chunks.length}:${i}` : '');
  chunks.forEach((_, i) => { const cached = keyFor(i) ? chunkCache.get(keyFor(i)) : undefined; if (cached) results[i] = cached; });
  // Check the balance for the whole video BEFORE paying for any part, so a short balance never leaves a half-transcribed video.
  const needed = chunks.reduce((sum, chunk, i) => sum + (results[i] ? 0 : transcribeCredits(chunk.durationSeconds)), 0);
  if (needed > 0 && options.ensureCredits) await options.ensureCredits(needed);
  let done = chunks.filter((_, i) => results[i]).length; let cursor = 0;
  const worker = async () => {
    while (true) {
      const i = cursor++;
      if (i >= chunks.length) return;
      if (results[i]) continue;
      results[i] = await transcribeChunk(chunks[i], getToken);
      if (keyFor(i)) chunkCache.set(keyFor(i), results[i]);
      done++;
      onStatus(`Transcribing audio… ${done} of ${chunks.length} parts`, 10 + Math.round(done / chunks.length * 12));
    }
  };
  await Promise.all([worker(), worker()]);
  const cues: Cue[] = [];
  chunks.forEach((chunk, i) => {
    const segments = [...(results[i] || [])].sort((a, b) => a.start - b.start).filter(s => s.start <= chunk.durationSeconds + 2);
    segments.forEach((segment, j) => {
      const start = chunk.offsetSeconds + segment.start;
      const next = segments[j + 1];
      const words = segment.text.split(/\s+/).filter(Boolean).length;
      const natural = start + Math.max(1.5, words / 2.6);
      let end = segment.end !== undefined ? chunk.offsetSeconds + segment.end : natural;
      if (next) end = Math.min(end, chunk.offsetSeconds + next.start); else end = Math.min(end, chunk.offsetSeconds + chunk.durationSeconds);
      if (end <= start) end = start + 1;
      cues.push({ start, end, text: segment.text });
    });
  });
  if (cues.reduce((n, c) => n + c.text.length, 0) < 40) throw new Error('No speech was detected in this video\'s audio. Upload a subtitle file instead.');
  cues.sort((a, b) => a.start - b.start);
  return buildSrt(cues);
}
