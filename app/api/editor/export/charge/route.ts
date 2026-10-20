import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import { verifyGoogleIdentity } from '@/lib/billing/google-identity';
import { hasLifetimeFreeAccess } from '@/lib/billing/entitlements';
import { walletCredits, InsufficientCreditsError } from '@/lib/billing/credits';
import pricing from '@/config/credit-pricing.json';
import { enforceRateLimit } from '@/lib/server/rate-limit';
import { isAllowedApiOrigin } from '@/lib/server/origin';
const noStore = { 'Cache-Control': 'no-store' };
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Body = { idToken?: string; exportId?: string; quality?: string; watermarkRemoved?: boolean };

/**
 * Idempotently settles a rendered editor export. The client calls this only after the renderer
 * completes successfully and immediately before delivering the output. Never trust a client-sent
 * cost: all prices are loaded from server configuration. Flutterwave v4 remains the purchase path.
 */
export async function POST(request: NextRequest) {
  const rate = enforceRateLimit(request, 'editor-export-charge', 12, 60_000);
  if (!rate.allowed) return NextResponse.json({ error: 'Too many export attempts. Please wait and try again.' }, { status: 429, headers: { ...noStore, 'Retry-After': String(rate.retryAfterSeconds) } });
  if (!isAllowedApiOrigin(request)) return NextResponse.json({ error: 'Request origin rejected.' }, { status: 403, headers: noStore });
  let body: Body;
  try { body = await request.json() as Body; } catch { return NextResponse.json({ error: 'Invalid export request.' }, { status: 400, headers: noStore }); }
  const quality = String(body.quality || '');
  const watermarkRemoved = body.watermarkRemoved === true;
  if (!['720p', '1080p', '2K'].includes(quality)) return NextResponse.json({ error: 'Unsupported export quality.' }, { status: 400, headers: noStore });
  const exportId = String(body.exportId || '');
  if (!/^[A-Za-z0-9_-]{12,100}$/.test(exportId)) return NextResponse.json({ error: 'Invalid export attempt ID.' }, { status: 400, headers: noStore });
  const costs = (pricing.editorAssets as { exportCostsCredits?: Record<string, number> }).exportCostsCredits || {};
  const qualityCost = quality === '1080p' ? Number(costs['1080p'] ?? 3) : quality === '2K' ? Number(costs['2K'] ?? pricing.editorAssets.premiumExportCostCredits ?? 5) : 0;
  const watermarkCost = watermarkRemoved ? Number(costs.watermarkRemoval ?? 2) : 0;
  const cost = qualityCost + watermarkCost;
  if (![qualityCost, watermarkCost, cost].every(n => Number.isInteger(n) && n >= 0)) return NextResponse.json({ error: 'Export pricing is not configured correctly.' }, { status: 503, headers: noStore });
  if (cost === 0) return NextResponse.json({ cost: 0, credits: null, alreadyCharged: false, message: 'This export is free.' }, { headers: noStore });
  let identity;
  try { identity = await verifyGoogleIdentity(body.idToken || ''); }
  catch { return NextResponse.json({ error: 'Sign in with Google before using paid export options.' }, { status: 401, headers: noStore }); }
  const db = getAdminDb();
  const userRef = db.collection('wycut_users').doc(identity.userId);
  const ledgerId = `export_${createHash('sha256').update(`${identity.userId}:${exportId}`).digest('hex').slice(0, 48)}`;
  const ledgerRef = db.collection('wycut_credit_ledger').doc(ledgerId);
  const specHash = createHash('sha256').update(JSON.stringify({ quality, watermarkRemoved, cost })).digest('hex');
  try {
    const result = await db.runTransaction(async tx => {
      const [userSnap, existing] = await Promise.all([tx.get(userRef), tx.get(ledgerRef)]);
      const userData = userSnap.data();
      const balance = walletCredits(userData).credits;
      if (existing.exists) {
        const row = existing.data() || {};
        if (row.specHash !== specHash) throw new Error('EXPORT_ID_REUSED');
        // A refunded export ID must never be replayed as a successful, already-paid export.
        if (row.status !== 'consumed') throw new Error(row.status === 'refunded' ? 'EXPORT_ALREADY_REFUNDED' : 'EXPORT_NOT_SETTLED');
        return { credits: balance, cost: Math.abs(Math.min(0, Number(row.delta || 0))), alreadyCharged: true };
      }
      const charge = hasLifetimeFreeAccess(identity.email) ? 0 : cost;
      if (balance < charge) throw new InsufficientCreditsError(charge, balance);
      const next = balance - charge;
      const stamp = new Date().toISOString();
      if (walletCredits(userData).legacyRecaps > 0) tx.create(db.collection('wycut_credit_ledger').doc(`migration_${identity.userId}_${Date.now()}_${ledgerId.slice(-6)}`), { userId: identity.userId, kind: 'migration', delta: walletCredits(userData).credits - Math.max(0, Number(userData?.creditsBalance || 0)), status: 'posted', note: 'Legacy recap credits converted during editor export', createdAt: stamp, createdAtMs: Date.now() });
      tx.create(ledgerRef, { userId: identity.userId, kind: 'editor_export', delta: -charge, status: 'consumed', ref: exportId, exportId, quality, watermarkRemoved, specHash, cost: charge, createdAt: stamp, createdAtMs: Date.now(), balanceAfter: next });
      tx.set(userRef, { creditsBalance: next, recapsAvailable: 0, updatedAt: stamp, email: identity.email }, { merge: true });
      return { credits: next, cost: charge, alreadyCharged: false };
    });
    return NextResponse.json({ ...result, quality, watermarkRemoved }, { headers: noStore });
  } catch (error) {
    if (error instanceof InsufficientCreditsError) return NextResponse.json({ error: `This export requires ${error.needed} credits; your balance is ${error.balance}. Choose 720p with watermark or top up.`, required: error.needed, balance: error.balance, topUpUrl: '/billing' }, { status: 402, headers: noStore });
    if (error instanceof Error && error.message === 'EXPORT_ID_REUSED') return NextResponse.json({ error: 'This export attempt ID was already used with different options. Start a new export.' }, { status: 409, headers: noStore });
    if (error instanceof Error && error.message === 'EXPORT_ALREADY_REFUNDED') return NextResponse.json({ error: 'This export attempt was already refunded. Start a new export attempt to be charged correctly.' }, { status: 409, headers: noStore });
    if (error instanceof Error && error.message === 'EXPORT_NOT_SETTLED') return NextResponse.json({ error: 'This export attempt is not in a chargeable state. Start a new export attempt.' }, { status: 409, headers: noStore });
    return NextResponse.json({ error: 'Could not settle the export charge. The rendered file was not delivered.' }, { status: 503, headers: noStore });
  }
}
