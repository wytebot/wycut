'use client';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import { normalizeEditPlan, videoFilterForPlan, audioFilterForPlan, type EditPlan } from '@/lib/editor/edit-plan';

let engine: FFmpeg | null = null;
let loadTask: Promise<FFmpeg> | null = null;
async function getEngine() {
  if (typeof window === 'undefined') throw new Error('Video export is only available in a browser or Capacitor WebView.');
  if (!engine) engine = new FFmpeg();
  if (!engine.loaded) {
    if (!loadTask) loadTask = (async () => {
      const base = '/ffmpeg';
      const coreURL = await toBlobURL(`${base}/ffmpeg-core.js`, 'text/javascript');
      const wasmURL = await toBlobURL(`${base}/ffmpeg-core.wasm`, 'application/wasm');
      await engine!.load({ coreURL, wasmURL }); return engine!;
    })().finally(() => { loadTask = null; });
    await loadTask;
  }
  return engine;
}
function makeOverlay(plan: ReturnType<typeof normalizeEditPlan>): Promise<Blob | null> {
  if (!plan.text?.value && !plan.emoji && !plan.sticker && !plan.watermark) return Promise.resolve(null);
  return new Promise(resolve => {
    const canvas = document.createElement('canvas'); const dimensions: Record<string,[number,number]> = {'9:16':[720,1280],'1:1':[720,720],'16:9':[1280,720],'4:5':[720,900]}; [canvas.width,canvas.height] = dimensions[plan.aspectRatio] || dimensions['9:16'];
    const ctx = canvas.getContext('2d'); if (!ctx) return resolve(null);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const y = plan.text?.position === 'top' ? canvas.height * .14 : plan.text?.position === 'bottom' ? canvas.height * .84 : canvas.height * .5;
    const text = [plan.text?.value, plan.emoji, plan.sticker].filter(Boolean).join(' ');
    if (text) {
      ctx.font = `900 ${Math.round(canvas.width * .063)}px ${/^[\w ,'-]{1,50}$/.test(plan.text?.font || '') ? plan.text?.font : 'sans-serif'}`;
      const maxWidth = canvas.width * .91; const words = text.split(/\s+/); const lines: string[] = []; let line = '';
      for (const word of words) { const candidate = line ? `${line} ${word}` : word; if (ctx.measureText(candidate).width > maxWidth && line) { lines.push(line); line = word; } else line = candidate; }
      if (line) lines.push(line); const lineHeight = canvas.width * .076; const startY = y - (lines.length - 1) * lineHeight / 2;
      lines.forEach((part, i) => { ctx.lineWidth = 10; ctx.strokeStyle = '#000'; ctx.strokeText(part, canvas.width / 2, startY + i * lineHeight, maxWidth); ctx.fillStyle = '#fff'; ctx.fillText(part, canvas.width / 2, startY + i * lineHeight, maxWidth); });
    }
    if (plan.watermark) { ctx.font = `bold ${Math.round(canvas.width * .026)}px sans-serif`; ctx.textAlign = 'right'; ctx.fillStyle = 'rgba(255,255,255,.88)'; ctx.fillText('WyCut', canvas.width - 18, canvas.height - 24); }
    canvas.toBlob(blob => resolve(blob), 'image/png');
  });
}
/**
 * Render the shared EditPlan into a real MP4. The WASM build cannot stream encoded output directly to native storage,
 * so the function deliberately applies conservative source-size guards instead of risking WebView OOM.
 */
export async function renderEditPlan(input: Blob, planInput: EditPlan | unknown, onProgress?: (percent: number) => void, shouldCancel?: () => boolean): Promise<Blob> {
  if (!input.size || !input.type.startsWith('video/')) throw new Error('Choose a valid video before exporting.');
  const native = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const limit = (native ? 90 : 220) * 1024 * 1024;
  if (input.size > limit) throw new Error(`This video is ${Math.round(input.size / 1024 / 1024)} MB. Safe in-browser rendering is limited to ${native ? '90 MB on mobile' : '220 MB in a browser'} to prevent memory crashes. Save the source to Drive and export a shorter/lower-resolution cut.`);
  const plan = normalizeEditPlan(planInput); const ff = await getEngine();
  const duration = await new Promise<number>(resolve => { const url = URL.createObjectURL(input); const v = document.createElement('video'); v.preload = 'metadata'; v.onloadedmetadata = () => { const d = Number.isFinite(v.duration) ? v.duration : 0; URL.revokeObjectURL(url); resolve(d); }; v.onerror = () => { URL.revokeObjectURL(url); resolve(0); }; v.src = url; });
  const inputName = `wycut_input_${Date.now()}.mp4`; const outputName = `wycut_render_${Date.now()}.mp4`; const overlayName = `wycut_overlay_${Date.now()}.png`;
  let handler: ((event: { progress: number }) => void) | null = null;
  try {
    if (shouldCancel?.()) throw new Error('Export cancelled.');
    await ff.writeFile(inputName, await fetchFile(input));
    const overlay = await makeOverlay(plan);
    let vf = videoFilterForPlan(plan);
    if (plan.fadeOutSeconds > 0 && duration > plan.fadeOutSeconds) vf = [vf, `fade=t=out:st=${Math.max(0, duration - plan.fadeOutSeconds).toFixed(3)}:d=${plan.fadeOutSeconds}`].filter(Boolean).join(',');
    const args = ['-i', inputName];
    if (overlay) { await ff.writeFile(overlayName, await fetchFile(overlay)); args.push('-i', overlayName); }
    const audio = audioFilterForPlan(plan, duration);
    if (overlay) { const chain = vf ? `[0:v]${vf}[base];[base][1:v]overlay=(W-w)/2:(H-h)/2:format=auto[vout]` : '[0:v][1:v]overlay=(W-w)/2:(H-h)/2:format=auto[vout]'; args.push('-filter_complex', chain); }
    else if (vf) args.push('-vf', vf);
    args.push('-map', overlay ? '[vout]' : '0:v:0', '-map', '0:a:0?', '-af', audio, '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', '-y', outputName);
    handler = ({ progress }) => onProgress?.(Math.max(0, Math.min(99, Math.round(progress * 100)))); ff.on('progress', handler);
    const code = await ff.exec(args);
    if (shouldCancel?.()) throw new Error('Export cancelled.');
    if (code !== 0) throw new Error('FFmpeg could not render this edit plan. Try a shorter MP4 with a supported codec.');
    const data = await ff.readFile(outputName); if (typeof data === 'string' || !data.length) throw new Error('Video export returned an empty file.');
    onProgress?.(100); return new Blob([new Uint8Array(data as Uint8Array)], { type: 'video/mp4' });
  } finally {
    if (handler) ff.off('progress', handler);
    for (const name of [inputName, outputName, overlayName]) { try { await ff.deleteFile(name); } catch { /* best effort cleanup */ } }
  }
}
export function cancelEditExport() { try { engine?.terminate(); } catch { /* no active engine */ } engine = null; loadTask = null; }
