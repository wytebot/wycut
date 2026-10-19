import { createHmac, randomUUID } from 'node:crypto';
import { getAdminDb } from '@/lib/firebase-admin';
import type { DocumentData, DocumentReference, Firestore, Transaction } from 'firebase-admin/firestore';
import { hasLifetimeFreeAccess, normalizeEmail } from '@/lib/billing/entitlements';
import { LEGACY_RECAP_TO_CREDITS, WELCOME_CREDITS, narrationCredits } from '@/lib/billing/pricing';

/**
 * Credit wallet. A user's spendable balance is `creditsBalance` on wycut_users/{uid}.
 * Every change is mirrored by a document in wycut_credit_ledger so support can audit any balance.
 * Legacy `recapsAvailable` (old per-recap packs) is converted to credits the first time a wallet is touched.
 */
const DEFAULT_DAILY_WELCOME_CAP = 60;
const LEDGER = 'wycut_credit_ledger';
const now = () => new Date().toISOString();

export class InsufficientCreditsError extends Error {
  constructor(public needed: number, public balance: number) { super('INSUFFICIENT_CREDITS'); this.name = 'InsufficientCreditsError'; }
}
export type CreditKind = 'script' | 'narration' | 'transcribe';
type UserData = DocumentData | undefined;

function hashValue(value: string) { return createHmac('sha256', process.env.TRIAL_PEPPER || '').update(value).digest('hex'); }

/** Balance in credits, including any not-yet-migrated legacy recap credits. */
export function walletCredits(data: UserData): { credits: number; legacyRecaps: number } {
  const legacyRecaps = Math.max(0, Number(data?.recapsAvailable || 0));
  return { credits: Math.max(0, Number(data?.creditsBalance || 0)) + legacyRecaps * LEGACY_RECAP_TO_CREDITS, legacyRecaps };
}

/** Writes the new balance (and a migration ledger row once). Call only after all transaction reads. */
function writeBalance(db: Firestore, transaction: Transaction, userRef: DocumentReference, userId: string, data: UserData, nextBalance: number, extra: Record<string, unknown> = {}) {
  const { legacyRecaps } = walletCredits(data);
  if (legacyRecaps > 0) {
    transaction.create(db.collection(LEDGER).doc(`migration_${userId}_${Date.now()}`), { userId, kind: 'migration', delta: legacyRecaps * LEGACY_RECAP_TO_CREDITS, status: 'posted', note: `${legacyRecaps} legacy recap credit(s) converted at ${LEGACY_RECAP_TO_CREDITS} credits each`, createdAt: now(), createdAtMs: Date.now() });
  }
  transaction.set(userRef, { creditsBalance: Math.max(0, nextBalance), recapsAvailable: 0, updatedAt: now(), ...extra }, { merge: true });
}

export async function getCreditBalance(userId: string): Promise<number> {
  const snap = await getAdminDb().collection('wycut_users').doc(userId).get();
  return walletCredits(snap.data()).credits;
}

