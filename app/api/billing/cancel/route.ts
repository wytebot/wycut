import { NextRequest, NextResponse } from 'next/server';
import { cancelJob, cleanJobId } from '@/lib/billing/credits';
import { verifyGoogleIdentity } from '@/lib/billing/google-identity';
import { isAllowedApiOrigin } from '@/lib/server/origin';
import { enforceRateLimit } from '@/lib/server/rate-limit';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** The user tapped Cancel and confirmed: stop billing for that generation run and return the credits it used. */
export async function POST(req: NextRequest) {
  const limit = enforceRateLimit(req, 'billing-cancel', 30, 10 * 60 * 1000);
  if (!limit.allowed) return NextResponse.json({ error: 'Too many cancel requests. Wait a minute and retry.' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds), 'Cache-Control': 'no-store' } });
  if (!isAllowedApiOrigin(req)) return NextResponse.json({ error: 'Cross-origin request rejected.' }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
  let body: { idToken?: string; jobId?: string };
  try { body = await req.json() as typeof body; } catch { return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 }); }
  const jobId = cleanJobId(body.jobId);
  if (!jobId) return NextResponse.json({ error: 'Missing generation id.' }, { status: 400 });
  let identity;
  try { identity = await verifyGoogleIdentity(body.idToken || ''); } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : 'Sign in to cancel.' }, { status: 401 }); }
  try {
    const result = await cancelJob(identity.userId, jobId);
    return NextResponse.json({ ok: true, refunded: result.refunded, charges: result.rows }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error('[api/billing/cancel] failed', { message: e instanceof Error ? e.message : 'unknown' });
    return NextResponse.json({ error: 'Could not refund this generation right now. Your credits are safe; try Cancel again in a moment.', code: 'CANCEL_FAILED' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
