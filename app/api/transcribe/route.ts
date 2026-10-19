import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI, { toFile } from 'openai';
import { enforceRateLimit } from '@/lib/server/rate-limit';
import { isAllowedApiOrigin } from '@/lib/server/origin';
import { verifyGoogleIdentity } from '@/lib/billing/google-identity';
import { getAdminDb } from '@/lib/firebase-admin';
import { hasLifetimeFreeAccess } from '@/lib/billing/entitlements';
import { InsufficientCreditsError, JobCancelledError, cleanJobId, chargeCredits, refundCharge } from '@/lib/billing/credits';
import { transcribeCredits } from '@/lib/billing/pricing';

export const runtime = 'nodejs';
export const maxDuration = 60;

type Segment = { start: number; end?: number; text: string };
const MAX_BASE64_CHARS = 3_600_000; // ~2.7 MB of audio; a 5-minute 24 kbps chunk is ~0.9 MB
const ALLOWED_MIME = new Set(['audio/mp3', 'audio/mpeg', 'audio/aac', 'audio/wav', 'audio/ogg', 'audio/flac']);

function parseClock(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const text = String(value ?? '').trim();
  if (!text) return NaN;
  if (/^\d+(\.\d+)?$/.test(text)) return Number(text);
  const parts = text.split(':').map(Number);
  if (parts.some(n => !Number.isFinite(n))) return NaN;
  return parts.reduce((total, n) => total * 60 + n, 0);
}

function extractJson(raw: string): unknown {
  const clean = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const a = clean.indexOf('{'); const b = clean.lastIndexOf('}');
  if (a < 0 || b <= a) throw new Error('Transcription response did not contain JSON.');
  return JSON.parse(clean.slice(a, b + 1));
}

async function transcribeWithGemini(audio: string, mimeType: string, durationSeconds: number): Promise<Segment[]> {
  const model = process.env.GEMINI_TRANSCRIBE_MODEL || 'gemini-2.5-flash-lite';
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
  const m = genAI.getGenerativeModel({ model }, { timeout: 50_000 });
  const prompt = `Transcribe the spoken dialogue in this audio clip (${Math.round(durationSeconds)} seconds long). Keep the original language. Return ONLY JSON: {"segments":[{"start":"MM:SS","text":"..."}]}. Start a new segment at every sentence or roughly every 4-10 seconds. "start" is the time from the START OF THIS CLIP, never from the movie. Skip music, silence and sound effects. Do not summarize, translate or add commentary. If there is no speech return {"segments":[]}.`;
  const request = {
    contents: [{ role: 'user', parts: [{ inlineData: { mimeType, data: audio } }, { text: prompt }] }],
    generationConfig: { responseMimeType: 'application/json', temperature: 0, maxOutputTokens: 8192, thinkingConfig: { thinkingBudget: 0 } },
  } as Parameters<typeof m.generateContent>[0];
  const result = await m.generateContent(request);
  const parsed = extractJson(result.response.text()) as { segments?: Array<{ start?: unknown; text?: unknown }> };
  if (!Array.isArray(parsed.segments)) throw new Error('Transcription response had no segments array.');
  return parsed.segments.flatMap(item => {
    const start = parseClock(item.start); const text = typeof item.text === 'string' ? item.text.replace(/\s+/g, ' ').trim() : '';
    return Number.isFinite(start) && start >= 0 && text ? [{ start, text }] : [];
  });
}

async function transcribeWithWhisper(audio: string, mimeType: string): Promise<Segment[]> {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 50_000, maxRetries: 0 });
  const ext = mimeType.includes('aac') ? 'aac' : 'mp3';
  const file = await toFile(Buffer.from(audio, 'base64'), `chunk.${ext}`, { type: mimeType });
  const result = await openai.audio.transcriptions.create({ file, model: 'whisper-1', response_format: 'verbose_json' }) as unknown as { segments?: Array<{ start: number; end: number; text: string }> };
  return (result.segments || []).flatMap(item => item.text?.trim() ? [{ start: Number(item.start), end: Number(item.end), text: item.text.trim() }] : []);
}

const dailyDoc = (userId: string) => getAdminDb().collection('wycut_transcribe_limits').doc(`${userId}_${new Date().toISOString().slice(0, 10)}`);
/** Abuse guard independent of credits: the most 5-minute parts one account may transcribe per UTC day. */
async function chargeDailyChunk(userId: string) {
  const configured = Number(process.env.TRANSCRIBE_DAILY_CHUNK_CAP || 80);
  const cap = Number.isFinite(configured) && configured > 0 ? Math.floor(configured) : 80;
  const ref = dailyDoc(userId);
  await getAdminDb().runTransaction(async transaction => {
    const snap = await transaction.get(ref);
    const count = Number(snap.data()?.count || 0);
    if (count >= cap) throw new Error('TRANSCRIBE_DAILY_CAP');
    transaction.set(ref, { count: count + 1, updatedAt: new Date().toISOString() }, { merge: true });
  });
}
async function releaseDailyChunk(userId: string) {
  const ref = dailyDoc(userId);
  await getAdminDb().runTransaction(async transaction => {
    const snap = await transaction.get(ref);
    const count = Number(snap.data()?.count || 0);
    if (count > 0) transaction.set(ref, { count: count - 1, updatedAt: new Date().toISOString() }, { merge: true });
  });
}

