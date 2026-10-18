/** Flutterwave v4 OAuth client-credentials helper. Server-side only. */
let cachedToken = '';
let expiresAt = 0;
export async function getFlutterwaveV4AccessToken(): Promise<string> {
  if (cachedToken && Date.now() < expiresAt - 60_000) return cachedToken;
  const clientId = process.env.FLW_CLIENT_ID || '';
  const clientSecret = process.env.FLW_CLIENT_SECRET || '';
  if (!clientId || !clientSecret) throw new Error('FLW_CLIENT_ID and FLW_CLIENT_SECRET are required for Flutterwave v4.');
  const response = await fetch('https://idp.flutterwave.com/realms/flutterwave/protocol/openid-connect/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: 'client_credentials' }),
    cache: 'no-store', signal: AbortSignal.timeout(15000),
  });
  const data = await response.json().catch(() => ({})) as { access_token?: string; expires_in?: number; error_description?: string; message?: string };
  if (!response.ok || !data.access_token) throw new Error(data.error_description || data.message || 'Could not authenticate with Flutterwave v4.');
  cachedToken = data.access_token;
  expiresAt = Date.now() + Math.max(60, Number(data.expires_in || 600)) * 1000;
  return cachedToken;
}
export function flutterwaveV4BaseUrl() {
  const base = process.env.FLW_V4_BASE_URL || 'https://f4bexperience.flutterwave.com';
  if (!base.startsWith('https://')) throw new Error('FLW_V4_BASE_URL must use HTTPS.');
  return base.replace(/\/$/, '');
}
