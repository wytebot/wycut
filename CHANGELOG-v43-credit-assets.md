# WyCut v43 — Premium editor asset credits

- Added server-controlled, one-time-per-account unlocks for premium fonts, animations, sounds, filters, effects, transitions, and sticker packs.
- Added configurable costs: fonts 3 credits; animations 4; sounds 3; filters 5; effects 5; transitions 5; stickers 2.
- Added `/api/editor/assets/unlock`: verifies Google/Firebase identity, rate-limits requests, checks a server-side premium allowlist, atomically deducts credits, writes a ledger entry, and records the unlock so repeat use of the same asset does not charge again.
- Wired font, filter, transition, visual-effect and animation selection in `AdvancedEditorTools` to request the server unlock before applying premium assets. Free assets remain free. Failed unlocks do not apply the premium selection.
- Added `scripts/audit-v43-premium-assets.mjs`.

## Important boundaries

- Sound-library cards are not yet wired to the unlock endpoint in this release; the server supports the `sound` category, but client integration is still needed there.
- This unlock system charges when a premium asset is first unlocked, not on every export. Asset export rendering parity remains a separate issue; no claim is made that every transition/effect is already baked into MP4 output.
- Typecheck, ESLint, Next.js production build, Firestore integration tests, and Android device tests must be run in the configured deployment environment. The static audit is not a substitute for those tests.
