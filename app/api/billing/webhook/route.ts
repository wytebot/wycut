import { createHmac, timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { settleVerifiedTransaction, type VerifiedFlutterwaveTransaction } from '@/lib/billing/settlement';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type EventPayload = { event?: string; type?: string; data?: { id?: string | number; tx_ref?: string; status?: string; amount?: number | string; currency?: string; customer?: { email?: string }; meta?: Record<string, unknown> } };
function equalSecret(actual: string, expected: string) { const a = Buffer.from(actual); const b = Buffer.from(expected); return a.length === b.length && timingSafeEqual(a, b); }
export async function POST(req: NextRequest) {
  const secretHash = process.env.FLW_WEBHOOK_SECRET_HASH;
  const rawBody = await req.text();
  if (!secretHash) return NextResponse.json({ error: 'Webhook secret is not configured.' }, { status: 503 });
  const legacyHash = req.headers.get('verif-hash') || '';
  const signature = req.headers.get('flutterwave-signature') || '';
  const expectedHmac = createHmac('sha256', secretHash).update(rawBody).digest('hex');
  const valid = (legacyHash && equalSecret(legacyHash, secretHash)) || (signature && equalSecret(signature, expectedHmac));
  if (!valid) return NextResponse.json({ error: 'Invalid webhook signature.' }, { status: 401 });
  let event: EventPayload;
  try { event = JSON.parse(rawBody) as EventPayload; } catch { return NextResponse.json({ error: 'Invalid event JSON.' }, { status: 400 }); }
  const data = event.data;
  if (!data?.id || !data.tx_ref) return NextResponse.json({ error: 'Webhook is missing transaction ID or reference.' }, { status: 400 });
  const template = process.env.FLW_V4_VERIFY_URL_TEMPLATE;
  const secretKey = process.env.FLW_SECRET_KEY;
  if (!template || !secretKey) return NextResponse.json({ error: 'Server-side transaction verification is not configured.' }, { status: 503 });
  const verifyUrl = template.replaceAll('{id}', encodeURIComponent(String(data.id))).replaceAll('{tx_ref}', encodeURIComponent(data.tx_ref));
  if (!verifyUrl.startsWith('https://')) return NextResponse.json({ error: 'Verification URL must use HTTPS.' }, { status: 500 });
  try {
    const response = await fetch(verifyUrl, { headers: { Authorization: `Bearer ${secretKey}`, Accept: 'application/json' }, cache: 'no-store', signal: AbortSignal.timeout(20000) });
    const result = await response.json().catch(() => ({})) as { status?: string; message?: string; data?: VerifiedFlutterwaveTransaction };
    if (!response.ok || !result.data) return NextResponse.json({ error: 'Could not verify transaction with Flutterwave.' }, { status: 502 });
    const tx = result.data;
    if (String(tx.id) !== String(data.id) || tx.tx_ref !== data.tx_ref) return NextResponse.json({ error: 'Verified transaction does not match webhook event.' }, { status: 400 });
    const settlement = await settleVerifiedTransaction(tx);
    return NextResponse.json({ received: true, duplicate: settlement.duplicate, creditsGranted: settlement.creditsGranted });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Webhook processing failed.' }, { status: 400 });
  }
}
