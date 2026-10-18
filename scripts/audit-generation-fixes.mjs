import fs from 'node:fs';
import assert from 'node:assert/strict';

const identity = fs.readFileSync('lib/billing/google-identity.ts', 'utf8');
const credits = fs.readFileSync('lib/billing/credits.ts', 'utf8');
const scriptRoute = fs.readFileSync('app/api/script/route.ts', 'utf8');

assert.match(identity, /normalizeEmail\(decoded\.email\)/, 'Firebase ID-token email must use the local normalizer');
assert.doesNotMatch(identity, /decoded\.normalizeEmail/, 'Decoded Firebase claims do not expose a normalizeEmail method');
assert.match(credits, /where\('status',\s*'==',\s*'reserved'\)\.limit\(100\)/, 'Reservation cleanup must not require a composite Firestore index');
assert.doesNotMatch(credits, /where\('createdAtMs',\s*'<=',\s*cutoff\)/, 'Avoid the status + createdAtMs composite-index query');
assert.match(scriptRoute, /AI_PROVIDER_NOT_CONFIGURED/, 'Generation failures should expose actionable provider configuration guidance');
assert.match(scriptRoute, /\[api\/script\] generation failed/, 'Provider errors must be logged server-side');
console.log('Generation regression audit passed.');
