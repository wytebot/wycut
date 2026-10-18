import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import { verifyGoogleIdentity } from '@/lib/billing/google-identity';
import { settleVerifiedTransaction, type VerifiedFlutterwaveTransaction } from '@/lib/billing/settlement';
import { isAllowedApiOrigin } from '@/lib/server/origin';
import { enforceRateLimit } from '@/lib/server/rate-limit';
import { getFlutterwaveV4AccessToken, flutterwaveV4BaseUrl } from '@/lib/billing/flutterwave-v4';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(req: NextRequest) {
  const limit = enforceRateLimit(req, 'billing-status', 12, 10 * 60 * 1000);
  if (!limit.allowed) return NextResponse.json({ error: 'Too many status checks.' }, { status: 429 });
  if (!isAllowedApiOrigin(req)) return NextResponse.json({ error: 'Cross-origin request rejected.' }, { status: 403 });
  let body: { txRef?: string; idToken?: string };
  try { body = await req.json() as typeof body; } catch { return NextResponse.json({ error: 'Invalid request.' }, { status: 400 }); }
  if (!body.txRef || body.txRef.length > 140) return NextResponse.json({ error: 'Invalid order reference.' }, { status: 400 });
  let identity;
  try { identity = await verifyGoogleIdentity(body.idToken || ''); } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : 'Authentication failed.' }, { status: 401 }); }
  try {
    const db = getAdminDb(); const ref = db.collection('wycut_orders').doc(body.txRef); const snap = await ref.get();
    if (!snap.exists || snap.data()?.userId !== identity.userId) return NextResponse.json({ error: 'Order not found for this account.' }, { status: 404 });
    let order = snap.data()!;
    if (order.status !== 'credited') {
      const chargeId = String(order.providerChargeId || order.providerTransactionId || '');
      if (chargeId) {
        try {
          const token = await getFlutterwaveV4AccessToken();
          const url = `${flutterwaveV4BaseUrl()}${(process.env.FLW_V4_CHARGES_PATH || '/charges').replace(/\/$/, '')}/${encodeURIComponent(chargeId)}`;
          const response = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }, cache: 'no-store', signal: AbortSignal.timeout(18000) });
          const verified = await response.json().catch(() => ({})) as { data?: VerifiedFlutterwaveTransaction };
          if (response.ok && verified.data && String(verified.data.tx_ref || verified.data.reference) === body.txRef && ['successful', 'succeeded'].includes(String(verified.data.status).toLowerCase())) {
            await settleVerifiedTransaction({ ...verified.data, tx_ref: body.txRef, status: 'successful' });
            const refreshed = await ref.get(); order = refreshed.data()!;
          }
        } catch { /* Keep order pending; the authenticated WyBuild webhook can still settle it. */ }
      }
    }
    const wallet = await db.collection('wycut_users').doc(identity.userId).get();
    return NextResponse.json({ status: order.status, txRef: body.txRef, recapsPurchased: Number(order.creditsGranted || 0), recapsAvailable: Number(wallet.data()?.recapsAvailable || 0), message: order.status === 'credited' ? 'Payment verified. Recap credits added.' : 'Payment is still being verified. This page will not add credits until Flutterwave confirms settlement.' }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not check order status.' }, { status: 502 }); }
}
