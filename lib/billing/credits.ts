import { createHmac, randomUUID } from 'node:crypto';
import { getAdminDb } from '@/lib/firebase-admin';
import type { DocumentReference } from 'firebase-admin/firestore';
import { hasLifetimeFreeAccess } from '@/lib/billing/entitlements';

const FREE_TRIAL_ALLOWANCE = 2; // Fixed product rule: two lifetime free generations per account and device.
const DEFAULT_DAILY_CAP = 3;

function trialHash(value: string, pepper: string) {
  return createHmac('sha256', pepper).update(value).digest('hex');
}

export async function reserveRecapCredit(userId: string, email: string, title: string, deviceId?: string) {
  const db = getAdminDb();
  await refundExpiredReservations(db);
  const userRef = db.collection('wycut_users').doc(userId);
  const usageId = randomUUID();
  const usageRef = db.collection('wycut_usage').doc(usageId);
  const lifetimeFree = hasLifetimeFreeAccess(email);
  const pepper = process.env.TRIAL_PEPPER;
  const hash = (value: string) => trialHash(value, pepper || '');
  const deviceClaimRef = deviceId ? db.collection('wycut_trial_claims').doc(hash(`device:${deviceId}`)) : null;
  const emailClaimRef = db.collection('wycut_trial_claims').doc(hash(`email:${email.trim().toLowerCase()}`));
  const userClaimRef = db.collection('wycut_trial_claims').doc(hash(`user:${userId}`));
  await db.runTransaction(async transaction => {
    const user = await transaction.get(userRef);
    const now = Date.now(); const current = user.data() || {};
    const previousWindowStart = Number(current.scriptWindowStartMs || 0);
    let windowStart = previousWindowStart; let windowCount = Number(current.scriptWindowCount || 0);
    if (!previousWindowStart || now - previousWindowStart >= 10 * 60 * 1000) { windowStart = now; windowCount = 0; }
    if (windowCount >= 5) throw new Error('SCRIPT_RATE_LIMIT');
    const balance = Number(current.recapsAvailable || 0);
    const useTrial = !lifetimeFree && balance < 1;
    if (useTrial && !pepper) throw new Error('FREE_TRIAL_DEVICE_REQUIRED');
    if (!lifetimeFree && balance < 1 && !deviceId) throw new Error('FREE_TRIAL_DEVICE_REQUIRED');
    const claimRefs = useTrial ? [deviceClaimRef!, emailClaimRef, userClaimRef] : [];
    const claimSnaps = useTrial ? await Promise.all(claimRefs.map(ref => transaction.get(ref))) : [];
    let dailyRef: DocumentReference | null = null;
    let dailyCount = 0;
    if (useTrial) {
      const counts = claimSnaps.map(snap => Number(snap.data()?.count ?? (snap.exists ? 1 : 0)));
      if (counts[0] >= FREE_TRIAL_ALLOWANCE) throw new Error('FREE_TRIAL_USED_ON_DEVICE');
      if (counts[1] >= FREE_TRIAL_ALLOWANCE || counts[2] >= FREE_TRIAL_ALLOWANCE) throw new Error('FREE_TRIAL_ALREADY_USED');
      const day = new Date().toISOString().slice(0, 10);
      dailyRef = db.collection('wycut_trial_limits').doc(day);
      const daily = await transaction.get(dailyRef);
      dailyCount = Number(daily.data()?.count || 0);
      const configuredCap = Number(process.env.FREE_TRIAL_DAILY_CAP || DEFAULT_DAILY_CAP);
      const cap = Number.isFinite(configuredCap) && configuredCap > 0 ? Math.floor(configuredCap) : DEFAULT_DAILY_CAP;
      if (dailyCount >= cap) throw new Error('FREE_TRIAL_DAILY_CAP');
      for (let i = 0; i < claimRefs.length; i++) {
        const snap = claimSnaps[i];
        const old = snap.data() || {};
        const usageIds = Array.isArray(old.usageIds) ? old.usageIds.filter((id: unknown) => typeof id === 'string') as string[] : (typeof old.usageId === 'string' ? [old.usageId] : []);
        transaction.set(claimRefs[i], { count: Number(old.count ?? (snap.exists ? 1 : 0)) + 1, usageIds: [...usageIds, usageId], userIdHash: hash(userId), emailHash: hash(email.trim().toLowerCase()), createdAt: old.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() }, { merge: true });
      }
      transaction.set(dailyRef, { count: dailyCount + 1, updatedAt: new Date().toISOString() }, { merge: true });
    }
    transaction.set(userRef, { email, scriptWindowStartMs: windowStart, scriptWindowCount: windowCount + 1, ...(lifetimeFree ? { lifetimeFreeAccess: true } : useTrial ? { freeTrialUsed: true, freeTrialGenerationsUsed: Number(current.freeTrialGenerationsUsed || 0) + 1 } : { recapsAvailable: balance - 1 }), updatedAt: new Date().toISOString() }, { merge: true });
    transaction.create(usageRef, { usageId, userId, email, title: title.slice(0, 160), status: 'reserved', narrationCalls: 0, lifetimeFreeAccess: lifetimeFree, freeTrial: useTrial, ...(useTrial ? { trialClaimIds: claimRefs.map(ref => ref.id), trialDailyLimitId: dailyRef!.id } : {}), createdAt: new Date().toISOString(), createdAtMs: Date.now() });
  });
  return usageId;
}

