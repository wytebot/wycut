import fs from 'node:fs';
import assert from 'node:assert/strict';
const workspace = fs.readFileSync('components/dashboard-workspace.tsx','utf8');
const renderer = fs.readFileSync('lib/ffmpeg/edit-export.ts','utf8');
const mixer = fs.readFileSync('lib/ffmpeg/client-slicer.ts','utf8');
const soundUI = fs.readFileSync('components/sound-library.tsx','utf8');
const charge = fs.readFileSync('app/api/editor/export/charge/route.ts','utf8');
const checks = [
  ['versioned timeline model is materialized from the editor', workspace.includes('materializeTimelineProject') && workspace.includes('setTimelineProject(project)')],
  ['timeline model is persisted with editor state', workspace.includes('timelineAssetPlacements, timelineProject')],
  ['extra video/image assets become timed render inputs', workspace.includes('currentTimeline.lanes.flatMap') && renderer.includes('validTimelineOverlays')],
  ['preview uses each asset placement start and duration', workspace.includes('<TimelineAssetPreview') && workspace.includes('startSeconds={placement.startSeconds}')],
  ['visual assets are selectable and draggable in the actual timeline', fs.readFileSync('components/editor-v42-layout.tsx','utf8').includes("beginMove('asset'") && workspace.includes('onMoveVisualAsset')],
  ['audio tracks are synchronized into preview playback', workspace.includes('<TimelineAudioPreview') && workspace.includes('track.fadeInSeconds')],
  ['export maps visual layers across kept main-track clips', workspace.includes('mainVideoClips') && workspace.includes('cursor + overlapStart - beatStart')],
  ['independent overlays preserve alpha and use timing gates', renderer.includes('format=rgba,pad=') && renderer.includes('enable=') && renderer.includes('between(t')],
  ['sound track mixer trims source offsets and applies fades', mixer.includes('sourceOffsetSeconds') && mixer.includes('afade=t=in') && mixer.includes('afade=t=out')],
  ['audio track count no longer has an artificial 12-track cap', !mixer.includes('tracks.length > 12') && !soundUI.includes('MAX_AUDIO_LAYERS = 12')],
  ['audio/video toolbars are context-aware', fs.readFileSync('components/editor-v42-layout.tsx','utf8').includes("context === 'audio'") && workspace.includes("context={selectedAudioId ? 'audio'")],
  ['refund replay cannot re-use an already-refunded export ID', charge.includes('EXPORT_ALREADY_REFUNDED') && charge.includes("row.status !== 'consumed'")],
];
for (const [name, pass] of checks) console.log(`${pass ? 'PASS' : 'FAIL'} ${name}`);
assert.ok(checks.every(([,pass])=>pass), 'One or more v68 integration checks failed.');
console.log(`v68 integration audit passed: ${checks.length}/${checks.length}.`);
