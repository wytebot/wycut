import fs from 'node:fs';
import path from 'node:path';
const root = process.cwd();
const required = [
  'components/editor-v42-layout.tsx','hooks/useTimeline.ts','hooks/usePlayback.ts','hooks/useEditHistory.ts',
  'components/dashboard-workspace.tsx','MAPPING-v42.md','CHANGELOG-v42.md','ANDROID-MANUAL-QA-v42.md'
];
const missing = required.filter(f=>!fs.existsSync(path.join(root,f)));
if (missing.length) { console.error('Missing v42 editor files:',missing.join(', ')); process.exitCode=1; }
const layout = fs.readFileSync(path.join(root,'components/editor-v42-layout.tsx'),'utf8');
const components = ['EditorTopBar','PreviewStage','PlaybackBar','TrackRail','Timeline','ToolBar','ToolSheet','AIQuickSheet'];
const absent = components.filter(name=>!new RegExp(`function\\s+${name}\\b`).test(layout));
if(absent.length){console.error('Missing editor components:',absent.join(', '));process.exitCode=1;}
const allowed = new Set(['#080a10','#111521','#000','#fff','#000000','#ffffff']);
const files = ['components/editor-v42-layout.tsx','hooks/useTimeline.ts','hooks/usePlayback.ts','hooks/useEditHistory.ts'];
const hexes = new Set();
for(const file of files){const source=fs.readFileSync(path.join(root,file),'utf8');for(const match of source.matchAll(/#[0-9a-fA-F]{3,8}\b/g))hexes.add(match[0].toLowerCase());}
const newColors=[...hexes].filter(c=>!allowed.has(c));
if(newColors.length){console.error('Unexpected hex colors in new editor files:',newColors.join(', '));process.exitCode=1;}
if(!process.exitCode)console.log('v42 editor layout audit passed: required components/docs present; no unapproved hex colors in new editor files.');