/** Refund stale reservations on the next credit request; deployments should also schedule this function. */
async function refundExpiredReservations(db: ReturnType<typeof getAdminDb>) {
  const cutoff = Date.now() - 5 * 60 * 1000;
  const stale = await db.collection('wycut_usage').where('status', '==', 'reserved').where('createdAtMs', '<=', cutoff).limit(50).get();
  for (const doc of stale.docs) await refundRecapCredit(doc.id);
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
    if (usage.data()?.freeTrial === true) {
      if (usage.data()?.script === undefined) {
        const claimIds = Array.isArray(usage.data()?.trialClaimIds) ? usage.data()!.trialClaimIds as string[] : [];
        const claimRefs = claimIds.map(id => db.collection('wycut_trial_claims').doc(id));
        const userRef = db.collection('wycut_users').doc(userId);
        const dailyId = usage.data()?.trialDailyLimitId;
        const dailyRef = typeof dailyId === 'string' ? db.collection('wycut_trial_limits').doc(dailyId) : null;
        const [claims, user, daily] = await Promise.all([
          Promise.all(claimRefs.map(ref => transaction.get(ref))),
          transaction.get(userRef),
          dailyRef ? transaction.get(dailyRef) : Promise.resolve(null),
        ]);
        for (let i = 0; i < claimRefs.length; i++) {
          const claim = claims[i]; if (!claim.exists) continue;
          const data = claim.data() || {};
          const usageIds = Array.isArray(data.usageIds) ? data.usageIds.filter((id: unknown) => id !== usageId) : (data.usageId === usageId ? [] : (typeof data.usageId === 'string' ? [data.usageId] : []));
          const count = Math.max(0, Number(data.count ?? (claim.exists ? 1 : 0)) - 1);
          if (count === 0) transaction.delete(claimRefs[i]);
          else transaction.set(claimRefs[i], { ...data, count, usageIds, updatedAt: new Date().toISOString() }, { merge: true });
        }
        const used = Math.max(0, Number(user.data()?.freeTrialGenerationsUsed ?? 1) - 1);
        transaction.set(userRef, { freeTrialGenerationsUsed: used, freeTrialUsed: used >= FREE_TRIAL_ALLOWANCE, updatedAt: new Date().toISOString() }, { merge: true });
        if (dailyRef && daily?.exists) transaction.set(dailyRef, { count: Math.max(0, Number(daily.data()?.count || 0) - 1), updatedAt: new Date().toISOString() }, { merge: true });
      }
      transaction.set(usageRef, { status: 'refunded', refundedAt: new Date().toISOString() }, { merge: true }); return;
    }
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
    if (count >= 80) throw new Error('NARRATION_LIMIT');
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
