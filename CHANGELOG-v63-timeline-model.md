# WyCut v63 — Timeline model foundation

- Added `lib/editor/timeline-model.ts`, a versioned renderer-neutral timeline schema.
- Added fixed lane ordering (`video/image → sound → filter → template/text`) independent of insertion order.
- Added typed clip insertion and compatible-lane move validation.
- Added split, trim, duplicate, delete, ripple-delete, lane conversion guard, selection toggle, and undo/redo primitives.
- Added `scripts/test-timeline-model.mjs` and `npm run test:timeline`.
- Added a reproducible build / Android QA section to README.

## Limitations

This is a model foundation, not a complete UI/export migration. The legacy editor still has paths using its previous script/sound-track/edit-plan state. Unlimited-track UI virtualization, haptics/drag previews, shared GPU preview/export rendering, full clip-tool matrix, Play Billing integration, and real-device/performance tests remain incomplete and must not be represented as complete.
