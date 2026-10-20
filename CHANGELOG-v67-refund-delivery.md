# WyCut v67 — export delivery refund safety

- Added authenticated, rate-limited, origin-checked `/api/editor/export/refund` endpoint.
- Refunds are limited to the signed-in user's own settled editor-export ledger row and can only transition a consumed charge to refunded once.
- The refund transaction atomically marks the original charge refunded, adds a positive audit-ledger row, and restores wallet credits.
- Export delivery now propagates save/share errors to the export handler. If a paid export was charged but the device save/share operation fails, the client attempts the idempotent refund and shows a support reference if confirmation fails.
- Removed the arbitrary 20-extra-media count cap. Per-file size guards remain for WebView memory safety.
- Clarified in the UI that added extra media is retained in the project media bin but is not yet composited as independent clips in the final MP4.

## Limitations

- Browser download clicks cannot reliably prove that the user physically saved the file; this refund covers exceptions thrown by the download/share API, not a user later deleting a downloaded file.
- Full extra-video/image compositing, single-source-of-truth timeline UI integration, shared preview/export parity for all effects, and Android build verification remain incomplete.
