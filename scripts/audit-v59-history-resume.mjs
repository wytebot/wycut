import fs from 'node:fs';
const checks = [
  ['lib/projects/store.ts', /sourceBlob\?: Blob/, 'IndexedDB record persists original source blob'],
  ['lib/projects/store.ts', /editState\?: Record<string, unknown>/, 'IndexedDB record persists edit settings'],
  ['components/history-view.tsx', /requestOpenProject\(p\.id\); router\.push\('\/dashboard'\)/, 'History Open navigates to the editor'],
  ['components/dashboard-workspace.tsx', /sourceBlob: candidate/, 'Source is saved at initial selection'],
  ['components/dashboard-workspace.tsx', /timelineAssetsData: timelineAssets\.map/, 'Timeline media assets are persisted'],
  ['components/dashboard-workspace.tsx', /videoOverlayData: videoOverlay \?/, 'Video overlay is persisted'],
  ['components/dashboard-workspace.tsx', /soundTracksData: soundTracks/, 'Audio tracks are persisted'],
  ['components/dashboard-workspace.tsx', /record\.sourceBlob\) setVideo\(new File/, 'Original source restores from history'],
  ['components/dashboard-workspace.tsx', /record\.editState \|\| \{\}/, 'Edit state is restored'],
  ['components/dashboard-workspace.tsx', /record\.clipsData\?\.length/, 'Reasonably sized generated clips restore'],
  ['components/dashboard-workspace.tsx', /const retainGeneratedOutputs = generatedOutputBytes <= 60 \* 1024 \* 1024/, 'Generated output persistence is bounded'],
  ['components/dashboard-workspace.tsx', /Continue editing without starting over/, 'Successful local restore feedback is present'],
];
let failed = false;
for (const [file, pattern, label] of checks) {
  if (pattern.test(fs.readFileSync(file, 'utf8'))) console.log(`OK ${label}`);
  else { console.error(`FAIL ${label}`); failed = true; }
}
if (failed) process.exit(1);
console.log('WyCut v59 history-resume static audit passed. This does not replace browser/APK runtime testing.');