/** One-time welcome credits, locked to account + normalised email + device. Returns the current balance either way. */
export async function ensureWelcomeCredits(userId: string, email: string, deviceId?: string): Promise<{ granted: boolean; credits: number; reason?: string }> {
  const db = getAdminDb();
  const userRef = db.collection('wycut_users').doc(userId);
  const pepper = process.env.TRIAL_PEPPER;
  const quick = await userRef.get();
  const quickData = quick.data();
  if (quickData?.welcomeGranted === true || hasLifetimeFreeAccess(email)) return { granted: false, credits: walletCredits(quickData).credits, reason: 'already_granted' };
  if (!pepper || !deviceId || deviceId.length < 16 || deviceId.length > 200 || email.endsWith('@phone.wycut.invalid')) return { granted: false, credits: walletCredits(quickData).credits, reason: 'device_required' };
  const normalized = normalizeEmail(email);
  const claimRefs = [
    db.collection('wycut_trial_claims').doc(hashValue(`device:${deviceId}`)),
    db.collection('wycut_trial_claims').doc(hashValue(`email:${normalized}`)),
    db.collection('wycut_trial_claims').doc(hashValue(`email:${email.trim().toLowerCase()}`)), // claims written by the older free-trial code
    db.collection('wycut_trial_claims').doc(hashValue(`user:${userId}`)),
  ];
  const day = new Date().toISOString().slice(0, 10);
  const dailyRef = db.collection('wycut_trial_limits').doc(`welcome_${day}`);
  const configuredCap = Number(process.env.FREE_TRIAL_DAILY_CAP || DEFAULT_DAILY_WELCOME_CAP);
  const cap = Number.isFinite(configuredCap) && configuredCap > 0 ? Math.floor(configuredCap) : DEFAULT_DAILY_WELCOME_CAP;
  return db.runTransaction(async transaction => {
    const [user, daily, ...claims] = await Promise.all([transaction.get(userRef), transaction.get(dailyRef), ...claimRefs.map(ref => transaction.get(ref))]);
    const data = user.data();
    if (data?.welcomeGranted === true) return { granted: false, credits: walletCredits(data).credits, reason: 'already_granted' };
    if (claims.some(snap => snap.exists)) return { granted: false, credits: walletCredits(data).credits, reason: 'already_claimed' };
    const dailyCount = Number(daily.data()?.count || 0);
    if (dailyCount >= cap) return { granted: false, credits: walletCredits(data).credits, reason: 'daily_cap' };
    const next = walletCredits(data).credits + WELCOME_CREDITS;
    const stamp = now();
    for (const ref of [claimRefs[0], claimRefs[1], claimRefs[3]]) transaction.set(ref, { count: 1, kind: 'welcome', userIdHash: hashValue(userId), createdAt: stamp, updatedAt: stamp }, { merge: true });
    transaction.set(dailyRef, { count: dailyCount + 1, updatedAt: stamp }, { merge: true });
    transaction.create(db.collection(LEDGER).doc(`welcome_${userId}`), { userId, kind: 'welcome', delta: WELCOME_CREDITS, status: 'posted', createdAt: stamp, createdAtMs: Date.now(), balanceAfter: next });
    writeBalance(db, transaction, userRef, userId, data, next, { email, welcomeGranted: true, welcomeGrantedAt: stamp, createdAt: data?.createdAt || stamp });
    return { granted: true, credits: next };
  });
}

/** Deduct credits immediately and record a ledger row. Returns '' for lifetime-free accounts (nothing charged). */
export async function chargeCredits(input: { userId: string; email: string; amount: number; kind: CreditKind; ref?: string; deviceId?: string }): Promise<string> {
  if (hasLifetimeFreeAccess(input.email) || input.amount <= 0) return '';
  const attempt = () => chargeOnce(input);
  try { return await attempt(); }
  catch (error) {
    if (!(error instanceof InsufficientCreditsError)) throw error;
    const welcome = await ensureWelcomeCredits(input.userId, input.email, input.deviceId).catch(() => ({ granted: false, credits: 0 }));
    if (!welcome.granted) throw error;
    return attempt();
  }
}
async function chargeOnce(input: { userId: string; email: string; amount: number; kind: CreditKind; ref?: string }): Promise<string> {
  const db = getAdminDb();
  const userRef = db.collection('wycut_users').doc(input.userId);
  const ledgerId = randomUUID();
  await db.runTransaction(async transaction => {
    const user = await transaction.get(userRef);
    const balance = walletCredits(user.data()).credits;
    if (balance < input.amount) throw new InsufficientCreditsError(input.amount, balance);
    transaction.create(db.collection(LEDGER).doc(ledgerId), { userId: input.userId, kind: input.kind, delta: -input.amount, status: 'consumed', ref: input.ref || null, createdAt: now(), createdAtMs: Date.now(), balanceAfter: balance - input.amount });
    writeBalance(db, transaction, userRef, input.userId, user.data(), balance - input.amount, { email: input.email });
  });
  return ledgerId;
}

/** Give back a charge (idempotent: a ledger row is refunded at most once). */
export async function refundCharge(ledgerId: string) {
  if (!ledgerId) return;
  const db = getAdminDb();
  const ledgerRef = db.collection(LEDGER).doc(ledgerId);
  await db.runTransaction(async transaction => {
    const entry = await transaction.get(ledgerRef);
    const data = entry.data();
    if (!entry.exists || !data || data.status === 'refunded' || Number(data.delta) >= 0) return;
    const userRef = db.collection('wycut_users').doc(String(data.userId));
    const user = await transaction.get(userRef);
    const next = walletCredits(user.data()).credits + Math.abs(Number(data.delta));
    transaction.set(ledgerRef, { status: 'refunded', refundedAt: now() }, { merge: true });
    writeBalance(db, transaction, userRef, String(data.userId), user.data(), next);
  });
}

