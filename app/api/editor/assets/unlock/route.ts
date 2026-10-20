import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import config from '@/config/credit-pricing.json';
import { enforceRateLimit } from '@/lib/server/rate-limit';
import { isAllowedApiOrigin } from '@/lib/server/origin';
import { verifyGoogleIdentity } from '@/lib/billing/google-identity';
import { getAdminDb } from '@/lib/firebase-admin';
import { hasLifetimeFreeAccess } from '@/lib/billing/entitlements';
import { walletCredits, InsufficientCreditsError } from '@/lib/billing/credits';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const noStore = { 'Cache-Control': 'no-store' };
type Category = 'font' | 'animation' | 'sound' | 'filter' | 'effect' | 'transition' | 'sticker';
type Input = { idToken?: string; category?: string; asset?: string };

/** Unlock premium editor assets once per account. The server validates the allowlist and price. */
export async function POST(request: NextRequest) {
  const rate = enforceRateLimit(request, 'editor-asset-unlock', 20, 60_000);
  if (!rate.allowed) return NextResponse.json({ error: 'Too many asset unlock attempts. Please wait.' }, { status: 429, headers: { ...noStore, 'Retry-After': String(rate.retryAfterSeconds) } });
  if (!isAllowedApiOrigin(request)) return NextResponse.json({ error: 'Request origin rejected.' }, { status: 403, headers: noStore });
  let input: Input;
  try { input = await request.json() as Input; } catch { return NextResponse.json({ error: 'Invalid request.' }, { status: 400, headers: noStore }); }
  let identity;
  try { identity = await verifyGoogleIdentity(input.idToken || ''); } catch { return NextResponse.json({ error: 'Please sign in again to unlock premium assets.' }, { status: 401, headers: noStore }); }
  const category = String(input.category || '') as Category;
  const asset = String(input.asset || '').trim();
  const premiumKey: Record<string, string> = { font: 'fonts', animation: 'animations', sound: 'sounds', filter: 'filters', effect: 'effects', transition: 'transitions', sticker: 'stickers' };
  const allowed = (config.editorAssets.premium as Record<string, unknown>)[premiumKey[category] || ''];
  if (!Array.isArray(allowed) || !asset || !allowed.includes(asset)) return NextResponse.json({ error: 'This asset is not in the premium catalog.' }, { status: 400, headers: noStore });
  const costs = config.editorAssets.premiumUnlockCosts as Record<string, number>;
  const cost = Number(costs[category]);
  if (!Number.isInteger(cost) || cost < 1) return NextResponse.json({ error: 'Premium asset pricing is not configured.' }, { status: 503, headers: noStore });
  const db = getAdminDb();
  const userRef = db.collection('wycut_users').doc(identity.userId);
  const unlockId = `${identity.userId}_${category}_${Buffer.from(asset).toString('base64url').slice(0, 90)}`;
  const unlockRef = db.collection('wycut_editor_asset_unlocks').doc(unlockId);
  try {
    const result = await db.runTransaction(async tx => {
      const [unlock, user] = await Promise.all([tx.get(unlockRef), tx.get(userRef)]);
      if (unlock.exists) return { unlocked: true, alreadyOwned: true, credits: walletCredits(user.data()).credits };
      const balance = walletCredits(user.data()).credits;
      const charge = hasLifetimeFreeAccess(identity.email) ? 0 : cost;
      if (balance < charge) throw new InsufficientCreditsError(charge, balance);
      const next = balance - charge;
      const stamp = new Date().toISOString();
      if (charge > 0) tx.create(db.collection('wycut_credit_ledger').doc(randomUUID()), { userId: identity.userId, kind: 'editor_asset', delta: -charge, status: 'consumed', ref: `${category}:${asset}`, assetCategory: category, assetName: asset, createdAt: stamp, createdAtMs: Date.now(), balanceAfter: next });
      tx.set(unlockRef, { userId: identity.userId, category, asset, cost: charge, unlockedAt: stamp, version: 1 });
      tx.set(userRef, { creditsBalance: next, recapsAvailable: 0, updatedAt: stamp, email: identity.email }, { merge: true });
      return { unlocked: true, alreadyOwned: false, credits: next };
    });
    return NextResponse.json({ ...result, cost: result.alreadyOwned ? 0 : (hasLifetimeFreeAccess(identity.email) ? 0 : cost) }, { headers: noStore });
  } catch (error) {
    if (error instanceof InsufficientCreditsError) return NextResponse.json({ error: 'Not enough credits to unlock this premium asset.', required: error.needed, balance: error.balance, topUpUrl: '/billing' }, { status: 402, headers: noStore });
    return NextResponse.json({ error: 'Could not unlock this asset. No credits were deducted.' }, { status: 503, headers: noStore });
  }
}
