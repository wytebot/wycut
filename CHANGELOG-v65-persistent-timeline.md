# WyCut v65 — Persistent timeline reliability

- Sound clips render on separate timeline rows, and an additional sound track can be added after existing tracks.
- Removed the legacy 12-layer audio UI cap. This does not mean device memory/storage is physically unlimited; extremely large sessions remain device-dependent.
- Dragging now updates a drop target and commits the move once on release, avoiding repeated reorder operations during pointer movement.
- Main-video clip drops reorder the clip list and reflow the sequential magnetic track instead of clamping every move to the current clip's unchanged neighbors.
- Versioned undo/redo snapshots are persisted with the project in IndexedDB; history snapshots reference unique audio blobs by track ID so each blob is stored once for history.
- Undo/redo cursor changes are persisted so a reopened project restores the current history position.

## Not claimed as complete

This change does not implement a full arbitrary multi-lane compositing engine, GPU/WebGL render parity, Google Play Billing, server-verified native purchase restoration, export settlement/refunds, Android project generation, or real-device performance verification. The current project archive has no Android Gradle project or Gradle wrapper, and package dependencies are not installed in the verification environment.
