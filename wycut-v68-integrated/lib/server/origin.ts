import type { NextRequest } from 'next/server';

function allowedOrigins(): Set<string> {
  return new Set((process.env.CAPACITOR_ALLOWED_ORIGINS || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean));
}

/** Allow same-origin web requests and explicitly configured bundled-app origins only. */
export function isAllowedApiOrigin(request: NextRequest): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  try {
    if (new URL(origin).origin === new URL(request.url).origin) return true;
  } catch {
    return false;
  }
  return allowedOrigins().has(origin);
}

export function getAllowedOrigin(origin: string | null): string | null {
  if (!origin) return null;
  return allowedOrigins().has(origin) ? origin : null;
}
