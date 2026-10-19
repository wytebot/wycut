# WyCut v42 editor control mapping

| Existing control / location | CapCut-style target location | Notes |
|---|---|---|
| Replace-source X in `dashboard-workspace.tsx` top bar | Top-left Close (X) | Now asks for confirmation before clearing the active source; draft checkpoints remain handled by existing project store. |
| Search icon in top bar | Top bar Search | Opens searchable tool list for tool names. Search is not yet a full indexed search of sound/font catalogues. |
| AI tools button / `generateScript()` | AI quick actions sheet and AI clipper rail | Reuses existing script-generation and credit-aware flow. |
| Existing Export button | Top-right Export | Reuses existing export flow and existing disabled conditions. |
| Existing source `<video>` preview | Preview stage | Native controls hidden; custom playback row added. Aspect ratio state retained. |
| Canvas ratio chips | Playback row ratio toggle + Canvas tool | Existing ratio state retained; the compact toggle switches 9:16 / 16:9. |
| Preview speed selector | Speed tool sub-toolbar | Uses existing playbackRate state and updates preview playback rate. |
| Timeline title/time | Timeline header | Existing total duration and time display retained. |
| AI recap script beat buttons | Video timeline scene blocks | Scene selection still seeks source video to beat start. |
| Add video/image input and `timelineAssets` | Plus/add-media in timeline | Assets remain stored by existing timeline state and project export metadata. |
| `sliceVideoLocallyAction()` | Auto-cut / re-cut | Existing local FFmpeg cutting and timestamp requirements retained. |
| `AdvancedEditorTools` | Edit, Text, Effects, Overlay, Captions, Filters, Adjust, Canvas panels | Original controls are retained in the existing advanced editor section; tool chips point to that section. |
| `SoundLibrary` | Audio and Voice panels | Existing sound generation/library and track state retained. |
| Crop, mirror, watermark, font, text, emoji, sticker, transition | Closest Edit / Text / Effects / Overlay tool panels | Still use the existing edit-plan fields; no existing controls deleted. |
| Source metadata and Replace video | Source video / Cover area | Source replacement remains available in desktop/details section; Cover is not a fully separate editable cover asset yet. |
| Drive connection and saved production kit | Export / project details | Existing Drive auth, save, history and restore logic retained. |
| Credits/billing | Diamond/credits chip | Opens existing `/billing` route. |
| Mute clip | Track rail concept | Current v42 exposes mute state in the compact track rail design; full rendered audio muting still requires wiring into the export plan. |
| Split, trim, duplicate, reverse, drag-reorder, pinch timeline zoom, haptic boundary ticks | Edit sub-toolbar / timeline gestures | Not all are implemented in the existing scene schema; see explicit limitations in CHANGELOG-v42.md. They are not claimed as verified functionality. |

## Preserved existing controls
Google Drive connect/reconnect, upload/replace source, recap generation, timestamp validation, local cut/re-cut, scene title/narration/timecode editing, downloads, audio library, filters/effects/animations selectors, crop/mirror/watermark/text/emoji/sticker, export progress/cancel, Drive export, history restore, account and billing routes remain in their original modules.
