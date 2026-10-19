import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import { walletCredits } from '@/lib/billing/credits';
import { verifyGoogleIdentity } from '@/lib/billing/google-identity';
import { isAllowedApiOrigin } from '@/lib/server/origin';
import { enforceRateLimit } from '@/lib/server/rate-limit';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(req: NextRequest) {
  const limit = enforceRateLimit(req, 'billing-status', 12, 10 * 60 * 1000);
  if (!limit.allowed) return NextResponse.json({ error: 'Too many status checks.' }, { status: 429, headers: { 'Cache-Control': 'no-store' } });
  if (!isAllowedApiOrigin(req)) return NextResponse.json({ error: 'Cross-origin request rejected.' }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
  let body: { txRef?: string; idToken?: string }; try { body = await req.json() as typeof body; } catch { return NextResponse.json({ error: 'Invalid request.' }, { status: 400 }); }
  if (!body.txRef || body.txRef.length > 140 || !/^wycut_[A-Za-z0-9-]{8,100}$/i.test(body.txRef)) return NextResponse.json({ error: 'Invalid order reference.' }, { status: 400 });
  let identity; try { identity = await verifyGoogleIdentity(body.idToken || ''); } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : 'Authentication failed.' }, { status: 401 }); }
  try {
    const db = getAdminDb(); const orderRef = db.collection('wycut_orders').doc(body.txRef); const snap = await orderRef.get();
    if (!snap.exists || snap.data()?.userId !== identity.userId) return NextResponse.json({ error: 'Order not found for this account.' }, { status: 404 });
    const order = snap.data()!; const wallet = await db.collection('wycut_users').doc(identity.userId).get(); const status = String(order.status || 'pending');
    return NextResponse.json({ status, txRef: body.txRef, creditsPurchased: Number(order.creditsGranted || 0), credits: walletCredits(wallet.data()).credits, message: status === 'credited' ? 'WyBuild verified the Flutterwave payment. Your credits are available.' : status === 'provider_rejected' ? 'Flutterwave rejected this payment. No credits were added.' : status === 'provider_error' ? 'The payment could not be started before a charge was confirmed. Review the error before starting a new payment.' : status === 'unknown_provider_result' ? 'Flutterwave returned an ambiguous result. Do not submit another charge yet; wait for WyBuild webhook verification or contact support with this order reference.' : 'Waiting for WyBuild to verify the Flutterwave v4 transaction and confirm it to WyCut. This check does not grant credits.' }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not check order status.' }, { status: 502, headers: { 'Cache-Control': 'no-store' } }); }
}
