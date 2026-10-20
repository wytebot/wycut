// Margin audit for the credit price book. Run: npm run audit:pricing
// Fails if any example job earns less than the configured minimum margin at the CHEAPEST credit price (the biggest pack). Target: ~75% gross margin after modeled provider and operational costs.
import { readFileSync } from 'node:fs';
const cfg = JSON.parse(readFileSync(new URL('../config/credit-pricing.json', import.meta.url), 'utf8'));
const { rates, packs, costModelUsd: cost } = cfg;
const perCredit = packs.map(p => ({ id: p.id, usdPerCredit: p.usd / p.credits }));
const cheapest = perCredit.reduce((a, b) => (b.usdPerCredit < a.usdPerCredit ? b : a));
const transcribeCredits = s => Math.max(1, Math.ceil(s / rates.transcribeSecondsPerCredit));
const videoCredits = sec => Math.floor(sec / 300) * transcribeCredits(300) + (sec % 300 > 1 ? transcribeCredits(sec % 300) : 0);
const scriptCredits = (chars, sec = 0, runtime = 600, beats = 12) => { const base = chars > rates.scriptLongThresholdChars ? rates.scriptLongCredits : rates.scriptCredits; return Math.max(base, base + (sec > 600 ? Math.ceil((sec - 600) / 900) * 2 : 0) + (runtime > 600 ? Math.ceil((runtime - 600) / 300) * 2 : 0) + (beats > 20 ? Math.ceil((beats - 20) / 20) : 0)); };
const narrCredits = chars => Math.ceil(chars * rates.narrationCreditsPer1000Chars / 1000);
const jobs = [
  { name: '20-min video, 3-min recap', sec: 1200, tChars: 20000, runtime: 180, beats: 12, nChars: 2700 },
  { name: '90-min movie, 8-min recap', sec: 5400, tChars: 70000, runtime: 480, beats: 20, nChars: 7200 },
  { name: '2-hr movie, 15-min recap', sec: 7200, tChars: 100000, runtime: 900, beats: 24, nChars: 13500 },
  { name: 'Subtitle file, script only', sec: 0, tChars: 30000, nChars: 0 },
  { name: 'Narration only (10 min)', sec: 0, tChars: 0, nChars: 9000, noScript: true },
];
let failed = false;
console.log(`Cheapest credit: ${cheapest.id} at $${cheapest.usdPerCredit.toFixed(5)} per credit; minimum margin ${(cost.minimumMarginAtCheapestPack * 100).toFixed(0)}%\n`);
for (const job of jobs) {
  const credits = videoCredits(job.sec) + (job.noScript ? 0 : scriptCredits(job.tChars, job.sec, job.runtime || 600, job.beats || 12)) + narrCredits(job.nChars);
  const providerCost = ((job.sec / 300) * cost.transcribePer300sChunk + (job.noScript ? 0 : cost.scriptPerGeneration * Math.max(1, (job.runtime || 600) / 600)) + (job.nChars / 1000) * cost.ttsPer1000Chars) * cost.overheadFactor;
  const revenue = credits * cheapest.usdPerCredit;
  const margin = (revenue - providerCost) / revenue;
  const ok = margin >= cost.minimumMarginAtCheapestPack;
  if (!ok) failed = true;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${job.name.padEnd(30)} ${String(credits).padStart(4)} credits  revenue $${revenue.toFixed(3)}  cost $${providerCost.toFixed(3)}  margin ${(margin * 100).toFixed(0)}%`);
}
const starter = packs[0];
console.log(`\nEntry pack: $${starter.usd} -> ${starter.credits} credits.`);
process.exit(failed ? 1 : 0);
