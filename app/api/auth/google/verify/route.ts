import { NextRequest, NextResponse } from 'next/server';
import { OAuth2Client } from 'google-auth-library';
import { isAllowedApiOrigin } from '@/lib/server/origin';
export const runtime = 'nodejs';
const client = new OAuth2Client(process.env.NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID);
export async function POST(request: NextRequest) {
  if (!isAllowedApiOrigin(request)) return NextResponse.json({ error: 'Cross-origin request rejected. Configure CAPACITOR_ALLOWED_ORIGINS for the installed app.' }, { status: 403 });
  let body: { idToken?: string };
  try { body = await request.json() as { idToken?: string }; } catch { return NextResponse.json({ error: 'Invalid request.' }, { status: 400 }); }
  if (!body.idToken || body.idToken.length > 10_000) return NextResponse.json({ error: 'Missing ID token.' }, { status: 400 });
  const audience = process.env.NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID;
  if (!audience) return NextResponse.json({ error: 'Google authentication is not configured.' }, { status: 503 });
  try {
    const ticket = await client.verifyIdToken({ idToken: body.idToken, audience });
    const payload = ticket.getPayload();
    if (!payload?.sub || !payload.email || payload.email_verified !== true) return NextResponse.json({ error: 'Google account is not verified.' }, { status: 401 });
    // This confirms identity only. Production apps should issue a secure HttpOnly session cookie here.
    return NextResponse.json({ user: { id: payload.sub, email: payload.email, name: payload.name || null, picture: payload.picture || null } });
  } catch { return NextResponse.json({ error: 'Google ID token is invalid or expired.' }, { status: 401 }); }
}
