import { createHash } from 'node:crypto';
import { getAdminDb } from '@/lib/firebase-admin';
import { priceProduct } from '@/lib/billing/pricing';
import { walletCredits } from '@/lib/billing/credits';

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
  const storedTotal = roundedAmount(order.totalAmount);
  const storedBase = roundedAmount(order.baseAmount);
  const storedFee = roundedAmount(order.gatewayFee);
  const storedCredits = Number(order.credits ?? price?.credits); // orders made before credit packs stored `recaps`; legacy products map to a fixed credit amount
  if (!price || order.currency !== 'NGN' || !Number.isFinite(storedTotal) || !Number.isFinite(storedBase) || !Number.isFinite(storedFee) || storedBase + storedFee !== storedTotal || !Number.isInteger(storedCredits) || storedCredits < 1) {
    throw new Error('Stored order pricing is invalid.');
  }
  if (roundedAmount(tx.amount) !== storedTotal || String(tx.currency || '').toUpperCase() !== 'NGN') {
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
    if (paymentSnap.exists) {
      const payment = paymentSnap.data() || {};
      if (latestOrderSnap.exists && String(latestOrderSnap.data()?.status || '') !== 'credited') transaction.set(orderRef, { status: 'credited', paymentId, providerTransactionId: String(tx.id), creditsGranted: Number(payment.creditsGranted || storedCredits), creditedAt: payment.verifiedAt || new Date().toISOString(), verifiedAmount: storedTotal, verifiedCurrency: 'NGN' }, { merge: true });
      if (userSnap.data()?.activePaymentRef === tx.tx_ref) transaction.set(userRef, { activePaymentRef: null, updatedAt: new Date().toISOString() }, { merge: true });
      return { duplicate: true, creditsGranted: 0, balance: walletCredits(userSnap.data()).credits };
    }
    if (!latestOrderSnap.exists) throw new Error('Order disappeared during settlement.');
    const latestOrder = latestOrderSnap.data()!;
    if (latestOrder.userId !== order.userId || latestOrder.productId !== order.productId) throw new Error('Order ownership or product changed during settlement.');
    if (['credited', 'successful'].includes(String(latestOrder.status)) && latestOrder.paymentId) {
      return { duplicate: true, creditsGranted: 0, balance: walletCredits(userSnap.data()).credits };
    }
    const currentWallet = walletCredits(userSnap.data());
    const nextBalance = currentWallet.credits + storedCredits;
    if (currentWallet.legacyRecaps > 0) {
      transaction.create(db.collection('wycut_credit_ledger').doc(`migration_${order.userId}_${paymentId.slice(0, 12)}`), { userId: order.userId, kind: 'migration', delta: currentWallet.credits - Math.max(0, Number(userSnap.data()?.creditsBalance || 0)), status: 'posted', note: 'Legacy recap credits converted during a purchase', createdAt: new Date().toISOString(), createdAtMs: Date.now() });
    }
    transaction.create(db.collection('wycut_credit_ledger').doc(`purchase_${paymentId}`), { userId: order.userId, kind: 'purchase', delta: storedCredits, status: 'posted', ref: String(tx.tx_ref), productId: order.productId, providerTransactionId: String(tx.id), createdAt: new Date().toISOString(), createdAtMs: Date.now(), balanceAfter: nextBalance });
    transaction.create(paymentRef, {
      provider: 'flutterwave_v4', providerTransactionId: String(tx.id), txRef: tx.tx_ref,
      userId: order.userId, productId: order.productId, baseAmount: storedBase,
      gatewayFee: storedFee, totalCharged: storedTotal, currency: 'NGN',
      customerEmail: tx.customer?.email || order.customerEmail, status: 'successful',
      verifiedAt: new Date().toISOString(), creditStatus: 'credited', creditsGranted: storedCredits,
    });
    transaction.set(userRef, {
      userId: order.userId, email: order.customerEmail, displayName: order.customerName || null,
      creditsBalance: nextBalance, recapsAvailable: 0, totalCreditsPurchased: Number(userSnap.data()?.totalCreditsPurchased || 0) + storedCredits,
      activePaymentRef: userSnap.data()?.activePaymentRef === tx.tx_ref ? null : (userSnap.data()?.activePaymentRef || null),
      updatedAt: new Date().toISOString(), createdAt: userSnap.data()?.createdAt || new Date().toISOString(),
    }, { merge: true });
    transaction.set(orderRef, {
      status: 'credited', providerTransactionId: String(tx.id), paymentId,
      creditsGranted: storedCredits, creditedAt: new Date().toISOString(),
      verifiedAmount: storedTotal, verifiedCurrency: 'NGN',
    }, { merge: true });
    return { duplicate: false, creditsGranted: storedCredits, balance: nextBalance };
  });
}
