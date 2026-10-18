/** Server-side lifetime-free account allowlist. Configure comma-separated emails in LIFETIME_FREE_EMAILS. */
function normalizeEmail(value: string) { return value.trim().toLowerCase().replace(/@gmail\.com$/, '@gmail.com').replace(/^(.*)@gmail\.com$/, (_, local) => `${local.split('+')[0].replace(/\./g, '')}@gmail.com`); }
const lifetimeEmails = () => new Set((process.env.LIFETIME_FREE_EMAILS || '').split(',').map(normalizeEmail).filter(Boolean));
export function hasLifetimeFreeAccess(email: string | null | undefined): boolean {
  return typeof email === 'string' && lifetimeEmails().has(normalizeEmail(email));
}
