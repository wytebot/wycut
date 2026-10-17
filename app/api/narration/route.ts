import { NextRequest, NextResponse } from 'next/server';
import { enforceRateLimit } from '@/lib/server/rate-limit';
import { generateNarration } from '@/lib/ai/tts-generator';
import type { NarrativeBeat } from '@/lib/ai/script-generator';
import { isAllowedApiOrigin } from '@/lib/server/origin';
import { verifyGoogleIdentity } from '@/lib/billing/google-identity';
import { reserveNarrationBatch } from '@/lib/billing/credits';

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
    const body = await req.json() as { beats?: NarrativeBeat[]; voice?: string; idToken?: string; recapId?: string };
    if (!Array.isArray(body.beats) || body.beats.length < 1 || body.beats.length > 2) {
      return NextResponse.json({ error: 'Send one or two script beats per narration request.' }, { status: 400 });
    }
    const totalCharacters = body.beats.reduce((total, beat) => total + (typeof beat?.narration === 'string' ? beat.narration.length : 0), 0);
    if (totalCharacters > 3_500) return NextResponse.json({ error: 'Send narration text totalling 3,500 characters or fewer per request.' }, { status: 400 });
    const beats = body.beats.map((beat, i) => {
      if (!beat || typeof beat.narration !== 'string' || beat.narration.length > 3_500 || !Number.isFinite(beat.startSeconds) || !Number.isFinite(beat.endSeconds) || beat.endSeconds <= beat.startSeconds) {
        throw new Error(`Beat ${i + 1} is invalid or too long. Each narration beat must be 3,500 characters or fewer.`);
      }
      return beat;
    });
    const identity = await verifyGoogleIdentity(body.idToken || '');
    try { await reserveNarrationBatch(body.recapId || '', identity.userId); }
    catch (e) { const message = e instanceof Error && e.message === 'NARRATION_LIMIT' ? 'This recap has reached its narration request limit. Start a new recap if you need more narration.' : 'This recap is not owned by the signed-in account. Generate a script first.'; return NextResponse.json({ error: message }, { status: 403 }); }
    const result = await generateNarration(beats, { voice: body.voice || 'onyx' });
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
