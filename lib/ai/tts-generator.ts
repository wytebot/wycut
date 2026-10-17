import OpenAI from 'openai';
import { createClient } from '@deepgram/sdk';
import type { NarrativeBeat } from './script-generator';
import { getAiOperationsConfig } from './operations-config';

export type AudioSegment = { index: number; id: string; filename: string; audio: Uint8Array; text: string };
export type NarrationResult = { segments: AudioSegment[]; captionsSrt: string; provider: 'openai' | 'deepgram' | 'mixed' };
const clean = (s: string) => s.replace(/\s+/g, ' ').trim();
const timecode = (seconds: number) => { const ms = Math.max(0, Math.round(seconds * 1000)); const h = Math.floor(ms / 3600000), m = Math.floor(ms % 3600000 / 60000), s = Math.floor(ms % 60000 / 1000), milli = ms % 1000; return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')},${String(milli).padStart(3,'0')}`; };
async function openAiSpeech(text: string, voice: string, model: string): Promise<Uint8Array> {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 45_000, maxRetries: 1 });
  const response = await client.audio.speech.create({ model, voice: (voice || 'onyx') as 'onyx', input: text, response_format: 'mp3', speed: 1.08 });
  return new Uint8Array(await response.arrayBuffer());
}
async function deepgramSpeech(text: string, model: string): Promise<Uint8Array> {
  if (!process.env.DEEPGRAM_API_KEY) throw new Error('DEEPGRAM_API_KEY is not configured.');
  const dg = createClient(process.env.DEEPGRAM_API_KEY);
  const response = await dg.speak.request({ text }, { model, encoding: 'mp3' });
  const stream = await response.getStream();
  if (!stream) throw new Error('Deepgram returned no audio stream.');
  const chunks: Uint8Array[] = []; const reader = stream.getReader();
  while (true) { const { done, value } = await reader.read(); if (done) break; if (value) chunks.push(value); }
  const total = chunks.reduce((n, c) => n + c.length, 0); const result = new Uint8Array(total); let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
  return result;
}
function buildSrt(beats: NarrativeBeat[]): string {
  let elapsed = 0;
  return beats.map((beat, i) => {
    const words = clean(beat.narration).split(' ').length;
    const duration = Math.max(2.2, words / 2.45);
    const start = elapsed; const end = elapsed + duration; elapsed = end + 0.18;
    return `${i + 1}\n${timecode(start)} --> ${timecode(end)}\n${clean(beat.narration)}\n`;
  }).join('\n');
}
/** Generates narration with bounded concurrency to reduce latency without exhausting provider or server resources. */
export async function generateNarration(beats: NarrativeBeat[], options: { voice?: string } = {}): Promise<NarrationResult> {
  if (!beats.length || beats.length > 45) throw new Error('Provide between 1 and 45 beats.');
  if (!process.env.OPENAI_API_KEY && !process.env.DEEPGRAM_API_KEY) throw new Error('Configure OPENAI_API_KEY or DEEPGRAM_API_KEY on the server.');
  const operations = await getAiOperationsConfig();
  const jobs: Array<{ beat: NarrativeBeat; text: string; part: number; parts: number }> = [];
  for (const beat of beats) {
    const text = clean(beat.narration);
    if (!text) continue;
    // OpenAI TTS has an input-length limit. Split on sentence boundaries before making provider calls.
    const sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [text];
    const chunks: string[] = [];
    let current = '';
    for (const sentence of sentences) {
      const candidate = `${current} ${sentence}`.trim();
      if (candidate.length > 3500 && current) { chunks.push(current); current = sentence.trim(); }
      else current = candidate;
      if (current.length > 3900) {
        for (let offset = 0; offset < current.length; offset += 3500) chunks.push(current.slice(offset, offset + 3500));
        current = '';
      }
    }
    if (current) chunks.push(current);
    chunks.forEach((chunk, index) => jobs.push({ beat, text: chunk, part: index + 1, parts: chunks.length }));
  }
  if (!jobs.length) throw new Error('No narration text was provided.');
  const completed: Array<AudioSegment | undefined> = new Array(jobs.length);
  const providers = new Set<'openai' | 'deepgram'>();
  let cursor = 0;
  const worker = async () => {
    while (true) {
      const index = cursor++;
      if (index >= jobs.length) return;
      const job = jobs[index];
      let audio: Uint8Array;
      let provider: 'openai' | 'deepgram';
      if (process.env.OPENAI_API_KEY) {
        try { audio = await openAiSpeech(job.text, options.voice || 'onyx', operations.tts.openaiModel); provider = 'openai'; }
        catch (error) {
          if (!process.env.DEEPGRAM_API_KEY) throw new Error(`OpenAI TTS failed and Deepgram fallback is not configured: ${error instanceof Error ? error.message : 'unknown error'}`);
          audio = await deepgramSpeech(job.text, operations.tts.deepgramModel); provider = 'deepgram';
        }
      } else { audio = await deepgramSpeech(job.text, operations.tts.deepgramModel); provider = 'deepgram'; }
      providers.add(provider);
      const id = job.beat.id.replace(/[^a-z0-9_-]/gi, '_').slice(0, 32) || `scene_${job.beat.index}`;
      const suffix = job.parts > 1 ? `_part${String(job.part).padStart(2, '0')}` : '';
      completed[index] = { index: index + 1, id: `${id}${suffix}`, filename: `${String(index + 1).padStart(3, '0')}_${id}${suffix}.mp3`, audio, text: job.text };
    }
  };
  try { await Promise.all(Array.from({ length: Math.min(operations.tts.maxConcurrency, jobs.length) }, () => worker())); }
  catch (error) { throw new Error(`Narration generation failed: ${error instanceof Error ? error.message : 'provider error'}. Retry; completed audio is not persisted on WyCut servers.`); }
  const segments = completed.filter((item): item is AudioSegment => Boolean(item));
  if (!segments.length) throw new Error('No narration segments were generated.');
  const provider = providers.size > 1 ? 'mixed' : providers.has('deepgram') ? 'deepgram' : 'openai';
  // Do not duplicate all audio bytes into a second full-track buffer on the server.
  // The Capacitor/web client assembles a Blob from ordered segment files instead.
  return { segments, captionsSrt: buildSrt(beats), provider };
}
