import { NextRequest, NextResponse } from 'next/server';
import { verifyGoogleIdentity } from '@/lib/billing/google-identity';
import { hasLifetimeFreeAccess } from '@/lib/billing/entitlements';
import { isAllowedApiOrigin } from '@/lib/server/origin';
import { enforceRateLimit } from '@/lib/server/rate-limit';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(req: NextRequest) {
  const limit = enforceRateLimit(req, 'billing-config', 20, 10 * 60 * 1000);
  if (!limit.allowed) return NextResponse.json({ error: 'Too many billing configuration requests.' }, { status: 429, headers: { 'Cache-Control': 'no-store', 'Retry-After': String(limit.retryAfterSeconds) } });
  if (!isAllowedApiOrigin(req)) return NextResponse.json({ error: 'Cross-origin request rejected.' }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
  let body: { idToken?: string };
  try { body = await req.json() as typeof body; } catch { return NextResponse.json({ error: 'Invalid request.' }, { status: 400 }); }
  try {
    const identity = await verifyGoogleIdentity(body.idToken || '');
    if (hasLifetimeFreeAccess(identity.email)) return NextResponse.json({ freeAccess: true }, { headers: { 'Cache-Control': 'no-store' } });
    const encryptionKey = process.env.FLW_ENCRYPTION_KEY || '';
    let decoded: Buffer;
    try { decoded = Buffer.from(encryptionKey, 'base64'); } catch { decoded = Buffer.alloc(0); }
    if (!encryptionKey || decoded.length !== 32) return NextResponse.json({ error: 'Flutterwave v4 card encryption is not configured. Set FLW_ENCRYPTION_KEY to the merchant-provided base64 AES-256 key.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
    return NextResponse.json({ encryptionKey, currency: 'NGN' }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Authentication failed.' }, { status: 401, headers: { 'Cache-Control': 'no-store' } }); }
}
