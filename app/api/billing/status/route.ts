import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import { verifyGoogleIdentity } from '@/lib/billing/google-identity';
import { settleVerifiedTransaction, type VerifiedFlutterwaveTransaction } from '@/lib/billing/settlement';
import { isAllowedApiOrigin } from '@/lib/server/origin';
import { enforceRateLimit } from '@/lib/server/rate-limit';
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
      const template = process.env.FLW_V4_VERIFY_URL_TEMPLATE; const secret = process.env.FLW_SECRET_KEY;
      const canVerify = Boolean(template && secret && (order.providerChargeId || template.includes('{tx_ref}')));
      if (template && secret && canVerify) {
        const url = template.replaceAll('{id}', encodeURIComponent(String(order.providerTransactionId || order.providerChargeId || ''))).replaceAll('{tx_ref}', encodeURIComponent(body.txRef));
        if (!url.startsWith('https://')) return NextResponse.json({ error: 'Invalid verification URL.' }, { status: 500 });
        const response = await fetch(url, { headers: { Authorization: `Bearer ${secret}`, Accept: 'application/json' }, cache: 'no-store', signal: AbortSignal.timeout(18000) });
        const verified = await response.json().catch(() => ({})) as { data?: VerifiedFlutterwaveTransaction };
        if (response.ok && verified.data && String(verified.data.tx_ref) === body.txRef && String(verified.data.status).toLowerCase() === 'successful') {
          await settleVerifiedTransaction(verified.data);
          const refreshed = await ref.get(); order = refreshed.data()!;
        }
      }
    }
    const wallet = await db.collection('wycut_users').doc(identity.userId).get();
    return NextResponse.json({ status: order.status, txRef: body.txRef, recapsPurchased: Number(order.creditsGranted || 0), recapsAvailable: Number(wallet.data()?.recapsAvailable || 0), message: order.status === 'credited' ? 'Payment verified. Recap credits added.' : 'Payment is still being verified. This page will not add credits until Flutterwave confirms settlement.' }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not check order status.' }, { status: 502 }); }
}
