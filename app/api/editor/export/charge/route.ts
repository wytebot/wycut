import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import { verifyGoogleIdentity } from '@/lib/billing/google-identity';
import { hasLifetimeFreeAccess } from '@/lib/billing/entitlements';
import { walletCredits, InsufficientCreditsError } from '@/lib/billing/credits';
import { LEGACY_RECAP_TO_CREDITS } from '@/lib/billing/pricing';
import pricing from '@/config/credit-pricing.json';
import { enforceRateLimit } from '@/lib/server/rate-limit';
import { isAllowedApiOrigin } from '@/lib/server/origin';
const noStore = { 'Cache-Control': 'no-store' };

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Body = { idToken?: string; exportId?: string; quality?: string };

/** Charges the separately priced 2K export once per export attempt, after rendering succeeds. */
export async function POST(request: NextRequest) {
  const rate = enforceRateLimit(request, 'editor-2k-export-charge', 12, 60_000);
  if (!rate.allowed) return NextResponse.json({ error: 'Too many export attempts. Please wait and try again.' }, { status: 429, headers: { ...noStore, 'Retry-After': String(rate.retryAfterSeconds) } });
  if (!isAllowedApiOrigin(request)) return NextResponse.json({ error: 'Request origin rejected.' }, { status: 403, headers: noStore });
  let body: Body;
  try { body = await request.json() as Body; } catch { return NextResponse.json({ error: 'Invalid export request.' }, { status: 400, headers: noStore }); }
  if (body.quality !== '2K') return NextResponse.json({ error: 'This endpoint only charges for 2K exports.' }, { status: 400, headers: noStore });
  const exportId = String(body.exportId || '');
  if (!/^[A-Za-z0-9_-]{12,100}$/.test(exportId)) return NextResponse.json({ error: 'Invalid export attempt ID.' }, { status: 400, headers: noStore });
  let identity;
  try { identity = await verifyGoogleIdentity(body.idToken || ''); } catch { return NextResponse.json({ error: 'Sign in with Google before exporting in 2K.' }, { status: 401, headers: noStore }); }
  const cost = Math.max(0, Math.floor(Number((pricing.editorAssets as { premiumExportCostCredits?: number }).premiumExportCostCredits ?? 5)));
  const db = getAdminDb();
  const userRef = db.collection('wycut_users').doc(identity.userId);
  const ledgerId = `export_${createHash('sha256').update(`${identity.userId}:${exportId}`).digest('hex').slice(0, 48)}`;
  const ledgerRef = db.collection('wycut_credit_ledger').doc(ledgerId);
  try {
    const result = await db.runTransaction(async tx => {
      const [userSnap, existing] = await Promise.all([tx.get(userRef), tx.get(ledgerRef)]);
      const userData = userSnap.data();
      const wallet = walletCredits(userData);
      const balance = wallet.credits;
      if (existing.exists) return { credits: balance, cost: Number(existing.data()?.delta || 0) < 0 ? Math.abs(Number(existing.data()?.delta)) : 0, alreadyCharged: true };
      const charge = hasLifetimeFreeAccess(identity.email) ? 0 : cost;
      if (balance < charge) throw new InsufficientCreditsError(charge, balance);
      const next = balance - charge;
      const stamp = new Date().toISOString();
      if (wallet.legacyRecaps > 0) tx.create(db.collection('wycut_credit_ledger').doc(`migration_${identity.userId}_${Date.now()}`), { userId: identity.userId, kind: 'migration', delta: wallet.legacyRecaps * LEGACY_RECAP_TO_CREDITS, status: 'posted', note: `${wallet.legacyRecaps} legacy recap credit(s) converted during 2K export charge`, createdAt: stamp, createdAtMs: Date.now() });
      tx.create(ledgerRef, { userId: identity.userId, kind: 'editor_export_2k', delta: -charge, status: 'consumed', ref: exportId, quality: '2K', createdAt: stamp, createdAtMs: Date.now(), balanceAfter: next });
      tx.set(userRef, { creditsBalance: next, recapsAvailable: 0, updatedAt: stamp, email: identity.email }, { merge: true });
      return { credits: next, cost: charge, alreadyCharged: false };
    });
    return NextResponse.json(result, { headers: noStore });
  } catch (error) {
    if (error instanceof InsufficientCreditsError) return NextResponse.json({ error: `2K export requires ${error.needed} credits; your balance is ${error.balance}. Choose 720p/1080p or top up.`, required: error.needed, balance: error.balance, topUpUrl: '/billing' }, { status: 402, headers: noStore });
    return NextResponse.json({ error: 'Could not charge for the 2K export. The rendered file was not delivered; no download was started.' }, { status: 503, headers: noStore });
  }
}
