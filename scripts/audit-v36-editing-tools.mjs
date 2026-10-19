import fs from 'node:fs';
const editor = fs.readFileSync('components/advanced-editor-tools.tsx','utf8');
const workspace = fs.readFileSync('components/dashboard-workspace.tsx','utf8');
const checks = [
  ['filter presets', /const FILTERS/.test(editor) && /Color filter/.test(editor)],
  ['transition selector', /TRANSITIONS/.test(editor) && /Transition after selected clip/.test(editor)],
  ['sticker badges', /Sticker badge/.test(editor) && /PLOT TWIST/.test(editor)],
  ['expanded sticker collection', /💎/.test(editor) && /TO BE CONTINUED/.test(editor)],
  ['preview filter applied', editor.includes('previewFilterForPlan({filter:p.effectPreset})') && editor.includes('previewEffectForPlan({effect:p.visualEffect})')],
  ['settings persisted to Drive manifest', /effectPreset, visualEffect, textAnimation, transition, sticker/.test(workspace)],
  ['settings restored from Drive manifest', workspace.includes("setEffectPreset(settings.effectPreset === 'none' ? 'Original' : settings.effectPreset)") && workspace.includes('setTransition(settings.transition)') && workspace.includes('setSticker(settings.sticker)') && workspace.includes('setVisualEffect(settings.visualEffect)') && workspace.includes('setTextAnimation(settings.textAnimation)')],
  ['honest export limitation shown', /Render\/export must apply overlays to the final MP4/.test(editor)],
];
let failed = false;
for (const [name, ok] of checks) { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`); if (!ok) failed = true; }
if (failed) process.exit(1);
