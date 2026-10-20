// Provider-aware cost and margin audit. Uses conservative allowances, no network/API calls.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const cfg = JSON.parse(readFileSync(new URL('../config/credit-pricing.json', import.meta.url), 'utf8'));
const { rates, packs, costModelUsd: c } = cfg;
const minCreditPrice = Math.min(...packs.map(p => p.usd / p.credits));
const transcribeCredits = (sec, provider) => Math.max(1, Math.ceil(sec / (provider === 'whisper' ? rates.transcribeWhisperSecondsPerCredit : rates.transcribeSecondsPerCredit)));
const videoCredits = (sec, provider) => sec > 0 ? Math.floor(sec/300)*transcribeCredits(300,provider)+(sec%300>1?transcribeCredits(sec%300,provider):0) : 0;
const scriptCredits = (chars, sec=0, runtime=600, beats=12) => { const base=chars>rates.scriptLongThresholdChars?rates.scriptLongCredits:rates.scriptCredits; return Math.max(base,base+(sec>600?Math.ceil((sec-600)/900)*2:0)+(runtime>600?Math.ceil((runtime-600)/300)*2:0)+(beats>20?Math.ceil((beats-20)/20):0)); };
const narrationCredits = chars => Math.ceil(chars*rates.narrationCreditsPer1000Chars/1000);
const jobs = [
  {name:'5-minute transcription only',sec:300,tChars:0,nChars:0,noScript:true},
  {name:'20-min video, 3-min recap + narration',sec:1200,tChars:20000,runtime:180,beats:12,nChars:2700},
  {name:'90-min movie, 8-min recap + narration',sec:5400,tChars:70000,runtime:480,beats:20,nChars:7200},
  {name:'2-hour movie, 15-min recap + narration',sec:7200,tChars:100000,runtime:900,beats:24,nChars:13500},
  {name:'Subtitle file, script only',sec:0,tChars:30000,runtime:600,beats:12,nChars:0},
  {name:'Narration only (10 minutes)',sec:0,tChars:0,nChars:9000,noScript:true},
];
console.log(`Worst credit-pack rate: $${minCreditPrice.toFixed(6)} / credit; USD/NGN ${cfg.usdNgnRate}; target ${(c.minimumMarginAtCheapestPack*100).toFixed(0)}%.`);
let minMargin=1;
for (const provider of ['gemini','whisper']) {
  console.log(`\nProvider scenario: ${provider.toUpperCase()} transcription`);
  const perChunk=provider==='whisper'?c.transcribeWhisperPer300sChunk:c.transcribePer300sChunk;
  for (const job of jobs) {
    const credits=videoCredits(job.sec,provider)+(job.noScript?0:scriptCredits(job.tChars,job.sec,job.runtime??600,job.beats??12))+narrationCredits(job.nChars);
    const direct=((job.sec/300)*perChunk+(job.noScript?0:c.scriptPerGeneration*Math.max(1,(job.runtime??600)/600))+job.nChars/1000*c.ttsPer1000Chars)*c.overheadFactor;
    const revenue=credits*minCreditPrice;
    const margin=revenue>0?(revenue-direct)/revenue:1;
    minMargin=Math.min(minMargin,margin);
    console.log(`${margin>=c.minimumMarginAtCheapestPack?'PASS':'FAIL'} ${job.name}: ${credits} credits; revenue $${revenue.toFixed(4)}; modeled cost $${direct.toFixed(4)}; margin ${(margin*100).toFixed(1)}%`);
    assert.ok(margin>=c.minimumMarginAtCheapestPack,`${provider} ${job.name} margin below target`);
  }
}
console.log(`\nPASS all scenarios. Lowest modeled gross margin: ${(minMargin*100).toFixed(1)}%. Estimates are not live provider invoices.`);
