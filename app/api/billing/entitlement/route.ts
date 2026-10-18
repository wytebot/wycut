import { createHmac } from 'node:crypto';
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
  let body: { idToken?: string; deviceId?: string };
  try { body = await req.json() as typeof body; } catch { return NextResponse.json({ error: 'Invalid request.' }, { status: 400 }); }
  try {
    const identity = await verifyGoogleIdentity(body.idToken || '');
    const freeAccess = hasLifetimeFreeAccess(identity.email);
    const db = getAdminDb();
    const wallet = await db.collection('wycut_users').doc(identity.userId).get();
    const recapsAvailable = Math.max(0, Number(wallet.data()?.recapsAvailable || 0));
    const pepper = process.env.TRIAL_PEPPER || '';
    const hash = (value: string) => createHmac('sha256', pepper).update(value).digest('hex');
    const deviceId = req.headers.get('x-device-id') || body.deviceId || '';
    let freeTrialRemaining = 0;
    if (!freeAccess && pepper && deviceId.length >= 16 && deviceId.length <= 200 && !identity.email.endsWith('@phone.wycut.invalid')) {
      const claimIds = [hash(`email:${identity.email.trim().toLowerCase()}`), hash(`user:${identity.userId}`), hash(`device:${deviceId}`)];
      const claims = await Promise.all(claimIds.map(id => db.collection('wycut_trial_claims').doc(id).get()));
      const remaining = claims.map(snap => Math.max(0, 2 - Number(snap.data()?.count ?? (snap.exists ? 1 : 0))));
      const today = new Date().toISOString().slice(0, 10);
      const daily = await db.collection('wycut_trial_limits').doc(today).get();
      const configuredCap = Number(process.env.FREE_TRIAL_DAILY_CAP || 3);
      const cap = Number.isFinite(configuredCap) && configuredCap > 0 ? Math.floor(configuredCap) : 3;
      if (Number(daily.data()?.count || 0) < cap) freeTrialRemaining = Math.min(...remaining);
    }
    const freeTrialAvailable = freeTrialRemaining > 0;
    return NextResponse.json({ freeAccess, freeTrialAvailable, freeTrialRemaining, email: identity.email, plan: freeAccess ? 'lifetime_free' : 'standard', recapsAvailable }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Authentication failed.' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  }
}
