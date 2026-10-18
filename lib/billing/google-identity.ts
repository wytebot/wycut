import { OAuth2Client } from 'google-auth-library';
import { getAdminAuth } from '@/lib/firebase-admin';

const client = new OAuth2Client(process.env.NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID);
function normalizeEmail(value: string): string { const email = value.trim().toLowerCase(); const match = email.match(/^([^@]+)@gmail\.com$/); return match ? `${match[1].split('+')[0].replace(/\./g, '')}@gmail.com` : email; }
export type VerifiedIdentity = { userId: string; email: string; name: string | null; phoneNumber?: string | null };

/** Accepts legacy Google OAuth ID tokens (native app) and Firebase Auth ID tokens (web providers). */
export async function verifyGoogleIdentity(idToken: string): Promise<VerifiedIdentity> {
  if (!idToken || idToken.length > 12000) throw new Error('Sign in before continuing.');
  const audience = process.env.NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID;
  if (audience) {
    try {
      const ticket = await client.verifyIdToken({ idToken, audience });
      const payload = ticket.getPayload();
      if (payload?.sub && payload.email && payload.email_verified === true) {
        return { userId: payload.sub, email: normalizeEmail(payload.email), name: payload.name || null };
      }
    } catch { /* This may be a Firebase Auth token; try Firebase Admin verification below. */ }
  }
  try {
    const decoded = await getAdminAuth().verifyIdToken(idToken, true);
    const uid = decoded.uid;
    // Preserve the existing Google-sub account key when a Firebase Google identity is used.
    const firebaseClaims = decoded.firebase as { identities?: Record<string, unknown> } | undefined;
    const googleIdentityIds = firebaseClaims?.identities?.['google.com'];
    // The hard-coded lifetime-free entitlement must not be claimable with an unverified
    // email/password account that merely registers the allowlisted address.
    if (typeof decoded.email === 'string' && decoded.email.trim() && decoded.email_verified !== true) {
      throw new Error('Verify your email address before using WyCut billing or recap generation.');
    }
    const legacyGoogleId = Array.isArray(googleIdentityIds) && typeof googleIdentityIds[0] === 'string' ? googleIdentityIds[0] : null;
    const email = typeof decoded.email === 'string' && decoded.email.trim()
      ? normalizeEmail(decoded.email)
      : `${uid}@phone.wycut.invalid`;
    return {
      userId: legacyGoogleId || uid,
      email,
      name: typeof decoded.name === 'string' ? decoded.name : null,
      phoneNumber: typeof decoded.phone_number === 'string' ? decoded.phone_number : null,
    };
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Verify your email address')) throw error;
    if (!audience) throw new Error('Firebase authentication is not configured on this deployment. Set FIREBASE_SERVICE_ACCOUNT_JSON_BASE64.');
    throw new Error('Your sign-in session is invalid or expired. Please sign in again.');
  }
}