/** Reserve the credits for one recap script and create the usage record that later holds the script. */
export async function reserveRecapCredit(userId: string, email: string, title: string, deviceId: string | undefined, amount: number) {
  const db = getAdminDb();
  await refundExpiredReservations(db);
  const usageId = randomUUID();
  const lifetimeFree = hasLifetimeFreeAccess(email);
  const reserve = () => db.runTransaction(async transaction => {
    const userRef = db.collection('wycut_users').doc(userId);
    const user = await transaction.get(userRef);
    const current = user.data() || {};
    const t = Date.now();
    const previousWindowStart = Number(current.scriptWindowStartMs || 0);
    let windowStart = previousWindowStart; let windowCount = Number(current.scriptWindowCount || 0);
    if (!previousWindowStart || t - previousWindowStart >= 10 * 60 * 1000) { windowStart = t; windowCount = 0; }
    if (windowCount >= 5) throw new Error('SCRIPT_RATE_LIMIT');
    const balance = walletCredits(current).credits;
    if (!lifetimeFree && balance < amount) throw new InsufficientCreditsError(amount, balance);
    const charged = lifetimeFree ? 0 : amount;
    const ledgerId = charged > 0 ? randomUUID() : '';
    if (ledgerId) transaction.create(db.collection(LEDGER).doc(ledgerId), { userId, kind: 'script', delta: -charged, status: 'reserved', ref: usageId, createdAt: now(), createdAtMs: t, balanceAfter: balance - charged });
    transaction.create(db.collection('wycut_usage').doc(usageId), { usageId, userId, email, title: title.slice(0, 160), status: 'reserved', narrationCalls: 0, narratedChars: 0, narrationCreditsBilled: 0, lifetimeFreeAccess: lifetimeFree, creditsCharged: charged, ledgerId, createdAt: now(), createdAtMs: t });
    writeBalance(db, transaction, userRef, userId, current, balance - charged, { email, scriptWindowStartMs: windowStart, scriptWindowCount: windowCount + 1 });
  });
  try { await reserve(); }
  catch (error) {
    if (!(error instanceof InsufficientCreditsError)) throw error;
    const welcome = await ensureWelcomeCredits(userId, email, deviceId).catch(() => ({ granted: false, credits: 0 }));
    if (!welcome.granted) throw error;
    await reserve();
  }
  return usageId;
}

/** Refund stale reservations on the next credit request; deployments should also schedule this function. */
async function refundExpiredReservations(db: Firestore) {
  const cutoff = Date.now() - 5 * 60 * 1000;
  // Avoid requiring a composite Firestore index for status + createdAtMs.
  // Scan a bounded set of reservations and filter expiry in application code.
  const candidates = await db.collection('wycut_usage').where('status', '==', 'reserved').limit(100).get();
  for (const doc of candidates.docs) {
    const createdAtMs = Number(doc.data()?.createdAtMs || 0);
    if (createdAtMs > 0 && createdAtMs <= cutoff) await refundRecapCredit(doc.id).catch(() => undefined);
  }
}

export async function markRecapCreditConsumed(usageId: string, script?: unknown) {
  const db = getAdminDb();
  const usageRef = db.collection('wycut_usage').doc(usageId);
  const usage = await usageRef.get();
  await usageRef.set({ status: 'consumed', ...(script ? { script } : {}), consumedAt: now() }, { merge: true });
  const ledgerId = String(usage.data()?.ledgerId || '');
  if (ledgerId) await db.collection(LEDGER).doc(ledgerId).set({ status: 'consumed' }, { merge: true });
}

/** Refund a script that was reserved but never delivered, and restore the script-attempt slot it used. */
export async function refundRecapCredit(usageId: string) {
  const db = getAdminDb(); const usageRef = db.collection('wycut_usage').doc(usageId);
  let ownerId = '';
  await db.runTransaction(async transaction => {
    const usage = await transaction.get(usageRef);
    const data = usage.data();
    if (!usage.exists || !data || data.status !== 'reserved') return;
    ownerId = String(data.userId || '');
    if (!ownerId) return;
    const userRef = db.collection('wycut_users').doc(ownerId);
    const user = await transaction.get(userRef);
    const charged = Math.max(0, Number(data.creditsCharged || 0));
    const windowCount = Number(user.data()?.scriptWindowCount || 0);
    transaction.set(usageRef, { status: 'refunded', refundedAt: now() }, { merge: true });
    if (data.ledgerId) transaction.set(db.collection(LEDGER).doc(String(data.ledgerId)), { status: 'refunded', refundedAt: now() }, { merge: true });
    writeBalance(db, transaction, userRef, ownerId, user.data(), walletCredits(user.data()).credits + charged, windowCount > 0 ? { scriptWindowCount: windowCount - 1 } : {});
  });
}

export async function assertOwnedRecapUsage(usageId: string, userId: string) {
  if (!usageId || usageId.length > 80) throw new Error('Generate a recap script before creating narration.');
  const db = getAdminDb(); const ref = db.collection('wycut_usage').doc(usageId); const snap = await ref.get();
  if (!snap.exists || snap.data()?.userId !== userId || !['consumed', 'complete'].includes(String(snap.data()?.status))) throw new Error('This recap is not available for the signed-in account. Generate a new recap or sign in again.');
  return ref;
}

