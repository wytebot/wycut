import { OAuth2Client } from 'google-auth-library';

const client = new OAuth2Client(process.env.GOOGLE_WEB_CLIENT_ID || process.env.NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID);
export type VerifiedIdentity = { userId: string; email: string; name: string | null };
export async function verifyGoogleIdentity(idToken: string): Promise<VerifiedIdentity> {
  if (!idToken || idToken.length > 12000) throw new Error('Sign in with Google before checkout.');
  const audience = process.env.GOOGLE_WEB_CLIENT_ID || process.env.NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID;
  if (!audience) throw new Error('Google authentication is not configured on this deployment.');
  const ticket = await client.verifyIdToken({ idToken, audience });
  const payload = ticket.getPayload();
  if (!payload?.sub || !payload.email || payload.email_verified !== true) throw new Error('Your Google account email must be verified.');
  return { userId: payload.sub, email: payload.email.toLowerCase(), name: payload.name || null };
}
