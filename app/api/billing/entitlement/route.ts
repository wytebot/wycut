import { NextRequest, NextResponse } from 'next/server';
import { verifyGoogleIdentity } from '@/lib/billing/google-identity';
import { hasLifetimeFreeAccess } from '@/lib/billing/entitlements';
import { isAllowedApiOrigin } from '@/lib/server/origin';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(req: NextRequest) {
  if (!isAllowedApiOrigin(req)) return NextResponse.json({ error: 'Cross-origin request rejected.' }, { status: 403 });
  let body: { idToken?: string };
  try { body = await req.json() as typeof body; } catch { return NextResponse.json({ error: 'Invalid request.' }, { status: 400 }); }
  try {
    const identity = await verifyGoogleIdentity(body.idToken || '');
    const freeAccess = hasLifetimeFreeAccess(identity.email);
    return NextResponse.json({ freeAccess, email: identity.email, plan: freeAccess ? 'lifetime_free' : 'standard' }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Authentication failed.' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  }
}
