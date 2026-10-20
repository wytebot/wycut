import fs from 'node:fs';
const root=new URL('../',import.meta.url);
const catalog=fs.readFileSync(new URL('../lib/editor/asset-catalog.ts',import.meta.url),'utf8');
const tools=fs.readFileSync(new URL('../components/advanced-editor-tools.tsx',import.meta.url),'utf8');
const plan=fs.readFileSync(new URL('../lib/editor/edit-plan.ts',import.meta.url),'utf8');
const pricing=JSON.parse(fs.readFileSync(new URL('../config/credit-pricing.json',import.meta.url),'utf8'));
const css=fs.readFileSync(new URL('../app/globals.css',import.meta.url),'utf8');
const checks=[
 ['expanded creator text templates',tools.includes('Road to 1K')&&tools.includes('Breaking Update')&&tools.includes('Cinematic Title')],
 ['template PRO badge and unlock flow',tools.includes('t.premium||isPremium(\'animation\',t.animation)')&&tools.includes('applyAsset(\'animation\',t.animation,apply)')],
 ['new filters exist in catalog and export map',catalog.includes('GoldenHour')&&plan.includes("GoldenHour:'colorbalance=")],
 ['new effects are selectable and preview mapped',catalog.includes('NightClub')&&plan.includes('SoftFocusPlus')],
 ['premium inventory includes added assets',pricing.editorAssets.premium.animations.includes('Digital scan')&&pricing.editorAssets.premium.filters.includes('GoldenHour')&&pricing.editorAssets.premium.effects.includes('NightClub')],
 ['animated keyframes exist for added templates',css.includes('@keyframes wy-ticker')&&css.includes('@keyframes wy-digital-scan')&&css.includes('@keyframes wy-social-pop')],
];
for(const [name,ok] of checks) console.log(`${ok?'OK':'FAIL'} ${name}`);
if(checks.some(([,ok])=>!ok))process.exit(1);
console.log('WyCut v62 creator-tools static audit passed. This is not a production/runtime test.');
