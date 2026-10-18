import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { enforceRateLimit } from '@/lib/server/rate-limit';
import { isAllowedApiOrigin } from '@/lib/server/origin';
import { getAdminDb } from '@/lib/firebase-admin';
import { verifyGoogleIdentity } from '@/lib/billing/google-identity';
import { priceProduct } from '@/lib/billing/pricing';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Input = { productId?: string; idToken?: string; encryptedCard?: string; customer?: { name?: string; phonenumber?: string } };
type ProviderResponse = { status?: string; message?: string; data?: { id?: string | number; status?: string; tx_ref?: string; flw_ref?: string; auth_model?: string; charge_response_code?: string; next_action?: { type?: string; [key: string]: unknown }; [key: string]: unknown } };
const noStore = { 'Cache-Control': 'no-store' };
function error(message: string, status = 400) { return NextResponse.json({ error: message }, { status, headers: noStore }); }
export async function POST(request: NextRequest) {
  const limit = enforceRateLimit(request, 'billing-charge', 5, 10 * 60 * 1000);
  if (!limit.allowed) return NextResponse.json({ error: 'Too many payment attempts. Wait before retrying.' }, { status: 429, headers: { ...noStore, 'Retry-After': String(limit.retryAfterSeconds) } });
  if (!isAllowedApiOrigin(request)) return error('Cross-origin request rejected. Configure CAPACITOR_ALLOWED_ORIGINS for the installed app.', 403);
  const secret = process.env.FLW_SECRET_KEY;
  const baseUrl = process.env.FLW_V4_API_BASE;
  if (!secret || !baseUrl) return error('Flutterwave v4 billing is not configured.', 503);
  let input: Input;
  try { input = await request.json() as Input; } catch { return error('Invalid JSON body.'); }
  const price = priceProduct(input.productId || '');
  if (!price) return error('Unknown product.');
  if (!input.encryptedCard || input.encryptedCard.length > 20000) return error('Missing encrypted card payload. Card data must be encrypted in the browser before submission.');
  let identity;
  try {
    identity = await verifyGoogleIdentity(input.idToken || '');
    if (identity.email.endsWith('@phone.wycut.invalid')) return error('This phone-only account needs an email address for checkout. Sign in with an email or Google account to purchase credits.', 400);
  } catch (e) { return error(e instanceof Error ? e.message : 'Authentication failed.', 401); }
  let db;
  try { db = getAdminDb(); } catch { return error('Secure payment storage is not configured. Contact the app owner.', 503); }
  const chargesPath = process.env.FLW_V4_CHARGES_PATH || '/charges';
  const cardField = process.env.FLW_V4_CARD_FIELD || 'card';
  if (!chargesPath.startsWith('/') || chargesPath.startsWith('//') || !['card', 'card_encrypted'].includes(cardField)) return error('Invalid Flutterwave v4 charge path/card field configuration.', 500);
  const txRef = `wycut_${randomUUID()}`;
  const orderRef = db.collection('wycut_orders').doc(txRef);
  const order = { txRef, productId: price.id, userId: identity.userId, customerEmail: identity.email, customerName: (input.customer?.name || identity.name || '').slice(0, 120), baseAmount: price.baseNgn, gatewayFee: price.feeNgn, totalAmount: price.totalNgn, currency: 'NGN', recaps: price.recaps, status: 'creating', createdAt: new Date().toISOString(), provider: 'flutterwave_v4' };
  try { await orderRef.create(order); } catch { return error('Could not create a secure order. No charge was submitted.', 503); }
  const payload = {
    tx_ref: txRef,
    amount: String(price.totalNgn),
    currency: 'NGN',
    customer: { email: identity.email, name: order.customerName, phonenumber: (input.customer?.phonenumber || '').slice(0, 40) },
    [cardField]: input.encryptedCard,
    meta: { app: 'WyCut', order_id: txRef, product_id: price.id, base_amount: price.baseNgn, gateway_fee: price.feeNgn, fee_rate: 0.02, fx_rate_usd_ngn: 1400, recap_credits: price.recaps },
  };
  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, '')}${chargesPath}`, { method: 'POST', headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(payload), cache: 'no-store', signal: AbortSignal.timeout(25000) });
    const result = await response.json().catch(() => ({})) as ProviderResponse;
    if (!response.ok) {
      await orderRef.set({ status: 'provider_rejected', providerHttpStatus: response.status, providerMessage: result.message || 'Provider rejected the charge.', updatedAt: new Date().toISOString() }, { merge: true });
      return error(result.message || 'Flutterwave rejected the charge. No recap credits were added.', 502);
    }
    const data = result.data || {};
    const statusText = `${data.status || result.status || ''} ${data.auth_model || ''} ${data.next_action?.type || ''}`.toLowerCase();
    const authRequired = /otp|pin|authorize|authentication/.test(statusText);
    await orderRef.set({ status: authRequired ? 'requires_auth' : String(data.status || result.status || 'pending').toLowerCase(), providerChargeId: data.id == null ? null : String(data.id), providerReference: data.flw_ref || null, providerStatus: data.status || result.status || 'pending', providerAuthModel: data.auth_model || data.next_action?.type || null, updatedAt: new Date().toISOString() }, { merge: true });
    return NextResponse.json({ txRef, providerChargeId: data.id == null ? null : String(data.id), baseAmount: price.baseNgn, gatewayFee: price.feeNgn, totalCharged: price.totalNgn, currency: 'NGN', recaps: price.recaps, feeMessage: `Includes the disclosed 2% gateway fee (${price.feeNgn} NGN).`, status: authRequired ? (statusText.includes('pin') ? 'REQUIRES_PIN' : 'REQUIRES_OTP') : String(data.status || result.status || 'PENDING').toUpperCase(), providerMessage: result.message || null }, { headers: noStore });
  } catch {
    await orderRef.set({ status: 'unknown_provider_result', updatedAt: new Date().toISOString() }, { merge: true }).catch(() => undefined);
    return NextResponse.json({ error: 'The provider response could not be confirmed. Check the transaction status before retrying to avoid duplicate charges.', txRef }, { status: 502, headers: noStore });
  }
}
