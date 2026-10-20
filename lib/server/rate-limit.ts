import { NextRequest } from 'next/server';

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

/** Best-effort per-process abuse guard. Use a shared Redis/Upstash limiter for multi-instance production deployments. */
export function enforceRateLimit(request: NextRequest, key: string, limit: number, windowMs: number): { allowed: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const ip = forwarded || request.headers.get('x-real-ip') || 'unknown';
  const id = `${key}:${ip}`;
  for (const [bucketKey, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(bucketKey);
  const current = buckets.get(id);
  if (!current || current.resetAt <= now) {
    buckets.set(id, { count: 1, resetAt: now + windowMs });
    if (buckets.size > 10_000) buckets.clear();
    return { allowed: true, retryAfterSeconds: 0 };
  }
  if (current.count >= limit) return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)) };
  current.count++;
  return { allowed: true, retryAfterSeconds: 0 };
}
