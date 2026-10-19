import { NextRequest, NextResponse } from 'next/server';
import { enforceRateLimit } from '@/lib/server/rate-limit';
import { generateNarration } from '@/lib/ai/tts-generator';
import type { NarrativeBeat } from '@/lib/ai/script-generator';
import { isAllowedApiOrigin } from '@/lib/server/origin';
import { verifyGoogleIdentity } from '@/lib/billing/google-identity';
import { InsufficientCreditsError, JobCancelledError, cleanJobId, reserveNarrationBatch, releaseNarrationBatch, type NarrationCharge } from '@/lib/billing/credits';

export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * Narration is generated in small batches so a 10-minute production does not
 * return a huge duplicated base64 JSON response that fails serverless payload limits.
 */
export async function POST(req: NextRequest) {
  const limit = enforceRateLimit(req, 'narration', 45, 10 * 60 * 1000);
  if (!limit.allowed) return NextResponse.json({ error: 'Too many narration requests. Please wait before retrying.' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds), 'Cache-Control': 'no-store' } });
  if (!isAllowedApiOrigin(req)) return NextResponse.json({ error: 'Cross-origin request rejected. Configure CAPACITOR_ALLOWED_ORIGINS for the installed app.' }, { status: 403 });

  try {
    const body = await req.json() as { beats?: NarrativeBeat[]; voice?: string; idToken?: string; recapId?: string; jobId?: string };
    if (!Array.isArray(body.beats) || body.beats.length < 1 || body.beats.length > 2) {
      return NextResponse.json({ error: 'Send one or two script beats per narration request.' }, { status: 400 });
    }
    const identity = await verifyGoogleIdentity(body.idToken || '');
    let beats: NarrativeBeat[]; let charge: NarrationCharge | undefined;
    try { const reserved = await reserveNarrationBatch(body.recapId || '', identity.userId, identity.email, body.beats.map(beat => ({ index: Number(beat?.index), id: String(beat?.id || '') })), cleanJobId(body.jobId)); beats = reserved.beats as NarrativeBeat[]; charge = reserved.charge; }
    catch (e) { if (e instanceof JobCancelledError) return NextResponse.json({ error: 'This generation was cancelled.', code: 'JOB_CANCELLED' }, { status: 409, headers: { 'Cache-Control': 'no-store' } }); if (e instanceof InsufficientCreditsError) return NextResponse.json({ error: `Narration needs ${e.needed} more credits and your balance is ${Math.floor(e.balance)}. Top up to continue.`, code: 'INSUFFICIENT_CREDITS', needed: e.needed, balance: Math.floor(e.balance), billingUrl: '/billing' }, { status: 402, headers: { 'Cache-Control': 'no-store' } }); const code = e instanceof Error ? e.message : ''; const message = code === 'NARRATION_LIMIT' ? 'This recap has reached its narration request limit. Start a new recap if you need more narration.' : code === 'NARRATION_BEAT_MISMATCH' ? 'The requested narration does not match the saved script. Regenerate the script and retry.' : code === 'SCRIPT_NOT_STORED' ? 'The saved script is unavailable. Generate a new recap first.' : code === 'NARRATION_BATCH_TOO_LARGE' ? 'Choose a smaller narration batch; this batch exceeds 3,500 characters.' : 'This recap is not owned by the signed-in account. Generate a script first.'; return NextResponse.json({ error: message }, { status: 403 }); }
    const totalCharacters = beats.reduce((total, beat) => total + beat.narration.length, 0);
    if (totalCharacters > 3_500) { await releaseNarrationBatch(body.recapId || '', identity.userId, charge).catch(() => undefined); return NextResponse.json({ error: 'Send narration in batches totalling 3,500 characters or fewer.' }, { status: 400 }); }
    const allowedVoices = new Set(['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer']);
    const voice = typeof body.voice === 'string' && allowedVoices.has(body.voice) ? body.voice : 'onyx';
    let result: Awaited<ReturnType<typeof generateNarration>>;
    try { result = await generateNarration(beats, { voice }); }
    catch (error) { await releaseNarrationBatch(body.recapId || '', identity.userId, charge).catch(() => undefined); throw error; }
    const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64');
    return NextResponse.json({
      provider: result.provider,
      segments: result.segments.map(segment => ({
        index: segment.index,
        id: segment.id,
        filename: segment.filename,
        text: segment.text,
        audioBase64: b64(segment.audio),
      })),
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const status = error instanceof Error && /Google|token|account|sign in/i.test(error.message) ? 401 : 502;
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Narration generation failed.' }, { status, headers: { 'Cache-Control': 'no-store' } });
  }
}
