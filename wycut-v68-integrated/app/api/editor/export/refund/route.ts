import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import { verifyGoogleIdentity } from '@/lib/billing/google-identity';
import { walletCredits } from '@/lib/billing/credits';
import { enforceRateLimit } from '@/lib/server/rate-limit';
import { isAllowedApiOrigin } from '@/lib/server/origin';

const noStore = { 'Cache-Control': 'no-store' };
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Body = { idToken?: string; exportId?: string; reason?: string };

/**
 * Idempotent compensation for an export whose file could not be delivered after settlement.
 * This is not a general client-controlled wallet endpoint: it can refund only the caller's own
 * deterministic editor-export ledger row, once, and only while that row remains consumed.
 */
export async function POST(request: NextRequest) {
  const rate = enforceRateLimit(request, 'editor-export-refund', 8, 60_000);
  if (!rate.allowed) return NextResponse.json({ error: 'Too many refund attempts. Please wait and try again.' }, { status: 429, headers: { ...noStore, 'Retry-After': String(rate.retryAfterSeconds) } });
  if (!isAllowedApiOrigin(request)) return NextResponse.json({ error: 'Request origin rejected.' }, { status: 403, headers: noStore });
  let body: Body;
  try { body = await request.json() as Body; } catch { return NextResponse.json({ error: 'Invalid refund request.' }, { status: 400, headers: noStore }); }
  const exportId = String(body.exportId || '');
  if (!/^[A-Za-z0-9_-]{12,100}$/.test(exportId)) return NextResponse.json({ error: 'Invalid export attempt ID.' }, { status: 400, headers: noStore });
  let identity;
  try { identity = await verifyGoogleIdentity(body.idToken || ''); }
  catch { return NextResponse.json({ error: 'Sign in again before requesting an export refund.' }, { status: 401, headers: noStore }); }

  try {
    const db = getAdminDb();
    const ledgerId = `export_${createHash('sha256').update(`${identity.userId}:${exportId}`).digest('hex').slice(0, 48)}`;
    const ledgerRef = db.collection('wycut_credit_ledger').doc(ledgerId);
    const userRef = db.collection('wycut_users').doc(identity.userId);
    const result = await db.runTransaction(async tx => {
      const [ledgerSnap, userSnap] = await Promise.all([tx.get(ledgerRef), tx.get(userRef)]);
      const row = ledgerSnap.data();
      if (!ledgerSnap.exists || !row || row.userId !== identity.userId || row.kind !== 'editor_export' || row.ref !== exportId) {
        throw new Error('EXPORT_CHARGE_NOT_FOUND');
      }
      if (row.status === 'refunded') return { refunded: false, alreadyRefunded: true, credits: walletCredits(userSnap.data()).credits };
      if (row.status !== 'consumed') throw new Error('EXPORT_CHARGE_NOT_REFUNDABLE');
      const amount = Math.abs(Number(row.delta));
      if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error('EXPORT_CHARGE_NOT_REFUNDABLE');
      const current = walletCredits(userSnap.data()).credits;
      const next = current + amount;
      const stamp = new Date().toISOString();
      tx.set(ledgerRef, { status: 'refunded', refundedAt: stamp, refundReason: String(body.reason || 'delivery_failed').slice(0, 80) }, { merge: true });
      tx.create(db.collection('wycut_credit_ledger').doc(`refund_${ledgerId}`), {
        userId: identity.userId, kind: 'editor_export_refund', delta: amount, status: 'posted', ref: exportId,
        originalLedgerId: ledgerId, createdAt: stamp, createdAtMs: Date.now(), balanceAfter: next,
      });
      tx.set(userRef, { creditsBalance: next, recapsAvailable: 0, email: identity.email, updatedAt: stamp }, { merge: true });
      return { refunded: true, alreadyRefunded: false, credits: next };
    });
    return NextResponse.json(result, { headers: noStore });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message === 'EXPORT_CHARGE_NOT_FOUND') return NextResponse.json({ error: 'No matching settled export charge was found.' }, { status: 404, headers: noStore });
    if (message === 'EXPORT_CHARGE_NOT_REFUNDABLE') return NextResponse.json({ error: 'This export charge cannot be refunded automatically.' }, { status: 409, headers: noStore });
    return NextResponse.json({ error: 'Could not refund the export credits automatically. Contact support with your export attempt ID.' }, { status: 503, headers: noStore });
  }
}
