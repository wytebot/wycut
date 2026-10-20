# WyCut v39 — Editing workflow UI update

## What changed
- Retained the existing dark navy/near-black interface with violet/purple accents.
- Added a compact, code-aligned AI workflow explainer above the existing recap timeline: Step 1 creates/regenerates the AI scene plan; Step 2 cuts the source video locally.
- Made the existing local-cut action more prominent and labelled it “Start auto-cut (free)” before the first cut; it changes to “Re-cut clips locally” when clips already exist.
- Kept the actual handlers and processing logic wired to the existing `generateScript()` and `sliceVideoLocallyAction()` functions. This is a UI clarification, not a claim that all operations run as one combined action.

## Fact-check notes
- AI recap generation is a separate action from local video cutting. The user must tap the auto-cut action after the recap plan is generated.
- Cutting requires source video plus timestamped SRT/VTT timecodes; plain text without timestamps cannot support accurate cuts. YouTube URLs alone do not provide a downloadable video in this flow.
- The current editor is a responsive preview + recap-scene strip, not a conventional multi-track CapCut timeline. This update does not add a multi-track timeline.
- Some advanced editor controls remain preview-only or are not fully baked into MP4 export; check the in-app descriptions before relying on transitions, animated text, stickers, and watermark export.
- Static source audits can verify that handlers and renderer hooks are present, but cannot prove real output quality, OAuth, paid AI requests, Google Drive uploads, or Android device behavior.

## Verification performed for this update
- Source text patch applied to `components/dashboard-workspace.tsx`.
- Static audit scripts and syntax checks are run separately when available; this package does not claim a successful production build or physical Android end-to-end test unless explicitly reported in the delivery notes.
