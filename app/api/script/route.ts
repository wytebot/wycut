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
  let body: { title?: string; transcript?: string; targetRuntimeSeconds?: number; beatCount?: number; idToken?: string };
  try { body = await req.json() as typeof body; } catch { return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 }); }
  if (typeof body.title !== 'string' || typeof body.transcript !== 'string') return NextResponse.json({ error: 'Provide title and transcript text.' }, { status: 400 });
  if (body.transcript.length > 120_000) return NextResponse.json({ error: 'Transcript exceeds 120,000 characters.' }, { status: 413 });
  let identity;
  try { identity = await verifyGoogleIdentity(body.idToken || ''); } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : 'Sign in with Google to use a recap credit.' }, { status: 401 }); }
  let usageId = '';
  try {
    usageId = await reserveRecapCredit(identity.userId, identity.email, body.title);
  } catch (e) {
    if (e instanceof Error && e.message === 'NO_RECAP_CREDITS') return NextResponse.json({ error: 'You have no recap credits. Purchase a single recap or a 10-recap pack to continue.', code: 'NO_RECAP_CREDITS', billingUrl: '/billing' }, { status: 402 });
    return NextResponse.json({ error: 'Could not reserve a recap credit. Please try again.' }, { status: 503 });
  }
  try {
    const result = await generateRecapScript({ title: body.title, transcript: body.transcript, targetRuntimeSeconds: body.targetRuntimeSeconds ?? 600, beatCount: body.beatCount ?? 38 });
    await markRecapCreditConsumed(usageId);
    return NextResponse.json({ ...result, recapId: usageId }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    await refundRecapCredit(usageId).catch(() => undefined);
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Script generation failed. Your recap credit was refunded.' }, { status: 502 });
  }
}
