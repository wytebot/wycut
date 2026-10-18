import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import type { DocumentReference } from 'firebase-admin/firestore';
import { enforceRateLimit } from '@/lib/server/rate-limit';
import { isAllowedApiOrigin } from '@/lib/server/origin';
import { getAdminDb } from '@/lib/firebase-admin';
import { verifyGoogleIdentity } from '@/lib/billing/google-identity';
import { priceProduct } from '@/lib/billing/pricing';
import { hasLifetimeFreeAccess } from '@/lib/billing/entitlements';
import { getFlutterwaveV4AccessToken, flutterwaveV4BaseUrl } from '@/lib/billing/flutterwave-v4';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type EncryptedCard = { nonce?: string; encrypted_card_number?: string; encrypted_expiry_month?: string; encrypted_expiry_year?: string; encrypted_cvv?: string };
type Input = { productId?: string; idToken?: string; card?: EncryptedCard; customer?: { name?: string; phonenumber?: string } };
type ProviderResponse = { status?: string; message?: string; data?: { id?: string | number; status?: string; reference?: string; auth_model?: string; next_action?: { type?: string; requires_pin?: boolean; requires_otp?: boolean; redirect_url?: string | { url?: string }; [key: string]: unknown }; redirect_url?: string; customer_id?: string; payment_method_id?: string; [key: string]: unknown } };
const noStore = { 'Cache-Control': 'no-store' };
function error(message: string, status = 400) { return NextResponse.json({ error: message }, { status, headers: noStore }); }
async function updateOrderPreservingCredit(orderRef: DocumentReference, patch: Record<string, unknown>) {
  const db = getAdminDb();
  await db.runTransaction(async transaction => {
    const snap = await transaction.get(orderRef); const current = snap.data() || {}; const existingStatus = String(current.status || '');
    const finalStatus = ['credited', 'provider_rejected'].includes(existingStatus) ? existingStatus : String(patch.status || existingStatus);
    const userId = String(current.userId || ''); const userRef = userId ? db.collection('wycut_users').doc(userId) : null;
    const userSnap = userRef ? await transaction.get(userRef) : null;
    transaction.set(orderRef, { ...patch, status: finalStatus }, { merge: true });
    if (userRef && userSnap?.data()?.activePaymentRef === orderRef.id && ['credited', 'provider_rejected', 'provider_error'].includes(finalStatus)) transaction.set(userRef, { activePaymentRef: null, updatedAt: new Date().toISOString() }, { merge: true });
  });
}
async function providerRequest<T>(base: string, token: string, path: string, body?: unknown, idempotencyKey?: string): Promise<{ response: Response; result: T }> {
  const response = await fetch(`${base.replace(/\/$/, '')}${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json', 'X-Trace-Id': randomUUID(), ...(idempotencyKey ? { 'X-Idempotency-Key': idempotencyKey } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), cache: 'no-store', signal: AbortSignal.timeout(25000) });
  const result = await response.json().catch(() => ({})) as T;
  return { response, result };
}
export async function POST(request: NextRequest) {
  const limit = enforceRateLimit(request, 'billing-charge', 5, 10 * 60 * 1000);
  if (!limit.allowed) return NextResponse.json({ error: 'Too many payment attempts. Wait before retrying.' }, { status: 429, headers: { ...noStore, 'Retry-After': String(limit.retryAfterSeconds) } });
  if (!isAllowedApiOrigin(request)) return error('Cross-origin request rejected. Configure CAPACITOR_ALLOWED_ORIGINS for the installed app.', 403);
  let input: Input; try { input = await request.json() as Input; } catch { return error('Invalid JSON body.'); }
  let identity;
  try { identity = await verifyGoogleIdentity(input.idToken || ''); if (identity.email.endsWith('@phone.wycut.invalid')) return error('Add a verified email address before purchasing recap credits.', 400); }
  catch (e) { return error(e instanceof Error ? e.message : 'Authentication failed.', 401); }
  if (hasLifetimeFreeAccess(identity.email)) return NextResponse.json({ freeAccess: true, plan: 'lifetime_free', message: 'Lifetime free access is active. No payment is required.' }, { headers: noStore });
  const price = priceProduct(input.productId || ''); if (!price) return error('Unknown product.');
  const card = input.card || {};
  if (!/^[A-Za-z0-9]{12}$/.test(String(card.nonce || '')) || !card.encrypted_card_number || !card.encrypted_expiry_month || !card.encrypted_expiry_year || !card.encrypted_cvv || [card.encrypted_card_number, card.encrypted_expiry_month, card.encrypted_expiry_year, card.encrypted_cvv].some(v => typeof v !== 'string' || v.length > 4096)) return error('Missing or invalid encrypted card fields. Card details must be encrypted in the browser before submission.');
  let accessToken: string; let baseUrl: string; let db;
  try { accessToken = await getFlutterwaveV4AccessToken(); baseUrl = flutterwaveV4BaseUrl(); db = getAdminDb(); }
  catch { return error('Flutterwave v4 credentials or secure payment storage are not configured.', 503); }
  const txRef = `wycut_${randomUUID()}`; const orderRef = db.collection('wycut_orders').doc(txRef);
  const customerName = (input.customer?.name || identity.name || '').slice(0, 120);
  const order = { txRef, productId: price.id, userId: identity.userId, customerEmail: identity.email, customerName, baseAmount: price.baseNgn, gatewayFee: price.feeNgn, totalAmount: price.totalNgn, currency: 'NGN', recaps: price.recaps, status: 'creating', createdAt: new Date().toISOString(), provider: 'flutterwave_v4' };
  try {
    const userRef = db.collection('wycut_users').doc(identity.userId);
    await db.runTransaction(async transaction => {
      const userSnap = await transaction.get(userRef); const activeRef = String(userSnap.data()?.activePaymentRef || '');
      if (activeRef) {
        const activeOrderRef = db.collection('wycut_orders').doc(activeRef); const activeOrder = await transaction.get(activeOrderRef);
        if (activeOrder.exists) {
          const active = activeOrder.data() || {}; const activeStatus = String(active.status || ''); const createdAt = Date.parse(String(active.createdAt || ''));
          const stalePreCharge = activeStatus === 'creating' && Number.isFinite(createdAt) && Date.now() - createdAt > 10 * 60 * 1000;
          const terminal = ['credited', 'provider_rejected', 'provider_error'].includes(activeStatus);
          if (!terminal && !stalePreCharge) throw new Error(`ACTIVE_PAYMENT_PENDING:${activeRef}:${activeStatus || 'pending'}`);
        }
      }
      transaction.create(orderRef, order);
      transaction.set(userRef, { activePaymentRef: txRef, updatedAt: new Date().toISOString() }, { merge: true });
    });
  } catch (e) {
    const active = e instanceof Error ? /^ACTIVE_PAYMENT_PENDING:([^:]+):(.+)$/.exec(e.message) : null;
    if (active) return NextResponse.json({ error: 'A previous payment is still unresolved. Check its status before submitting another charge.', txRef: active[1], status: active[2] }, { status: 409, headers: noStore });
    return error('Could not create a secure order. No charge was submitted.', 503);
  }
  try {
    const userRef = db.collection('wycut_users').doc(identity.userId); const userSnap = await userRef.get();
    let customerId = String(userSnap.data()?.flwCustomerId || '');
    if (!customerId) {
      const customerResult = await providerRequest<ProviderResponse>(baseUrl, accessToken, '/customers', { email: identity.email, name: { first: customerName.split(/\s+/)[0] || identity.email.split('@')[0], last: customerName.split(/\s+/).slice(1).join(' ') || undefined }, meta: { wycut_user_id: identity.userId } }, `wycut-customer-${identity.userId}`);
      if (!customerResult.response.ok || !customerResult.result.data?.id) throw new Error(customerResult.result.message || 'Flutterwave did not create a customer.');
      customerId = String(customerResult.result.data.id); await userRef.set({ flwCustomerId: customerId, updatedAt: new Date().toISOString() }, { merge: true });
    }
    const methodResult = await providerRequest<ProviderResponse>(baseUrl, accessToken, '/payment-methods', { type: 'card', card: { nonce: card.nonce, encrypted_card_number: card.encrypted_card_number, encrypted_expiry_month: card.encrypted_expiry_month, encrypted_expiry_year: card.encrypted_expiry_year, encrypted_cvv: card.encrypted_cvv } }, `wycut-method-${txRef}`);
    if (!methodResult.response.ok || !methodResult.result.data?.id) throw new Error(methodResult.result.message || 'Flutterwave did not create a card payment method.');
    const paymentMethodId = String(methodResult.result.data.id);
    await orderRef.set({ status: 'creating_charge', providerCustomerId: customerId, providerPaymentMethodId: paymentMethodId, updatedAt: new Date().toISOString() }, { merge: true });
    let chargeResult: { response: Response; result: ProviderResponse };
    try {
      chargeResult = await providerRequest<ProviderResponse>(baseUrl, accessToken, '/charges', { reference: txRef, amount: price.totalNgn, currency: 'NGN', customer_id: customerId, payment_method_id: paymentMethodId, redirect_url: new URL(`/billing?payment_return=1&txRef=${encodeURIComponent(txRef)}`, request.url).toString(), meta: { app: 'WyCut', order_id: txRef, product_id: price.id, base_amount: price.baseNgn, gateway_fee: price.feeNgn, fee_rate: 0.02, fx_rate_usd_ngn: 1400, recap_credits: price.recaps } }, `wycut-charge-${txRef}`);
    } catch {
      await updateOrderPreservingCredit(orderRef, { status: 'unknown_provider_result', providerMessage: 'Charge request timed out; do not retry until the order status/webhook is checked.', updatedAt: new Date().toISOString() });
      return NextResponse.json({ error: 'Flutterwave did not return a confirmed charge response. Do not retry this payment yet; check status while WyBuild verifies any successful charge.', txRef, status: 'unknown_provider_result' }, { status: 502, headers: noStore });
    }
    const data = chargeResult.result.data || {};
    if (!chargeResult.response.ok || !data.id) {
      const unknown = chargeResult.response.status >= 500 || chargeResult.response.ok;
      await updateOrderPreservingCredit(orderRef, { status: unknown ? 'unknown_provider_result' : 'provider_rejected', providerHttpStatus: chargeResult.response.status, providerMessage: chargeResult.result.message || (unknown ? 'Provider response is ambiguous; verify before retrying.' : 'Provider rejected the charge.'), updatedAt: new Date().toISOString() });
      return NextResponse.json({ error: unknown ? 'Flutterwave returned an ambiguous result. Do not retry until payment status is checked.' : (chargeResult.result.message || 'Flutterwave rejected the charge. No recap credits were added.'), txRef, status: unknown ? 'unknown_provider_result' : 'provider_rejected' }, { status: 502, headers: noStore });
    }
    const status = String(data.status || chargeResult.result.status || 'pending').toLowerCase(); const nextAction = `${data.next_action?.type || ''} ${data.auth_model || ''} ${data.status || ''} ${data.next_action?.requires_pin ? 'requires_pin' : ''} ${data.next_action?.requires_otp ? 'requires_otp' : ''}`.toLowerCase(); const needsPin = /pin/.test(nextAction); const needsOtp = /otp/.test(nextAction); const rawRedirect = data.next_action?.redirect_url; const redirectUrl = typeof rawRedirect === 'string' ? rawRedirect : rawRedirect && typeof rawRedirect === 'object' ? rawRedirect.url : data.redirect_url;
    await updateOrderPreservingCredit(orderRef, { status: needsPin || needsOtp ? 'requires_auth' : status, providerChargeId: String(data.id), providerReference: data.reference || txRef, providerStatus: status, providerAuthModel: data.next_action?.type || null, updatedAt: new Date().toISOString() });
    return NextResponse.json({ txRef, providerChargeId: String(data.id), baseAmount: price.baseNgn, gatewayFee: price.feeNgn, totalCharged: price.totalNgn, currency: 'NGN', recaps: price.recaps, feeMessage: `Includes the disclosed 2% gateway fee (${price.feeNgn} NGN).`, status: needsPin ? 'REQUIRES_PIN' : needsOtp ? 'REQUIRES_OTP' : status.toUpperCase(), providerMessage: chargeResult.result.message || null, redirectUrl: redirectUrl || null }, { headers: noStore });
  } catch (e) {
    await updateOrderPreservingCredit(orderRef, { status: 'provider_error', providerMessage: e instanceof Error ? e.message.slice(0, 500) : 'Provider request failed.', updatedAt: new Date().toISOString() }).catch(() => undefined);
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not start Flutterwave payment.', txRef, status: 'provider_error' }, { status: 502, headers: noStore });
  }
}
