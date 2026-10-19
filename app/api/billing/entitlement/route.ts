import { NextRequest, NextResponse } from 'next/server';
import { verifyGoogleIdentity } from '@/lib/billing/google-identity';
import { hasLifetimeFreeAccess } from '@/lib/billing/entitlements';
import { ensureWelcomeCredits } from '@/lib/billing/credits';
import { isAllowedApiOrigin } from '@/lib/server/origin';
import { enforceRateLimit } from '@/lib/server/rate-limit';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const noStore = { 'Cache-Control': 'no-store' };
/** Returns the signed-in account's credit balance and (once, per account/email/device) grants the welcome credits. */
export async function POST(req: NextRequest) {
  const limit = enforceRateLimit(req, 'billing-entitlement', 60, 10 * 60 * 1000);
  if (!limit.allowed) return NextResponse.json({ error: 'Too many account status requests.' }, { status: 429, headers: { ...noStore, 'Retry-After': String(limit.retryAfterSeconds) } });
  if (!isAllowedApiOrigin(req)) return NextResponse.json({ error: 'Cross-origin request rejected.' }, { status: 403, headers: noStore });
  let body: { idToken?: string; deviceId?: string };
  try { body = await req.json() as typeof body; } catch { return NextResponse.json({ error: 'Invalid request.' }, { status: 400, headers: noStore }); }
  try {
    const identity = await verifyGoogleIdentity(body.idToken || '');
    const freeAccess = hasLifetimeFreeAccess(identity.email);
    const deviceId = req.headers.get('x-device-id') || body.deviceId || '';
    let credits = 0; let welcomeGranted = false;
    try {
      const wallet = await ensureWelcomeCredits(identity.userId, identity.email, deviceId);
      credits = Math.max(0, wallet.credits); welcomeGranted = wallet.granted;
    } catch (error) {
      console.error('[api/billing/entitlement] wallet read failed', { message: error instanceof Error ? error.message : 'unknown' });
      return NextResponse.json({ error: 'WyCut could not read your credit balance. Try again in a moment.', code: 'CREDIT_DATABASE_CONFIGURATION' }, { status: 503, headers: noStore });
    }
    return NextResponse.json({ freeAccess, credits, welcomeGranted, email: identity.email, plan: freeAccess ? 'lifetime_free' : 'credits' }, { headers: noStore });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Authentication failed.' }, { status: 401, headers: noStore });
  }
}
