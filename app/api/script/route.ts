import { NextRequest, NextResponse } from 'next/server';
import { enforceRateLimit } from '@/lib/server/rate-limit';
import { generateRecapScript } from '@/lib/ai/script-generator';
import { isAllowedApiOrigin } from '@/lib/server/origin';
import { verifyGoogleIdentity } from '@/lib/billing/google-identity';
import { markRecapCreditConsumed, refundRecapCredit, reserveRecapCredit } from '@/lib/billing/credits';
export const runtime = 'nodejs';
export const maxDuration = 120;
export async function POST(req: NextRequest) {
  const limit = enforceRateLimit(req, 'script', 5, 10 * 60 * 1000);
  if (!limit.allowed) return NextResponse.json({ error: 'Too many requests. Please wait before retrying.' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds), 'Cache-Control': 'no-store' } });
  if (!isAllowedApiOrigin(req)) return NextResponse.json({ error: 'Cross-origin request rejected. Configure CAPACITOR_ALLOWED_ORIGINS for the installed app.' }, { status: 403 });
  let body: { title?: string; transcript?: string; targetRuntimeSeconds?: number; beatCount?: number; idToken?: string; deviceId?: string };
  try { body = await req.json() as typeof body; } catch { return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 }); }
  if (typeof body.title !== 'string' || typeof body.transcript !== 'string') return NextResponse.json({ error: 'Provide title and transcript text.' }, { status: 400 });
  if (body.transcript.length > 120_000) return NextResponse.json({ error: 'Transcript exceeds 120,000 characters.' }, { status: 413 });
  let identity;
  try { identity = await verifyGoogleIdentity(body.idToken || ''); } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : 'Sign in with Google to use a recap credit.' }, { status: 401 }); }
  const deviceId = req.headers.get('x-device-id') || body.deviceId || '';
  if (identity.email.endsWith('@phone.wycut.invalid')) return NextResponse.json({ error: 'A verified Google email is required for the free trial.', code: 'GOOGLE_EMAIL_REQUIRED' }, { status: 403 });
  let usageId = '';
  try {
    usageId = await reserveRecapCredit(identity.userId, identity.email, body.title, deviceId);
  } catch (e) {
    if (e instanceof Error && ['FREE_TRIAL_USED_ON_DEVICE', 'FREE_TRIAL_ALREADY_USED'].includes(e.message)) return NextResponse.json({ error: 'The free recap has already been used for this account or device.', code: e.message }, { status: 402 });
    if (e instanceof Error && e.message === 'FREE_TRIAL_DAILY_CAP') return NextResponse.json({ error: 'Today’s free-trial limit has been reached. Please try again tomorrow.', code: e.message }, { status: 429 });
    if (e instanceof Error && e.message === 'FREE_TRIAL_DEVICE_REQUIRED') return NextResponse.json({ error: 'Device verification is not configured for free trials.', code: e.message }, { status: 503 });
    if (e instanceof Error && e.message === 'NO_RECAP_CREDITS') return NextResponse.json({ error: 'You have no recap credits. Purchase a single recap or a 10-recap pack to continue.', code: 'NO_RECAP_CREDITS', billingUrl: '/billing' }, { status: 402 });
    if (e instanceof Error && e.message === 'SCRIPT_RATE_LIMIT') return NextResponse.json({ error: 'This Google account has reached the five-script-per-10-minute limit. Wait a few minutes before generating again.', code: 'SCRIPT_RATE_LIMIT' }, { status: 429, headers: { 'Retry-After': '600', 'Cache-Control': 'no-store' } });
    return NextResponse.json({ error: 'Could not reserve a recap credit. Please try again.' }, { status: 503 });
  }
  try {
    const result = await generateRecapScript({ title: body.title, transcript: body.transcript, targetRuntimeSeconds: body.targetRuntimeSeconds ?? 600, beatCount: body.beatCount ?? 38 });
    await markRecapCreditConsumed(usageId, result.script);
    const srtRanges = [...body.transcript.matchAll(/(\d{1,2}):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d{1,2}):(\d{2}):(\d{2})[,.](\d{3})/g)];
    const vttRanges = [...body.transcript.matchAll(/(\d{2}):(\d{2})\.(\d{3})\s*-->\s*(\d{2}):(\d{2})\.(\d{3})/g)];
    const hasSourceTimecodes = srtRanges.some(m => Number(m[5]) * 3600 + Number(m[6]) * 60 + Number(m[7]) + Number(m[8]) / 1000 > Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4]) / 1000) || vttRanges.some(m => Number(m[4]) * 60 + Number(m[5]) + Number(m[6]) / 1000 > Number(m[1]) * 60 + Number(m[2]) + Number(m[3]) / 1000);
    return NextResponse.json({ ...result, recapId: usageId, hasSourceTimecodes }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    await refundRecapCredit(usageId).catch(() => undefined);
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Script generation failed. Your recap credit was refunded.' }, { status: 502 });
  }
}
