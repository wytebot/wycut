import { NextRequest, NextResponse } from 'next/server';
import { enforceRateLimit } from '@/lib/server/rate-limit';
import { generateRecapScript } from '@/lib/ai/script-generator';
import { isAllowedApiOrigin } from '@/lib/server/origin';
import { verifyGoogleIdentity } from '@/lib/billing/google-identity';
import { InsufficientCreditsError, JobCancelledError, cleanJobId, markRecapCreditConsumed, refundRecapCredit, reserveRecapCredit } from '@/lib/billing/credits';
import { scriptCredits } from '@/lib/billing/pricing';
export const runtime = 'nodejs';
export const maxDuration = 120;
export async function POST(req: NextRequest) {
  const limit = enforceRateLimit(req, 'script', 5, 10 * 60 * 1000);
  if (!limit.allowed) return NextResponse.json({ error: 'Too many requests. Please wait before retrying.' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds), 'Cache-Control': 'no-store' } });
  if (!isAllowedApiOrigin(req)) return NextResponse.json({ error: 'Cross-origin request rejected. Configure CAPACITOR_ALLOWED_ORIGINS for the installed app.' }, { status: 403 });
  let body: { title?: string; transcript?: string; targetRuntimeSeconds?: number; beatCount?: number; idToken?: string; deviceId?: string; jobId?: string };
  try { body = await req.json() as typeof body; } catch { return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 }); }
  if (typeof body.title !== 'string' || typeof body.transcript !== 'string') return NextResponse.json({ error: 'Provide title and transcript text.' }, { status: 400 });
  if (body.transcript.length > 120_000) return NextResponse.json({ error: 'Transcript exceeds 120,000 characters.' }, { status: 413 });
  let identity;
  try { identity = await verifyGoogleIdentity(body.idToken || ''); } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : 'Sign in with Google to use your credits.' }, { status: 401 }); }
  const deviceId = req.headers.get('x-device-id') || body.deviceId || '';
  if (identity.email.endsWith('@phone.wycut.invalid')) return NextResponse.json({ error: 'A verified Google email is required to use WyCut credits.', code: 'GOOGLE_EMAIL_REQUIRED' }, { status: 403 });
  let usageId = '';
  try {
    usageId = await reserveRecapCredit(identity.userId, identity.email, body.title, deviceId, scriptCredits(body.transcript.length), cleanJobId(body.jobId));
  } catch (e) {
    if (e instanceof JobCancelledError) return NextResponse.json({ error: 'This generation was cancelled.', code: 'JOB_CANCELLED' }, { status: 409, headers: { 'Cache-Control': 'no-store' } });
    if (e instanceof InsufficientCreditsError) return NextResponse.json({ error: `This script needs ${e.needed} credits and your balance is ${Math.floor(e.balance)}. Top up to continue.`, code: 'INSUFFICIENT_CREDITS', needed: e.needed, balance: Math.floor(e.balance), billingUrl: '/billing' }, { status: 402, headers: { 'Cache-Control': 'no-store' } });
    if (e instanceof Error && e.message === 'SCRIPT_RATE_LIMIT') return NextResponse.json({ error: 'This Google account has reached the five-script-per-10-minute limit. Wait a few minutes before generating again.', code: 'SCRIPT_RATE_LIMIT' }, { status: 429, headers: { 'Retry-After': '600', 'Cache-Control': 'no-store' } });
    console.error('[api/script] credit reservation failed', { name: e instanceof Error ? e.name : 'UnknownError', message: e instanceof Error ? e.message : 'unknown reservation error' });
    const detail = e instanceof Error ? e.message : '';
    const configFailure = /FIREBASE_SERVICE_ACCOUNT|not configured|invalid base64|missing project_id|permission-denied|PERMISSION_DENIED|index/i.test(detail);
    return NextResponse.json({
      error: configFailure
        ? 'WyCut could not access its billing database. Check FIREBASE_SERVICE_ACCOUNT_JSON_BASE64 and Firestore permissions/indexes in the Vercel function logs.'
        : 'WyCut could not reserve your credits for this script. Retry in a moment; the exact database error is recorded in Vercel function logs.',
      code: configFailure ? 'CREDIT_DATABASE_CONFIGURATION' : 'CREDIT_RESERVATION_FAILED',
    }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
  try {
    const result = await generateRecapScript({ title: body.title, transcript: body.transcript, targetRuntimeSeconds: body.targetRuntimeSeconds ?? 600, beatCount: body.beatCount ?? 38 });
    await markRecapCreditConsumed(usageId, result.script);
    const srtRanges = [...body.transcript.matchAll(/(\d{1,2}):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d{1,2}):(\d{2}):(\d{2})[,.](\d{3})/g)];
    const vttRanges = [...body.transcript.matchAll(/(\d{2}):(\d{2})\.(\d{3})\s*-->\s*(\d{2}):(\d{2})\.(\d{3})/g)];
    const hasSourceTimecodes = srtRanges.some(m => Number(m[5]) * 3600 + Number(m[6]) * 60 + Number(m[7]) + Number(m[8]) / 1000 > Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4]) / 1000) || vttRanges.some(m => Number(m[4]) * 60 + Number(m[5]) + Number(m[6]) / 1000 > Number(m[1]) * 60 + Number(m[2]) + Number(m[3]) / 1000);
    return NextResponse.json({ ...result, recapId: usageId, hasSourceTimecodes }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    await refundRecapCredit(usageId).catch(refundError => {
      console.error('[api/script] credit refund failed', { usageId, error: refundError instanceof Error ? refundError.message : 'unknown refund error' });
    });
    const detail = e instanceof Error ? e.message : 'Unknown provider error';
    console.error('[api/script] generation failed', { usageId, name: e instanceof Error ? e.name : 'UnknownError', message: detail });
    const lower = detail.toLowerCase();
    const notConfigured = lower.includes('configure gemini') || lower.includes('configure openai') || lower.includes('api key') || lower.includes('api_key_invalid') || lower.includes('permission_denied') || lower.includes('[401') || lower.includes('[403') || lower.includes('incorrect api key');
    const quota = lower.includes('429') || lower.includes('quota') || lower.includes('rate limit') || lower.includes('resource_exhausted');
    const invalid = detail.includes('[invalid]');
    const timeout = lower.includes('timed out') || lower.includes('timeout') || lower.includes('aborted') || lower.includes('fetch failed');
    // Order matters: a validation failure must not be reported as a timeout or a config problem.
    const code = invalid ? 'AI_RESPONSE_INVALID' : notConfigured ? 'AI_PROVIDER_NOT_CONFIGURED' : quota ? 'AI_PROVIDER_QUOTA' : timeout ? 'AI_PROVIDER_TIMEOUT' : 'AI_GENERATION_FAILED';
    const validationReason = (detail.match(/\[invalid\]\s*([^|]+)/)?.[1] || '').trim().slice(0, 240);
    const publicMessage = code === 'AI_PROVIDER_NOT_CONFIGURED' ? 'AI script generation is not configured correctly on the server. Add a valid GEMINI_API_KEY or OPENAI_API_KEY in Vercel Environment Variables and redeploy. Your credits were refunded.'
      : code === 'AI_PROVIDER_QUOTA' ? 'The AI provider is rate-limited or out of quota right now. Your credits were refunded; wait a minute and retry, or check the provider billing/quota.'
      : code === 'AI_PROVIDER_TIMEOUT' ? 'The AI provider took too long to respond. Your credits were refunded; retry once, or try a shorter transcript.'
      : code === 'AI_RESPONSE_INVALID' ? `The AI wrote a script that failed WyCut's checks${validationReason ? ` (${validationReason})` : ''}. Your credits were refunded. Tap Generate again.`
      : 'WyCut could not complete AI script generation. Your credits were refunded. Check the Vercel function log for "[api/script] generation failed".';
    return NextResponse.json({ error: publicMessage, code }, { status: 502, headers: { 'Cache-Control': 'no-store' } });
  }
}
