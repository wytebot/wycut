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

// v28 regression guards
const middleware = fs.readFileSync('middleware.ts', 'utf8');
const authToken = fs.readFileSync('lib/auth/get-auth-token.ts', 'utf8');
const generator = fs.readFileSync('lib/ai/script-generator.ts', 'utf8');
const workspace = fs.readFileSync('components/dashboard-workspace.tsx', 'utf8');
assert.match(middleware, /X-Device-Id/, 'CORS must allow the X-Device-Id header the app sends');
assert.match(authToken, /authStateReady\(\)/, 'Auth token helper must wait for Firebase to restore the session');
assert.doesNotMatch(generator, /failed or timed out/, 'Generic provider error must not contain "timed out" (misclassified as a timeout)');
assert.match(workspace, /noticeRef/, 'Errors must be shown next to the Generate button, not only in the sidebar');
console.log('v28 audit passed.');
