import { randomUUID } from 'node:crypto';
import { getAdminDb } from '@/lib/firebase-admin';

export async function reserveRecapCredit(userId: string, email: string, title: string) {
  const db = getAdminDb();
  const userRef = db.collection('wycut_users').doc(userId);
  const usageId = randomUUID();
  const usageRef = db.collection('wycut_usage').doc(usageId);
  await db.runTransaction(async transaction => {
    const user = await transaction.get(userRef);
    const balance = Number(user.data()?.recapsAvailable || 0);
    if (!user.exists || balance < 1) throw new Error('NO_RECAP_CREDITS');
    transaction.set(userRef, { email, recapsAvailable: balance - 1, updatedAt: new Date().toISOString() }, { merge: true });
    transaction.create(usageRef, { usageId, userId, email, title: title.slice(0, 160), status: 'reserved', narrationCalls: 0, createdAt: new Date().toISOString() });
  });
  return usageId;
}

export async function markRecapCreditConsumed(usageId: string) {
  const db = getAdminDb();
  await db.collection('wycut_usage').doc(usageId).set({ status: 'consumed', consumedAt: new Date().toISOString() }, { merge: true });
}

export async function refundRecapCredit(usageId: string) {
  const db = getAdminDb(); const usageRef = db.collection('wycut_usage').doc(usageId);
  await db.runTransaction(async transaction => {
    const usage = await transaction.get(usageRef);
    if (!usage.exists || usage.data()?.status !== 'reserved') return;
    const userId = String(usage.data()?.userId || '');
    if (!userId) return;
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

export async function reserveNarrationBatch(usageId: string, userId: string) {
  const db = getAdminDb(); const ref = db.collection('wycut_usage').doc(usageId);
  await db.runTransaction(async transaction => {
    const usage = await transaction.get(ref);
    if (!usage.exists || usage.data()?.userId !== userId || !['consumed', 'complete'].includes(String(usage.data()?.status))) throw new Error('RECAP_NOT_OWNED');
    const count = Number(usage.data()?.narrationCalls || 0);
    if (count >= 25) throw new Error('NARRATION_LIMIT');
    transaction.set(ref, { narrationCalls: count + 1, lastNarrationRequestedAt: new Date().toISOString() }, { merge: true });
  });
}