export type NarrationCharge = { chars: number; credits: number; ledgerId: string };

/** Validates a narration batch against the stored script and charges only for the characters it adds (rounded up cumulatively per recap). */
export async function reserveNarrationBatch(usageId: string, userId: string, email: string, requested: Array<{ index: number; id: string }>) {
  const db = getAdminDb(); const ref = db.collection('wycut_usage').doc(usageId);
  const userRef = db.collection('wycut_users').doc(userId);
  const lifetimeFree = hasLifetimeFreeAccess(email);
  const ledgerId = randomUUID();
  return db.runTransaction(async transaction => {
    const [usage, user] = await Promise.all([transaction.get(ref), transaction.get(userRef)]);
    if (!usage.exists || usage.data()?.userId !== userId || !['consumed', 'complete'].includes(String(usage.data()?.status))) throw new Error('RECAP_NOT_OWNED');
    const stored = usage.data()?.script as { beats?: Array<{ index: number; id: string; title: string; startSeconds: number; endSeconds: number; narration: string; dialogueCues: Array<{ startSeconds: number; endSeconds: number; quote?: string; instruction: string }>; act: 1|2|3|4|5 }> } | undefined;
    if (!Array.isArray(stored?.beats)) throw new Error('SCRIPT_NOT_STORED');
    const matched = requested.map(item => stored.beats!.find(beat => beat.index === item.index && beat.id === item.id));
    if (!requested.length || requested.length > 2 || matched.some(beat => !beat)) throw new Error('NARRATION_BEAT_MISMATCH');
    const beats = matched as Array<NonNullable<(typeof matched)[number]>>;
    const chars = beats.reduce((sum, beat) => sum + beat.narration.length, 0);
    if (chars > 3500) throw new Error('NARRATION_BATCH_TOO_LARGE');
    const count = Number(usage.data()?.narrationCalls || 0);
    if (count >= 80) throw new Error('NARRATION_LIMIT');
    const totalChars = Number(usage.data()?.narratedChars || 0) + chars;
    const billed = Number(usage.data()?.narrationCreditsBilled || 0);
    const credits = lifetimeFree ? 0 : Math.max(0, narrationCredits(totalChars) - billed);
    const balance = walletCredits(user.data()).credits;
    if (credits > balance) throw new InsufficientCreditsError(credits, balance);
    if (credits > 0) {
      transaction.create(db.collection(LEDGER).doc(ledgerId), { userId, kind: 'narration', delta: -credits, status: 'consumed', ref: usageId, chars, createdAt: now(), createdAtMs: Date.now(), balanceAfter: balance - credits });
      writeBalance(db, transaction, userRef, userId, user.data(), balance - credits);
    }
    transaction.set(ref, { narrationCalls: count + 1, narratedChars: totalChars, narrationCreditsBilled: billed + credits, lastNarrationRequestedAt: now() }, { merge: true });
    return { beats, charge: { chars, credits, ledgerId: credits > 0 ? ledgerId : '' } as NarrationCharge };
  });
}

/** Undo one narration batch when the provider fails before returning audio: free the slot, the characters and the credits. */
export async function releaseNarrationBatch(usageId: string, userId: string, charge?: NarrationCharge) {
  const db = getAdminDb(); const ref = db.collection('wycut_usage').doc(usageId);
  const userRef = db.collection('wycut_users').doc(userId);
  await db.runTransaction(async transaction => {
    const [usage, user] = await Promise.all([transaction.get(ref), transaction.get(userRef)]);
    if (!usage.exists || usage.data()?.userId !== userId) return;
    const count = Math.max(0, Number(usage.data()?.narrationCalls || 0) - 1);
    const chars = Math.max(0, Number(usage.data()?.narratedChars || 0) - (charge?.chars || 0));
    const billed = Math.max(0, Number(usage.data()?.narrationCreditsBilled || 0) - (charge?.credits || 0));
    transaction.set(ref, { narrationCalls: count, narratedChars: chars, narrationCreditsBilled: billed, lastNarrationFailedAt: now() }, { merge: true });
    if (charge && charge.credits > 0) {
      if (charge.ledgerId) transaction.set(db.collection(LEDGER).doc(charge.ledgerId), { status: 'refunded', refundedAt: now() }, { merge: true });
      writeBalance(db, transaction, userRef, userId, user.data(), walletCredits(user.data()).credits + charge.credits);
    }
  });
}
