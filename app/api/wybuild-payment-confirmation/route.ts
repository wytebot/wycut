import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { settleVerifiedTransaction } from '@/lib/billing/settlement';
import { getAdminDb } from '@/lib/firebase-admin';
import { priceProduct } from '@/lib/billing/pricing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const noStore = { 'Cache-Control': 'no-store' };
function constantTimeEqual(a: string, b: string) {
  const aa = Buffer.from(a); const bb = Buffer.from(b);
  return aa.length > 0 && aa.length === bb.length && timingSafeEqual(aa, bb);
}
type ForwardedCharge = {
  source?: string; action?: 'lookup'; id?: string; reference?: string; status?: string;
  amount?: number; currency?: string; customerEmail?: string;
};
export async function POST(req: NextRequest) {
  const expected = process.env.WYBUILD_WEBHOOK_SHARED_SECRET || '';
  const supplied = req.headers.get('x-wybuild-webhook-secret') || '';
  if (!expected) return NextResponse.json({ error: 'WyBuild payment confirmation secret is not configured.' }, { status: 503, headers: noStore });
  if (!constantTimeEqual(supplied, expected)) return NextResponse.json({ error: 'Unauthorized webhook sender.' }, { status: 401, headers: noStore });
  let body: ForwardedCharge;
  try { body = await req.json() as ForwardedCharge; } catch { return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400, headers: noStore }); }
  const reference = String(body.reference || '');
  if (body.source !== 'wybuild-flutterwave-v4' || !/^wycut_[A-Za-z0-9-]{8,100}$/i.test(reference)) {
    return NextResponse.json({ error: 'Invalid WyCut payment confirmation payload.' }, { status: 400, headers: noStore });
  }

  // A reference-only webhook can arrive before WyBuild has the charge ID. This authenticated
  // lookup is read-only; it never verifies or grants payment by itself. WyBuild still fetches
  // the charge from Flutterwave v4 before sending a settlement payload.
  if (body.action === 'lookup') {
    try {
      const order = await getAdminDb().collection('wycut_orders').doc(reference).get();
      if (!order.exists) return NextResponse.json({ error: 'Order not found.' }, { status: 404, headers: noStore });
      const providerChargeId = String(order.data()?.providerChargeId || '');
      if (!providerChargeId) return NextResponse.json({ error: 'Charge ID is not stored yet; retry lookup shortly.' }, { status: 409, headers: noStore });
      return NextResponse.json({ providerChargeId, orderStatus: String(order.data()?.status || 'pending') }, { headers: noStore });
    } catch { return NextResponse.json({ error: 'Could not look up the stored charge ID.' }, { status: 502, headers: noStore }); }
  }

  if (!body.id) return NextResponse.json({ error: 'Verified charge ID is required.' }, { status: 400, headers: noStore });
  const status = String(body.status || '').toLowerCase();
  const amount = Number(body.amount);
  const currency = String(body.currency || '').toUpperCase();
  if (!Number.isFinite(amount) || currency !== 'NGN') return NextResponse.json({ error: 'Invalid verified charge amount or currency.' }, { status: 400, headers: noStore });

  if (['failed', 'cancelled', 'canceled', 'declined', 'expired', 'rejected'].includes(status)) {
    try {
      const db = getAdminDb(); const orderRef = db.collection('wycut_orders').doc(reference);
      await db.runTransaction(async transaction => {
        const orderSnap = await transaction.get(orderRef);
        if (!orderSnap.exists) throw new Error('WyCut order was not found.');
        const order = orderSnap.data() || {}; const userId = String(order.userId || ''); const userRef = userId ? db.collection('wycut_users').doc(userId) : null; const userSnap = userRef ? await transaction.get(userRef) : null; const price = priceProduct(String(order.productId || ''));
        if (!price || order.currency !== 'NGN' || Number(order.totalAmount) !== price.totalNgn || Number(order.baseAmount) !== price.baseNgn || Number(order.gatewayFee) !== price.feeNgn) throw new Error('Stored order pricing does not match the current price book.');
        if (Math.round(amount * 100) / 100 !== price.totalNgn) throw new Error('Verified failed transaction amount does not match the order.');
        if (order.providerChargeId && String(order.providerChargeId) !== String(body.id)) throw new Error('Verified failed transaction ID does not match the order.');
        const email = String(body.customerEmail || '').trim().toLowerCase();
        if (email && order.customerEmail && email !== String(order.customerEmail).toLowerCase()) throw new Error('Verified failed transaction customer does not match the order.');
        if (String(order.status || '') !== 'credited') transaction.set(orderRef, { status: 'provider_rejected', providerStatus: status, providerChargeId: String(body.id), providerReference: reference, providerMessage: `Flutterwave verified terminal status: ${status}`, updatedAt: new Date().toISOString() }, { merge: true });
        if (userRef && userSnap?.data()?.activePaymentRef === reference) transaction.set(userRef, { activePaymentRef: null, updatedAt: new Date().toISOString() }, { merge: true });
      });
      return NextResponse.json({ ok: true, status: 'provider_rejected', creditsGranted: 0 }, { headers: noStore });
    } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not record verified failed payment.' }, { status: 409, headers: noStore }); }
  }

  if (status !== 'succeeded') return NextResponse.json({ error: 'Flutterwave charge is not in a final successful state.' }, { status: 409, headers: noStore });
  try {
    const result = await settleVerifiedTransaction({
      id: String(body.id), tx_ref: reference, status: 'successful', amount, currency,
      customer: body.customerEmail ? { email: body.customerEmail } : undefined,
    });
    return NextResponse.json({ ok: true, ...result }, { headers: noStore });
  } catch (error) {
    // A 5xx encourages WyBuild/Flutterwave retry; no credits are granted unless stored order checks pass.
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Payment settlement failed.' }, { status: 502, headers: noStore });
  }
}
