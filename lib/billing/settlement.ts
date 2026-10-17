import { createHash } from 'node:crypto';
import { getAdminDb } from '@/lib/firebase-admin';
import { priceProduct } from '@/lib/billing/pricing';

export type VerifiedFlutterwaveTransaction = {
  id?: string | number;
  tx_ref?: string;
  status?: string;
  amount?: number | string;
  currency?: string;
  customer?: { email?: string };
  meta?: Record<string, unknown>;
};
function roundedAmount(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : NaN;
}

/** Only call with transaction data freshly retrieved from Flutterwave's verification API. */
export async function settleVerifiedTransaction(tx: VerifiedFlutterwaveTransaction) {
  if (tx.id == null || !tx.tx_ref || String(tx.status || '').toLowerCase() !== 'successful') {
    throw new Error('Flutterwave has not verified this transaction as successful.');
  }
  const db = getAdminDb();
  const orderRef = db.collection('wycut_orders').doc(tx.tx_ref);
  const orderSnap = await orderRef.get();
  if (!orderSnap.exists) throw new Error('No matching WyCut order exists for this transaction.');
  const order = orderSnap.data()!;
  const price = priceProduct(String(order.productId || ''));
  if (!price || order.currency !== 'NGN' || Number(order.totalAmount) !== price.totalNgn || Number(order.baseAmount) !== price.baseNgn || Number(order.gatewayFee) !== price.feeNgn) {
    throw new Error('Stored order pricing does not match the current price book.');
  }
  if (roundedAmount(tx.amount) !== price.totalNgn || String(tx.currency || '').toUpperCase() !== 'NGN') {
    throw new Error('Verified transaction amount or currency does not match this order.');
  }
  if (order.providerChargeId && String(tx.id) !== String(order.providerChargeId)) {
    throw new Error('Verified provider transaction ID does not match the order.');
  }
  if (tx.customer?.email && String(tx.customer.email).toLowerCase() !== String(order.customerEmail).toLowerCase()) {
    throw new Error('Verified customer email does not match the order.');
  }
  const paymentId = createHash('sha256').update(String(tx.id)).digest('hex');
  const paymentRef = db.collection('wycut_payments').doc(paymentId);
  const userRef = db.collection('wycut_users').doc(String(order.userId));
  return db.runTransaction(async transaction => {
    const [paymentSnap, latestOrderSnap, userSnap] = await Promise.all([
      transaction.get(paymentRef), transaction.get(orderRef), transaction.get(userRef),
    ]);
    if (paymentSnap.exists) return { duplicate: true, creditsGranted: 0, balance: Number(userSnap.data()?.recapsAvailable || 0) };
    if (!latestOrderSnap.exists) throw new Error('Order disappeared during settlement.');
    const latestOrder = latestOrderSnap.data()!;
    if (latestOrder.userId !== order.userId || latestOrder.productId !== price.id) throw new Error('Order ownership or product changed during settlement.');
    if (['credited', 'successful'].includes(String(latestOrder.status)) && latestOrder.paymentId) {
      return { duplicate: true, creditsGranted: 0, balance: Number(userSnap.data()?.recapsAvailable || 0) };
    }
    const currentBalance = Number(userSnap.data()?.recapsAvailable || 0);
    const nextBalance = currentBalance + price.recaps;
    transaction.create(paymentRef, {
      provider: 'flutterwave_v4', providerTransactionId: String(tx.id), txRef: tx.tx_ref,
      userId: order.userId, productId: price.id, baseAmount: price.baseNgn,
      gatewayFee: price.feeNgn, totalCharged: price.totalNgn, currency: 'NGN',
      customerEmail: tx.customer?.email || order.customerEmail, status: 'successful',
      verifiedAt: new Date().toISOString(), creditStatus: 'credited', creditsGranted: price.recaps,
    });
    transaction.set(userRef, {
      userId: order.userId, email: order.customerEmail, displayName: order.customerName || null,
      recapsAvailable: nextBalance, totalRecapsPurchased: Number(userSnap.data()?.totalRecapsPurchased || 0) + price.recaps,
      updatedAt: new Date().toISOString(), createdAt: userSnap.data()?.createdAt || new Date().toISOString(),
    }, { merge: true });
    transaction.set(orderRef, {
      status: 'credited', providerTransactionId: String(tx.id), paymentId,
      creditsGranted: price.recaps, creditedAt: new Date().toISOString(),
      verifiedAmount: price.totalNgn, verifiedCurrency: 'NGN',
    }, { merge: true });
    return { duplicate: false, creditsGranted: price.recaps, balance: nextBalance };
  });
}
