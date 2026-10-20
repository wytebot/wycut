import fs from 'node:fs';
const editor = fs.readFileSync('components/advanced-editor-tools.tsx','utf8') + fs.readFileSync('lib/editor/asset-catalog.ts','utf8');
const workspace = fs.readFileSync('components/dashboard-workspace.tsx','utf8');
const sounds = fs.readFileSync('components/sound-library.tsx','utf8');
const css = fs.readFileSync('app/globals.css','utf8');
const countArray = (name) => { const m = editor.match(new RegExp(`(?:export )?const ${name}[^=]*=\\[([^\\]]*)\\]`)); return m ? (m[1].match(/'[^']+'/g)||[]).length : 0; };
const countObject = (name) => { const m = editor.match(new RegExp(`(?:export )?const ${name}[^=]*=\\{([\\s\\S]*?)\\};`)); return m ? (m[1].match(/[A-Za-z][A-Za-z0-9]*:'[^']*'/g)||[]).length : 0; };
const checks = [
 ['30+ filter presets', countObject('FILTERS') >= 30],
 ['30+ visual effects', countObject('EFFECTS') >= 30],
 ['18 supported transition choices', countArray('TRANSITIONS') >= 18],
 ['expanded text animation catalog plus None option', countArray('ANIMATIONS') >= 30 && /'None'/.test(editor)],
 ['30 sticker choices', countArray('STICKERS') === 30],
 ['animation CSS keyframes exist', css.includes('@keyframes wy-neon') && css.includes('@keyframes wy-wave')],
 ['filters and effects apply in preview', workspace.includes('previewFilterForPlan({filter:effectPreset})') && workspace.includes('previewEffectForPlan({effect:visualEffect})')],
 ['text animation applies in preview', workspace.includes('ANIMATION_CSS[textAnimation]')],
 ['creative settings persist to Drive', workspace.includes('effectPreset, visualEffect, textAnimation, transition, sticker')],
 ['creative settings restore from Drive', workspace.includes('setVisualEffect(settings.visualEffect)') && workspace.includes('setTextAnimation(settings.textAnimation)')],
 ['audio comes from the device only (no built-in sound presets)', sounds.includes('readDeviceAudioTrack') && !sounds.includes('synthesize(') && !sounds.includes('presets')],
];
let failed=false; for(const [label,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${label}`);if(!ok)failed=true;} if(failed)process.exit(1);
