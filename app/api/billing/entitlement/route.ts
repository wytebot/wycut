import { NextRequest, NextResponse } from 'next/server';
import { verifyGoogleIdentity } from '@/lib/billing/google-identity';
import { getAdminDb } from '@/lib/firebase-admin';
import { hasLifetimeFreeAccess } from '@/lib/billing/entitlements';
import { isAllowedApiOrigin } from '@/lib/server/origin';
import { enforceRateLimit } from '@/lib/server/rate-limit';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(req: NextRequest) {
  const limit = enforceRateLimit(req, 'billing-entitlement', 30, 10 * 60 * 1000);
  if (!limit.allowed) return NextResponse.json({ error: 'Too many account status requests.' }, { status: 429, headers: { 'Cache-Control': 'no-store', 'Retry-After': String(limit.retryAfterSeconds) } });
  if (!isAllowedApiOrigin(req)) return NextResponse.json({ error: 'Cross-origin request rejected.' }, { status: 403 });
  let body: { idToken?: string };
  try { body = await req.json() as typeof body; } catch { return NextResponse.json({ error: 'Invalid request.' }, { status: 400 }); }
  try {
    const identity = await verifyGoogleIdentity(body.idToken || '');
    const freeAccess = hasLifetimeFreeAccess(identity.email);
    const wallet = await getAdminDb().collection('wycut_users').doc(identity.userId).get();
    const recapsAvailable = Math.max(0, Number(wallet.data()?.recapsAvailable || 0));
    return NextResponse.json({ freeAccess, email: identity.email, plan: freeAccess ? 'lifetime_free' : 'standard', recapsAvailable }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Authentication failed.' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  }
}
