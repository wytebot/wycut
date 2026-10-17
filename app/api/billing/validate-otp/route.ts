import { NextRequest, NextResponse } from 'next/server';
import { enforceRateLimit } from '@/lib/server/rate-limit';
import { isAllowedApiOrigin } from '@/lib/server/origin';
import { getAdminDb } from '@/lib/firebase-admin';
import { verifyGoogleIdentity } from '@/lib/billing/google-identity';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Input = { txRef?: string; idToken?: string; code?: string; action?: 'otp' | 'pin' };
export async function POST(request: NextRequest) {
  const limit = enforceRateLimit(request, 'billing-auth', 8, 10 * 60 * 1000);
  if (!limit.allowed) return NextResponse.json({ error: 'Too many verification attempts. Wait before retrying.' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds), 'Cache-Control': 'no-store' } });
  if (!isAllowedApiOrigin(request)) return NextResponse.json({ error: 'Cross-origin request rejected.' }, { status: 403 });
  const secret = process.env.FLW_SECRET_KEY; const baseUrl = process.env.FLW_V4_API_BASE;
  if (!secret || !baseUrl) return NextResponse.json({ error: 'Flutterwave billing is not configured.' }, { status: 503 });
  let input: Input;
  try { input = await request.json() as Input; } catch { return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 }); }
  if (!input.txRef || input.txRef.length > 140) return NextResponse.json({ error: 'Invalid transaction reference.' }, { status: 400 });
  let identity;
  try { identity = await verifyGoogleIdentity(input.idToken || ''); } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : 'Google authentication failed.' }, { status: 401 }); }
  const action = input.action === 'pin' ? 'pin' : 'otp';
  const code = input.code || '';
  if (!/^\d{4,8}$/.test(code)) return NextResponse.json({ error: `Enter a valid ${action.toUpperCase()}.` }, { status: 400 });
  try {
    const db = getAdminDb(); const orderRef = db.collection('wycut_orders').doc(input.txRef); const orderSnap = await orderRef.get();
    if (!orderSnap.exists || orderSnap.data()?.userId !== identity.userId) return NextResponse.json({ error: 'Order not found for this Google account.' }, { status: 404 });
    const order = orderSnap.data()!;
    if (!order.providerChargeId) return NextResponse.json({ error: 'The provider has not supplied a charge ID for this order.' }, { status: 409 });
    if (['successful', 'credited'].includes(String(order.status))) return NextResponse.json({ status: 'SUCCESSFUL', message: 'This order has already been completed.' });
    const template = process.env.FLW_V4_VALIDATE_PATH_TEMPLATE || '/charges/{id}/validate';
    if (!template.startsWith('/') || template.startsWith('//')) return NextResponse.json({ error: 'Invalid validation path configuration.' }, { status: 500 });
    const path = template.replace('{id}', encodeURIComponent(String(order.providerChargeId))).replace('{tx_ref}', encodeURIComponent(input.txRef));
    const response = await fetch(`${baseUrl.replace(/\/$/, '')}${path}`, { method: 'POST', headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ [action]: code }), cache: 'no-store', signal: AbortSignal.timeout(20000) });
    const result = await response.json().catch(() => ({})) as { status?: string; message?: string; data?: { status?: string; id?: string | number; tx_ref?: string; [key: string]: unknown } };
    if (!response.ok) return NextResponse.json({ error: result.message || `${action.toUpperCase()} validation failed. Check the code and try again.` }, { status: 502 });
    const status = String(result.data?.status || result.status || 'pending').toLowerCase();
    await orderRef.set({ providerStatus: status, status: status === 'successful' ? 'awaiting_verification' : status, updatedAt: new Date().toISOString() }, { merge: true });
    return NextResponse.json({ status: status.toUpperCase(), message: result.message || 'Authentication accepted. Verifying settlement before adding recap credits.', txRef: input.txRef }, { headers: { 'Cache-Control': 'no-store' } });
  } catch { return NextResponse.json({ error: 'Could not validate with Flutterwave. Check transaction status before retrying.' }, { status: 502 }); }
}
