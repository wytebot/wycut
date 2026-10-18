import { randomUUID } from 'node:crypto';
import { getAdminDb } from '@/lib/firebase-admin';
import { hasLifetimeFreeAccess } from '@/lib/billing/entitlements';

export async function reserveRecapCredit(userId: string, email: string, title: string) {
  const db = getAdminDb();
  const userRef = db.collection('wycut_users').doc(userId);
  const usageId = randomUUID();
  const usageRef = db.collection('wycut_usage').doc(usageId);
  const lifetimeFree = hasLifetimeFreeAccess(email);
  await db.runTransaction(async transaction => {
    const user = await transaction.get(userRef);
    const now = Date.now(); const current = user.data() || {};
    const previousWindowStart = Number(current.scriptWindowStartMs || 0);
    let windowStart = previousWindowStart; let windowCount = Number(current.scriptWindowCount || 0);
    if (!previousWindowStart || now - previousWindowStart >= 10 * 60 * 1000) { windowStart = now; windowCount = 0; }
    if (windowCount >= 5) throw new Error('SCRIPT_RATE_LIMIT');
    const balance = Number(current.recapsAvailable || 0);
    if (!lifetimeFree && (!user.exists || balance < 1)) throw new Error('NO_RECAP_CREDITS');
    transaction.set(userRef, { email, scriptWindowStartMs: windowStart, scriptWindowCount: windowCount + 1, ...(lifetimeFree ? { lifetimeFreeAccess: true } : { recapsAvailable: balance - 1 }), updatedAt: new Date().toISOString() }, { merge: true });
    transaction.create(usageRef, { usageId, userId, email, title: title.slice(0, 160), status: 'reserved', narrationCalls: 0, lifetimeFreeAccess: lifetimeFree, createdAt: new Date().toISOString() });
  });
  return usageId;
}

export async function markRecapCreditConsumed(usageId: string, script?: unknown) {
  const db = getAdminDb();
  await db.collection('wycut_usage').doc(usageId).set({ status: 'consumed', ...(script ? { script } : {}), consumedAt: new Date().toISOString() }, { merge: true });
}

export async function refundRecapCredit(usageId: string) {
  const db = getAdminDb(); const usageRef = db.collection('wycut_usage').doc(usageId);
  await db.runTransaction(async transaction => {
    const usage = await transaction.get(usageRef);
    if (!usage.exists || usage.data()?.status !== 'reserved') return;
    const userId = String(usage.data()?.userId || '');
    if (!userId) return;
    if (usage.data()?.lifetimeFreeAccess === true) { transaction.set(usageRef, { status: 'refunded', refundedAt: new Date().toISOString() }, { merge: true }); return; }
    const userRef = db.collection('wycut_users').doc(userId);
    const user = await transaction.get(userRef);
    transaction.set(userRef, { recapsAvailable: Number(user.data()?.recapsAvailable || 0) + 1, updatedAt: new Date().toISOString() }, { merge: true });
    transaction.set(usageRef, { status: 'refunded', refundedAt: new Date().toISOString() }, { merge: true });
  });
}

export async function assertOwnedRecapUsage(usageId: string, userId: string) {
  if (!usageId || usageId.length > 80) throw new Error('Generate a recap script before creating narration.');
  const db = getAdminDb(); const ref = db.collection('wycut_usage').doc(usageId); const snap = await ref.get();
  if (!snap.exists || snap.data()?.userId !== userId || !['consumed', 'complete'].includes(String(snap.data()?.status))) throw new Error('This recap is not available for the signed-in account. Generate a new recap or sign in again.');
  return ref;
}

export async function reserveNarrationBatch(usageId: string, userId: string, requested: Array<{ index: number; id: string }>) {
  const db = getAdminDb(); const ref = db.collection('wycut_usage').doc(usageId);
  return db.runTransaction(async transaction => {
    const usage = await transaction.get(ref);
    if (!usage.exists || usage.data()?.userId !== userId || !['consumed', 'complete'].includes(String(usage.data()?.status))) throw new Error('RECAP_NOT_OWNED');
    const stored = usage.data()?.script as { beats?: Array<{ index: number; id: string; title: string; startSeconds: number; endSeconds: number; narration: string; dialogueCues: Array<{ startSeconds: number; endSeconds: number; quote?: string; instruction: string }>; act: 1|2|3|4|5 }> } | undefined;
    if (!Array.isArray(stored?.beats)) throw new Error('SCRIPT_NOT_STORED');
    const matched = requested.map(item => stored.beats!.find(beat => beat.index === item.index && beat.id === item.id));
    if (!requested.length || requested.length > 2 || matched.some(beat => !beat)) throw new Error('NARRATION_BEAT_MISMATCH');
    const beats = matched as Array<NonNullable<(typeof matched)[number]>>;
    if (beats.reduce((sum, beat) => sum + beat.narration.length, 0) > 3500) throw new Error('NARRATION_BATCH_TOO_LARGE');
    const count = Number(usage.data()?.narrationCalls || 0);
    if (count >= 25) throw new Error('NARRATION_LIMIT');
    transaction.set(ref, { narrationCalls: count + 1, lastNarrationRequestedAt: new Date().toISOString() }, { merge: true });
    return beats;
  });
}


/** Release one narration slot when the provider call fails before returning audio. */
export async function releaseNarrationBatch(usageId: string, userId: string) {
  const db = getAdminDb(); const ref = db.collection('wycut_usage').doc(usageId);
  await db.runTransaction(async transaction => {
    const usage = await transaction.get(ref);
    if (!usage.exists || usage.data()?.userId !== userId) return;
    const count = Math.max(0, Number(usage.data()?.narrationCalls || 0) - 1);
    transaction.set(ref, { narrationCalls: count, lastNarrationFailedAt: new Date().toISOString() }, { merge: true });
  });
}