export async function POST(req: NextRequest) {
  const limit = enforceRateLimit(req, 'transcribe', 90, 10 * 60 * 1000);
  if (!limit.allowed) return NextResponse.json({ error: 'Too many transcription requests. Wait a minute and retry.' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds), 'Cache-Control': 'no-store' } });
  if (!isAllowedApiOrigin(req)) return NextResponse.json({ error: 'Cross-origin request rejected.' }, { status: 403 });
  let body: { idToken?: string; audioBase64?: string; mimeType?: string; durationSeconds?: number; deviceId?: string; jobId?: string };
  try { body = await req.json() as typeof body; } catch { return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 }); }
  if (typeof body.audioBase64 !== 'string' || !body.audioBase64 || body.audioBase64.length > MAX_BASE64_CHARS) return NextResponse.json({ error: 'Audio chunk is missing or too large.' }, { status: 413 });
  const mimeType = typeof body.mimeType === 'string' && ALLOWED_MIME.has(body.mimeType) ? body.mimeType : 'audio/mp3';
  const claimedDuration = Math.min(600, Math.max(5, Number(body.durationSeconds) || 300));
  // The client states the clip length, so never bill for less than the audio's size implies (assumes at most ~48 kbps).
  const sizeImpliedDuration = Math.min(600, Math.floor((body.audioBase64.length * 0.75) / 6000));
  const duration = Math.max(claimedDuration, sizeImpliedDuration);
  let identity;
  try { identity = await verifyGoogleIdentity(body.idToken || ''); } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : 'Sign in to transcribe.' }, { status: 401 }); }
  if (identity.email.endsWith('@phone.wycut.invalid') && !hasLifetimeFreeAccess(identity.email)) return NextResponse.json({ error: 'A verified Google email is required to transcribe video.', code: 'GOOGLE_EMAIL_REQUIRED' }, { status: 403 });
  const deviceId = req.headers.get('x-device-id') || body.deviceId || '';
  const amount = transcribeCredits(duration);
  try { await chargeDailyChunk(identity.userId); }
  catch (e) {
    if (e instanceof Error && e.message === 'TRANSCRIBE_DAILY_CAP') return NextResponse.json({ error: 'Daily transcription limit reached for this account. Try again tomorrow or upload a subtitle file.', code: 'TRANSCRIBE_DAILY_CAP' }, { status: 429 });
    console.error('[api/transcribe] limit check failed', { message: e instanceof Error ? e.message : 'unknown' });
    return NextResponse.json({ error: 'WyCut could not check transcription limits (billing database). Check Firebase configuration in Vercel logs.', code: 'CREDIT_DATABASE_CONFIGURATION' }, { status: 503 });
  }
  let ledgerId = '';
  try { ledgerId = await chargeCredits({ userId: identity.userId, email: identity.email, amount, kind: 'transcribe', deviceId, jobId: cleanJobId(body.jobId) }); }
  catch (e) {
    await releaseDailyChunk(identity.userId).catch(() => undefined);
    if (e instanceof JobCancelledError) return NextResponse.json({ error: 'This generation was cancelled.', code: 'JOB_CANCELLED' }, { status: 409, headers: { 'Cache-Control': 'no-store' } });
    if (e instanceof InsufficientCreditsError) return NextResponse.json({ error: `Transcribing this part needs ${e.needed} credits and your balance is ${Math.floor(e.balance)}. Top up to continue.`, code: 'INSUFFICIENT_CREDITS', needed: e.needed, balance: Math.floor(e.balance), billingUrl: '/billing' }, { status: 402, headers: { 'Cache-Control': 'no-store' } });
    console.error('[api/transcribe] credit charge failed', { message: e instanceof Error ? e.message : 'unknown' });
    return NextResponse.json({ error: 'WyCut could not use your credits (billing database). Check Firebase configuration in Vercel logs.', code: 'CREDIT_DATABASE_CONFIGURATION' }, { status: 503 });
  }
  const refundAll = async () => { await Promise.all([refundCharge(ledgerId), releaseDailyChunk(identity.userId)]).catch(error => console.error('[api/transcribe] refund failed', { message: error instanceof Error ? error.message : 'unknown' })); };
  const headers = { 'Cache-Control': 'no-store', 'X-Credits-Charged': String(ledgerId ? amount : 0) };
  const errors: string[] = [];
  if (process.env.GEMINI_API_KEY) {
    try { return NextResponse.json({ provider: 'gemini', creditsCharged: ledgerId ? amount : 0, segments: await transcribeWithGemini(body.audioBase64, mimeType, duration) }, { headers }); }
    catch (e) { errors.push(`Gemini: ${e instanceof Error ? e.message : 'failed'}`); }
  }
  // Whisper costs about 5x more than Gemini Flash-Lite, so it is a fallback only. Set TRANSCRIBE_ALLOW_WHISPER_FALLBACK=0 to disable it.
  if (process.env.OPENAI_API_KEY && process.env.TRANSCRIBE_ALLOW_WHISPER_FALLBACK !== '0') {
    try { return NextResponse.json({ provider: 'whisper', creditsCharged: ledgerId ? amount : 0, segments: await transcribeWithWhisper(body.audioBase64, mimeType) }, { headers }); }
    catch (e) { errors.push(`Whisper: ${e instanceof Error ? e.message : 'failed'}`); }
  }
  await refundAll();
  console.error('[api/transcribe] failed', { errors });
  if (!process.env.GEMINI_API_KEY && !process.env.OPENAI_API_KEY) return NextResponse.json({ error: 'Transcription is not configured. Add GEMINI_API_KEY (or OPENAI_API_KEY) in Vercel.', code: 'AI_PROVIDER_NOT_CONFIGURED' }, { status: 503 });
  return NextResponse.json({ error: 'The AI could not transcribe this audio chunk. You were not charged for it. Retry; if it keeps failing check provider quota and Vercel logs for "[api/transcribe] failed".', code: 'TRANSCRIBE_FAILED' }, { status: 502 });
}
