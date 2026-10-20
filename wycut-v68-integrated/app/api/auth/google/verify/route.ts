import { NextRequest, NextResponse } from 'next/server';
import { isAllowedApiOrigin } from '@/lib/server/origin';
import { verifyGoogleIdentity } from '@/lib/billing/google-identity';
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  if (!isAllowedApiOrigin(request)) return NextResponse.json({ error: 'Cross-origin request rejected. Configure CAPACITOR_ALLOWED_ORIGINS for the installed app.' }, { status: 403 });
  let body: { idToken?: string };
  try { body = await request.json() as { idToken?: string }; } catch { return NextResponse.json({ error: 'Invalid request.' }, { status: 400 }); }
  if (!body.idToken || body.idToken.length > 12_000) return NextResponse.json({ error: 'Missing ID token.' }, { status: 400 });
  try {
    // Native sign-in exchanges the Google credential for a Firebase session, so this receives a Firebase ID token
    // (audience = Firebase project id). verifyGoogleIdentity accepts both that and a raw Google ID token.
    const identity = await verifyGoogleIdentity(body.idToken);
    return NextResponse.json({ user: { id: identity.userId, email: identity.email, name: identity.name, picture: null } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Google ID token is invalid or expired.' }, { status: 401 });
  }
}
