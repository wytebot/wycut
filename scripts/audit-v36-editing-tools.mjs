import fs from 'node:fs';
const editor = fs.readFileSync('components/advanced-editor-tools.tsx','utf8') + fs.readFileSync('lib/editor/asset-catalog.ts','utf8');
const workspace = fs.readFileSync('components/dashboard-workspace.tsx','utf8');
const checks = [
  ['filter presets', /const FILTERS/.test(editor) && /'Filters'/.test(editor)],
  ['transition selector', /TRANSITIONS/.test(editor) && /Applies after the selected clip/.test(editor)],
  ['sticker badges', /STICKERS/.test(editor) && /PLOT TWIST/.test(editor)],
  ['expanded sticker collection', /💎/.test(editor) && /TO BE CONTINUED/.test(editor)],
  ['preview filter applied', workspace.includes('previewFilterForPlan({filter:effectPreset})') && workspace.includes('previewEffectForPlan({effect:visualEffect})')],
  ['settings persisted to Drive manifest', /effectPreset, visualEffect, textAnimation, transition, sticker/.test(workspace)],
  ['settings restored from Drive manifest', workspace.includes("setEffectPreset(settings.effectPreset === 'none' ? 'Original' : settings.effectPreset)") && workspace.includes('setTransition(settings.transition)') && workspace.includes('setSticker(settings.sticker)') && workspace.includes('setVisualEffect(settings.visualEffect)') && workspace.includes('setTextAnimation(settings.textAnimation)')],
];
let failed = false;
for (const [name, ok] of checks) { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`); if (!ok) failed = true; }
if (failed) process.exit(1);
