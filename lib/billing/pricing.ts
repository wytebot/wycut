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
export type TranscriptionProvider = 'gemini' | 'whisper';
/** Provider-aware pricing: Gemini Flash-Lite uses its conservative audio allowance; Whisper uses its higher per-minute API cost. */
export function transcribeCredits(durationSeconds: number, provider: TranscriptionProvider = 'gemini'): number {
  const seconds = Number.isFinite(durationSeconds) ? Math.max(0, durationSeconds) : 0;
  const secondsPerCredit = provider === 'whisper' ? Number(rates.transcribeWhisperSecondsPerCredit || 18) : Number(rates.transcribeSecondsPerCredit || 80);
  return Math.max(1, Math.ceil(seconds / secondsPerCredit));
}
export function transcribeCreditsForVideo(totalSeconds: number, chunkSeconds = 300, provider: TranscriptionProvider = 'gemini'): number {
  if (!(totalSeconds > 0)) return 0;
  const full = Math.floor(totalSeconds / chunkSeconds);
  const rest = totalSeconds - full * chunkSeconds;
  return full * transcribeCredits(chunkSeconds, provider) + (rest > 1 ? transcribeCredits(rest, provider) : 0);
}
/** Estimate source length from SRT/VTT timecodes when present. This avoids trusting a client-supplied duration. */
export function transcriptDurationSeconds(transcript: string): number {
  const srt = [...transcript.matchAll(/(\d{1,2}):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d{1,2}):(\d{2}):(\d{2})[,.](\d{3})/g)];
  const vtt = [...transcript.matchAll(/(\d{2}):(\d{2})\.(\d{3})\s*-->\s*(\d{2}):(\d{2})\.(\d{3})/g)];
  const srtEnd = srt.reduce((max, m) => Math.max(max, Number(m[5]) * 3600 + Number(m[6]) * 60 + Number(m[7]) + Number(m[8]) / 1000), 0);
  const vttEnd = vtt.reduce((max, m) => Math.max(max, Number(m[4]) * 60 + Number(m[5]) + Number(m[6]) / 1000), 0);
  return Math.max(srtEnd, vttEnd);
}
/**
 * AI script credits include provider-cost floor + source/target duration and beat complexity.
 * Transcription is billed separately per audio minute; this additional source-length component
 * covers the larger prompt/context and the extra selection reasoning for long videos/subtitles.
 */
export function scriptCredits(transcriptChars: number, sourceDurationSeconds = 0, targetRuntimeSeconds = 600, beatCount = 12): number {
  const chars = Math.max(0, Number(transcriptChars) || 0);
  const sourceSeconds = Math.max(0, Number(sourceDurationSeconds) || 0);
  const targetSeconds = Math.max(60, Number(targetRuntimeSeconds) || 600);
  const beats = Math.max(10, Number(beatCount) || 12);
  const base = chars > rates.scriptLongThresholdChars ? rates.scriptLongCredits : rates.scriptCredits;
  const sourceComplexity = sourceSeconds > 600 ? Math.ceil((sourceSeconds - 600) / 900) * 2 : 0;
  const outputComplexity = targetSeconds > 600 ? Math.ceil((targetSeconds - 600) / 300) * 2 : 0;
  const beatComplexity = beats > 20 ? Math.ceil((beats - 20) / 20) : 0;
  // The baseline is already higher than the current average provider estimate. Keep it as a floor,
  // then scale for longer context/output so large jobs do not cost the same as a short recap.
  return Math.max(base, Math.ceil(base + sourceComplexity + outputComplexity + beatComplexity));
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
