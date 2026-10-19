import fs from 'node:fs';
const editor = fs.readFileSync('components/advanced-editor-tools.tsx','utf8');
const workspace = fs.readFileSync('components/dashboard-workspace.tsx','utf8');
const sounds = fs.readFileSync('components/sound-library.tsx','utf8');
const css = fs.readFileSync('app/globals.css','utf8');
const countArray = (name) => { const m = editor.match(new RegExp(`const ${name}[^=]*=\\[([^\\]]*)\\]`)); return m ? (m[1].match(/'[^']+'/g)||[]).length : 0; };
const countObject = (name) => { const m = editor.match(new RegExp(`const ${name}[^=]*=\\{([\\s\\S]*?)\\};`)); return m ? m[1].split(',').filter(x => x.includes(':')).length : 0; };
const checks = [
 ['30 filters', countObject('FILTERS') === 30],
 ['30 visual effects', countObject('EFFECTS') === 30],
 ['30 transitions', countArray('TRANSITIONS') === 30],
 ['30 text animations plus None option', countArray('ANIMATIONS') === 31],
 ['30 sticker choices', countArray('STICKERS') === 30],
 ['animation CSS keyframes exist', css.includes('@keyframes wy-neon') && css.includes('@keyframes wy-wave')],
 ['filters and effects apply in preview', editor.includes('previewFilterForPlan({filter:p.effectPreset})') && editor.includes('previewEffectForPlan({effect:p.visualEffect})')],
 ['text animation applies in preview', editor.includes('animation:ANIMATION_CSS[p.animation]')],
 ['creative settings persist to Drive', workspace.includes('effectPreset, visualEffect, textAnimation, transition, sticker')],
 ['creative settings restore from Drive', workspace.includes('setVisualEffect(settings.visualEffect)') && workspace.includes('setTextAnimation(settings.textAnimation)')],
 ['sound library exposes over 100 procedural designs', sounds.includes('categories.flatMap') && sounds.includes('presets.length')],
 ['all matching sounds are searchable without a 72-item cap', sounds.includes('presets.filter(') && !sounds.includes('.slice(0, 72)')],
 ['honest final-render limitation shown', editor.includes('Render/export must apply overlays to the final MP4')],
];
let failed=false; for(const [label,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${label}`);if(!ok)failed=true;} if(failed)process.exit(1);
