import { NextRequest, NextResponse } from 'next/server';
import { isAllowedApiOrigin } from '@/lib/server/origin';
import { verifyGoogleIdentity } from '@/lib/billing/google-identity';
import { transcribeCredits } from '@/lib/billing/pricing';
import { hasLifetimeFreeAccess } from '@/lib/billing/entitlements';

export const runtime = 'nodejs';
export const maxDuration = 10;

/** Returns a provider-aware preflight estimate only; the actual charge is independently calculated and enforced by /api/transcribe. */
export async function POST(req: NextRequest) {
  if (!isAllowedApiOrigin(req)) return NextResponse.json({ error: 'Cross-origin request rejected.' }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
  let body: { idToken?: string; durations?: number[] };
  try { body = await req.json() as typeof body; } catch { return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 }); }
  let identity;
  try { identity = await verifyGoogleIdentity(body.idToken || ''); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Sign in to estimate transcription credits.' }, { status: 401 }); }
  if (identity.email.endsWith('@phone.wycut.invalid') && !hasLifetimeFreeAccess(identity.email)) return NextResponse.json({ error: 'A verified Google email is required.' }, { status: 403 });
  if (!Array.isArray(body.durations) || body.durations.length > 300 || body.durations.some(value => !Number.isFinite(value) || value < 0 || value > 600)) return NextResponse.json({ error: 'Provide valid audio chunk durations.' }, { status: 400 });
  const provider = process.env.GEMINI_API_KEY ? 'gemini' : process.env.OPENAI_API_KEY && process.env.TRANSCRIBE_ALLOW_WHISPER_FALLBACK !== '0' ? 'whisper' : 'unavailable';
  if (provider === 'unavailable') return NextResponse.json({ error: 'Transcription is not configured.' }, { status: 503 });
  const creditsNeeded = body.durations.reduce((sum, seconds) => sum + transcribeCredits(seconds, provider), 0);
  return NextResponse.json({ provider, creditsNeeded, currency: 'credits' }, { headers: { 'Cache-Control': 'no-store' } });
}
