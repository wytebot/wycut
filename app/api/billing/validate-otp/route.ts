import { NextRequest, NextResponse } from 'next/server';
import { enforceRateLimit } from '@/lib/server/rate-limit';
import { isAllowedApiOrigin } from '@/lib/server/origin';
import { getAdminDb } from '@/lib/firebase-admin';
import { verifyGoogleIdentity } from '@/lib/billing/google-identity';
import { getFlutterwaveV4AccessToken, flutterwaveV4BaseUrl } from '@/lib/billing/flutterwave-v4';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Input = { txRef?: string; idToken?: string; code?: string; action?: 'otp' | 'pin'; nonce?: string; encryptedPin?: string };
export async function POST(request: NextRequest) {
  const limit = enforceRateLimit(request, 'billing-auth', 8, 10 * 60 * 1000);
  if (!limit.allowed) return NextResponse.json({ error: 'Too many verification attempts. Wait before retrying.' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds), 'Cache-Control': 'no-store' } });
  if (!isAllowedApiOrigin(request)) return NextResponse.json({ error: 'Cross-origin request rejected.' }, { status: 403 });
  let input: Input; try { input = await request.json() as Input; } catch { return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 }); }
  if (!input.txRef || !/^[A-Za-z0-9_-]{12,140}$/.test(input.txRef)) return NextResponse.json({ error: 'Invalid transaction reference.' }, { status: 400 });
  let identity; try { identity = await verifyGoogleIdentity(input.idToken || ''); } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : 'Google authentication failed.' }, { status: 401 }); }
  const action = input.action === 'pin' ? 'pin' : 'otp';
  let authorization: Record<string, unknown>;
  if (action === 'otp') { const code = input.code || ''; if (!/^\d{4,8}$/.test(code)) return NextResponse.json({ error: 'Enter a valid 4–8 digit OTP.' }, { status: 400 }); authorization = { type: 'otp', otp: { code } }; }
  else { if (!/^[A-Za-z0-9]{12}$/.test(String(input.nonce || '')) || !input.encryptedPin || input.encryptedPin.length > 4096) return NextResponse.json({ error: 'Encrypted PIN data is missing or invalid.' }, { status: 400 }); authorization = { type: 'pin', pin: { nonce: input.nonce, encrypted_pin: input.encryptedPin } }; }
  try {
    const db = getAdminDb(); const orderRef = db.collection('wycut_orders').doc(input.txRef); const orderSnap = await orderRef.get();
    if (!orderSnap.exists || orderSnap.data()?.userId !== identity.userId) return NextResponse.json({ error: 'Order not found for this Google account.' }, { status: 404 });
    const order = orderSnap.data()!; const chargeId = String(order.providerChargeId || '');
    if (!chargeId) return NextResponse.json({ error: 'Flutterwave has not returned a charge ID for this order.' }, { status: 409 });
    if (order.status !== 'requires_auth') return NextResponse.json({ error: 'This order is not awaiting OTP/PIN authorization.' }, { status: 409, headers: { 'Cache-Control': 'no-store' } });
    if (order.status === 'credited') return NextResponse.json({ status: 'SUCCESSFUL', message: 'This order is already complete.' }, { headers: { 'Cache-Control': 'no-store' } });
    const token = await getFlutterwaveV4AccessToken(); const base = flutterwaveV4BaseUrl();
    const response = await fetch(`${base}/charges/${encodeURIComponent(chargeId)}`, { method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ authorization }), cache: 'no-store', signal: AbortSignal.timeout(20000) });
    const result = await response.json().catch(() => ({})) as { status?: string; message?: string; data?: { id?: string | number; status?: string; next_action?: { type?: string; requires_pin?: boolean; requires_otp?: boolean; redirect_url?: string | { url?: string }; [key: string]: unknown }; redirect_url?: string } };
    if (!response.ok) return NextResponse.json({ error: result.message || 'Flutterwave authorization failed. Check the code and retry.' }, { status: 502, headers: { 'Cache-Control': 'no-store' } });
    const status = String(result.data?.status || result.status || 'pending').toLowerCase();
    const actionText = `${result.data?.next_action?.type || ''} ${result.data?.next_action?.requires_pin ? 'requires_pin' : ''} ${result.data?.next_action?.requires_otp ? 'requires_otp' : ''}`.toLowerCase();
    const challenge = /pin/.test(actionText) ? 'pin' : /otp/.test(actionText) ? 'otp' : '';
    const rawRedirect = result.data?.next_action?.redirect_url; const redirectUrl = typeof rawRedirect === 'string' ? rawRedirect : rawRedirect && typeof rawRedirect === 'object' ? rawRedirect.url : result.data?.redirect_url;
    await db.runTransaction(async transaction => { const latest = await transaction.get(orderRef); const existingStatus = String(latest.data()?.status || ''); transaction.set(orderRef, { providerStatus: status, status: ['credited', 'provider_rejected'].includes(existingStatus) ? existingStatus : challenge ? 'requires_auth' : status === 'succeeded' ? 'awaiting_webhook_verification' : status, updatedAt: new Date().toISOString() }, { merge: true }); });
    return NextResponse.json({ status: challenge ? `REQUIRES_${challenge.toUpperCase()}` : status.toUpperCase(), challenge, redirectUrl: redirectUrl || null, message: challenge ? `Flutterwave requires ${challenge.toUpperCase()} verification to continue.` : status === 'succeeded' ? 'Authorization accepted. Waiting for WyBuild webhook verification before adding credits.' : result.message || 'Authorization submitted. Checking payment status…', txRef: input.txRef }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not validate with Flutterwave v4.' }, { status: 502, headers: { 'Cache-Control': 'no-store' } }); }
}
