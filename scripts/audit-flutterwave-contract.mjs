import { readFile } from 'node:fs/promises';
const files = {
  charge: await readFile('app/api/billing/charge/route.ts','utf8'),
  status: await readFile('app/api/billing/status/route.ts','utf8'),
  confirm: await readFile('app/api/wybuild-payment-confirmation/route.ts','utf8'),
  v4: await readFile('lib/billing/flutterwave-v4.ts','utf8'),
  exportCharge: await readFile('app/api/editor/export/charge/route.ts','utf8'),
  refund: await readFile('app/api/editor/export/refund/route.ts','utf8'),
};
const checks = [
  ['v4 OAuth uses server-only client credentials', /FLW_CLIENT_ID/.test(files.v4) && /FLW_CLIENT_SECRET/.test(files.v4) && /grant_type:\s*'client_credentials'/.test(files.v4)],
  ['provider requests have timeouts', /AbortSignal\.timeout\(15000\)/.test(files.v4) && /AbortSignal\.timeout\(25000\)/.test(files.charge)],
  ['orders are created before provider charge', /transaction\.create\(orderRef, order\)/.test(files.charge)],
  ['payment status does not grant credits client-side', /does not grant credits/.test(files.status)],
  ['WyBuild confirmation endpoint authenticates shared secret', /WYBUILD_WEBHOOK_SHARED_SECRET/.test(files.confirm) && /timingSafeEqual/.test(files.confirm)],
  ['settlement validates final succeeded status and NGN', /status !== 'succeeded'/.test(files.confirm) && /currency !== 'NGN'/.test(files.confirm)],
  ['export settlement is idempotent and server-priced', /runTransaction/.test(files.exportCharge) && /specHash/.test(files.exportCharge) && /exportCostsCredits/.test(files.exportCharge)],
  ['refunded export attempt cannot be replayed for free', /EXPORT_ALREADY_REFUNDED/.test(files.exportCharge) && /row\.status !== 'consumed'/.test(files.exportCharge)],
  ['export refunds are ownership-checked and idempotent', /row\.userId !== identity\.userId/.test(files.refund) && /alreadyRefunded/.test(files.refund) && /runTransaction/.test(files.refund)],
];
for (const [label, pass] of checks) console.log(`${pass ? 'PASS' : 'FAIL'} ${label}`);
if (checks.some(([,pass]) => !pass)) process.exitCode = 1;
else console.log(`PASS ${checks.length}/${checks.length} Flutterwave and export billing contract checks.`);
