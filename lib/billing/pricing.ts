import config from '@/config/credit-pricing.json';

/** Single source of truth for credit packs and what each action costs. Shared by server routes and the UI. */
export const USD_NGN_RATE = config.usdNgnRate;
/** Extra gateway fee added on top of the pack price. 0 = the price shown is the price paid. */
export const GATEWAY_FEE_RATE = config.gatewayFeeRate;
export const WELCOME_CREDITS = config.welcomeCredits;
export const LEGACY_RECAP_TO_CREDITS = config.legacyRecapToCredits;
export const LOW_BALANCE_CREDITS = 20;

export type ProductId = string;
export type Product = { id: ProductId; label: string; usdBase: number; credits: number; badge?: string; legacy?: boolean };
const toProduct = (p: { id: string; label: string; usd: number; credits: number; badge?: string }, legacy = false): Product => ({ id: p.id, label: p.label, usdBase: p.usd, credits: p.credits, ...(p.badge ? { badge: p.badge } : {}), ...(legacy ? { legacy: true } : {}) });
export const CREDIT_PACKS: Product[] = config.packs.map(p => toProduct(p));
const ALL_PRODUCTS: Product[] = [...CREDIT_PACKS, ...config.legacyProducts.map(p => toProduct(p, true))];

export function priceProduct(productId: string) {
  const product = ALL_PRODUCTS.find(item => item.id === productId);
  if (!product) return null;
  const baseNgn = Math.round(product.usdBase * USD_NGN_RATE);
  const feeNgn = Math.round(baseNgn * GATEWAY_FEE_RATE);
  return { ...product, rate: USD_NGN_RATE, baseNgn, feeNgn, totalNgn: baseNgn + feeNgn, currency: 'NGN' as const };
}
export function formatNaira(value: number) {
  return new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(value);
}

const rates = config.rates;
/** 2 credits per 5-minute audio chunk; shorter final chunks cost proportionally (minimum 1). */
export function transcribeCredits(durationSeconds: number): number {
  const seconds = Number.isFinite(durationSeconds) ? Math.max(0, durationSeconds) : 0;
  return Math.max(1, Math.ceil(seconds / rates.transcribeSecondsPerCredit));
}
export function transcribeCreditsForVideo(totalSeconds: number, chunkSeconds = 300): number {
  if (!(totalSeconds > 0)) return 0;
  const full = Math.floor(totalSeconds / chunkSeconds);
  const rest = totalSeconds - full * chunkSeconds;
  return full * transcribeCredits(chunkSeconds) + (rest > 1 ? transcribeCredits(rest) : 0);
}
export function scriptCredits(transcriptChars: number): number {
  return transcriptChars > rates.scriptLongThresholdChars ? rates.scriptLongCredits : rates.scriptCredits;
}
export function narrationCredits(characters: number): number {
  return Math.max(0, Math.ceil(Math.max(0, characters) * rates.narrationCreditsPer1000Chars / 1000));
}
/** Rough spoken minutes for a credit amount (about 900 characters per narrated minute). */
export function narrationMinutesForCredits(credits: number): number {
  return Math.round((credits / rates.narrationCreditsPer1000Chars) * 1000 / 900);
}
export const SCRIPT_CREDITS_MIN = rates.scriptCredits;
export const SCRIPT_CREDITS_MAX = rates.scriptLongCredits;
export function formatCredits(value: number): string {
  return new Intl.NumberFormat('en-NG', { maximumFractionDigits: 0 }).format(Math.max(0, Math.round(value)));
}
