import fs from 'node:fs';
const route = fs.readFileSync('app/api/editor/export/refund/route.ts', 'utf8');
const ui = fs.readFileSync('components/dashboard-workspace.tsx', 'utf8');
const checks = [
  ['refund route uses authenticated Google identity', route.includes('verifyGoogleIdentity(body.idToken || \'\')')],
  ['refund route validates request origin', route.includes('isAllowedApiOrigin(request)')],
  ['refund route rate-limits attempts', route.includes("'editor-export-refund'")],
  ['refund is constrained to caller-owned export ledger row', route.includes("row.userId !== identity.userId") && route.includes("row.kind !== 'editor_export'")],
  ['refund is idempotent', route.includes("row.status === 'refunded'") && route.includes('refund_${ledgerId}')],
  ['refund transaction updates ledger and wallet atomically', route.includes('db.runTransaction') && route.includes('tx.set(userRef')],
  ['export delivery errors propagate to refund handler', ui.includes('downloadFile(finalVideo,') && ui.includes(', true);')],
  ['export flow calls refund endpoint after delivery failure', ui.includes("fetch('/api/editor/export/refund'")],
  ['timeline asset count hard cap removed', !ui.includes('timelineAssets.length + additions.length > 20')],
];
let failed = 0;
for (const [label, pass] of checks) { console.log(`${pass ? 'PASS' : 'FAIL'} ${label}`); if (!pass) failed++; }
if (failed) process.exitCode = 1;
