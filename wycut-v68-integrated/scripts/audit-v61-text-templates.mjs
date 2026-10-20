import fs from 'node:fs';
const tools=fs.readFileSync(new URL('../components/advanced-editor-tools.tsx',import.meta.url),'utf8');
const catalog=fs.readFileSync(new URL('../lib/editor/asset-catalog.ts',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../app/globals.css',import.meta.url),'utf8');
const checks=[
 ['text template categories and editable insertion',tools.includes('TEXT_TEMPLATES')&&tools.includes('p.onTextOverlayChange(t.sample)')&&tools.includes('p.onAnimationChange(t.animation)')],
 ['live animated template previews',tools.includes('wy-template-glow')&&tools.includes('Live preview · editable')],
 ['readable PRO badges',tools.includes('aria-label="Pro feature"')&&tools.includes('>PRO</span>')],
 ['expanded animation catalog',catalog.includes('Typewriter smooth')&&catalog.includes('End card glow')],
 ['live animation keyframes',css.includes('@keyframes wy-subscribe-pulse')&&css.includes('@keyframes wy-gradient-shimmer')&&css.includes('@keyframes wy-typewriter')],
];
for(const [name,ok] of checks) console.log(`${ok?'OK':'FAIL'} ${name}`);
if(checks.some(([,ok])=>!ok))process.exit(1);
console.log('WyCut v61 text-template static audit passed. This is not a production/runtime test.');
