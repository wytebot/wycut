/** Server-side lifetime-free account allowlist. Only use after verifying the user's ID token. */
const LIFETIME_FREE_EMAILS = new Set([
  'ilemobayotolulope11092003@gmail.com',
]);

export function hasLifetimeFreeAccess(email: string | null | undefined): boolean {
  return typeof email === 'string' && LIFETIME_FREE_EMAILS.has(email.trim().toLowerCase());
}
