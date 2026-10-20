import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const read = p => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const credits = read('lib/billing/credits.ts');
const entitlement = read('app/api/billing/entitlement/route.ts');
const scriptRoute = read('app/api/script/route.ts');
const transcribe = read('app/api/transcribe/route.ts');
const narration = read('app/api/narration/route.ts');
const settlement = read('lib/billing/settlement.ts');
const dashboard = read('components/dashboard-workspace.tsx');
const env = read('.env.example');
// Welcome credits: one grant, locked to device + normalised email + account, daily-capped, atomic.
assert.match(credits, /ensureWelcomeCredits/);
assert.match(credits, /welcomeGranted/);
assert.match(credits, /normalizeEmail\(email\)/);
assert.match(credits, /claims\.some\(snap => snap\.exists\)/);
assert.match(credits, /db\.runTransaction/);
assert.match(env, /FREE_TRIAL_DAILY_CAP=60/);
// Every paid action charges credits and can refund.
assert.match(scriptRoute, /reserveRecapCredit\([^)]*requiredCredits/);
assert.match(scriptRoute, /refundRecapCredit/);
assert.match(transcribe, /chargeCredits/);
assert.match(transcribe, /refundCharge/);
assert.match(narration, /reserveNarrationBatch/);
assert.match(narration, /releaseNarrationBatch\([^)]*charge/);
// Purchases are idempotent ledger rows.
assert.match(settlement, /purchase_\$\{paymentId\}/);
assert.match(entitlement, /ensureWelcomeCredits/);
assert.match(dashboard, /ensureCredits/);
console.log('Credit policy static audit passed: welcome credits, charging on every paid step, refunds, and idempotent purchases.');
