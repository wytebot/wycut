# WyCut v25 — Gemini build compatibility fix

## Fixed
- Fixed the TypeScript build error in `lib/ai/script-generator.ts`: the installed legacy `@google/generative-ai` type declarations do not declare Gemini 2.5's `generationConfig.thinkingConfig` field. The request is now typed at the SDK boundary while retaining `thinkingConfig: { thinkingBudget: 0 }` and `maxOutputTokens: 10000` in the runtime request.

## Verification
- `node scripts/audit-free-trial-policy.mjs`: PASS.
- ZIP integrity: checked after packaging.
- Full `npm run typecheck`, `npm run lint`, and `npm run build`: NOT RUN successfully in this environment because npm registry access is unavailable and dependencies are not installed here. Verify in Vercel Preview before production deployment.
- Gemini live API request: not tested; the SDK serialisation/runtime behavior and provider response still need a deployed integration test.

## Deployment note
This is a targeted build-error fix. It does not claim the other previously listed production blockers or acceptance tests have passed. Keep live billing unchanged and test this in a Preview deployment first.
