import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { settleVerifiedTransaction } from '@/lib/billing/settlement';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const noStore = { 'Cache-Control': 'no-store' };
function constantTimeEqual(a: string, b: string) {
  const aa = Buffer.from(a); const bb = Buffer.from(b);
  return aa.length > 0 && aa.length === bb.length && timingSafeEqual(aa, bb);
}
type ForwardedCharge = {
  source?: string; id?: string; reference?: string; status?: string;
  amount?: number; currency?: string; customerEmail?: string;
};
export async function POST(req: NextRequest) {
  const expected = process.env.WYBUILD_WEBHOOK_SHARED_SECRET || '';
  const supplied = req.headers.get('x-wybuild-webhook-secret') || '';
  if (!expected) return NextResponse.json({ error: 'WyBuild payment confirmation secret is not configured.' }, { status: 503, headers: noStore });
  if (!constantTimeEqual(supplied, expected)) return NextResponse.json({ error: 'Unauthorized webhook sender.' }, { status: 401, headers: noStore });
  let body: ForwardedCharge;
  try { body = await req.json() as ForwardedCharge; } catch { return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400, headers: noStore }); }
  if (body.source !== 'wybuild-flutterwave-v4' || !body.id || !/^wycut_[A-Za-z0-9-]{8,100}$/i.test(String(body.reference || ''))) {
    return NextResponse.json({ error: 'Invalid WyCut payment confirmation payload.' }, { status: 400, headers: noStore });
  }
  if (String(body.status || '').toLowerCase() !== 'succeeded') return NextResponse.json({ error: 'Flutterwave charge is not successful.' }, { status: 409, headers: noStore });
  if (!Number.isFinite(Number(body.amount)) || String(body.currency || '').toUpperCase() !== 'NGN') return NextResponse.json({ error: 'Invalid verified charge amount or currency.' }, { status: 400, headers: noStore });
  try {
    const result = await settleVerifiedTransaction({
      id: body.id,
      tx_ref: body.reference,
      status: 'successful',
      amount: body.amount,
      currency: body.currency,
      customer: body.customerEmail ? { email: body.customerEmail } : undefined,
    });
    return NextResponse.json({ received: true, duplicate: result.duplicate, creditsGranted: result.creditsGranted }, { headers: noStore });
  } catch (error) {
    // 5xx encourages WyBuild/Flutterwave retry; no credits are granted unless stored order checks pass.
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Payment settlement failed.' }, { status: 502, headers: noStore });
  }
}
