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
    const canvas = document.createElement('canvas'); const dimensions: Record<string, Record<'720p'|'1080p'|'2K',[number,number]>> = {'9:16':{'720p':[720,1280],'1080p':[1080,1920],'2K':[1440,2560]},'1:1':{'720p':[720,720],'1080p':[1080,1080],'2K':[2048,2048]},'16:9':{'720p':[1280,720],'1080p':[1920,1080],'2K':[2560,1440]},'4:5':{'720p':[720,900],'1080p':[1080,1350],'2K':[2048,2560]}}; [canvas.width,canvas.height] = dimensions[plan.aspectRatio]?.[plan.exportQuality] || dimensions['9:16']['720p'];
    const ctx = canvas.getContext('2d'); if (!ctx) return resolve(null);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const x = canvas.width * (Number(plan.text?.x ?? 50) / 100);
    const y = canvas.height * (Number(plan.text?.y ?? (plan.text?.position === 'top' ? 15 : plan.text?.position === 'bottom' ? 85 : 50)) / 100);
    const text = [plan.text?.value, plan.emoji, plan.sticker].filter(Boolean).join(' ');
    if (text) { ctx.save(); ctx.translate(x, y); ctx.rotate((Number(plan.text?.rotation || 0) * Math.PI) / 180); ctx.scale(Number(plan.text?.scale || 1), Number(plan.text?.scale || 1)); ctx.translate(-x, -y);
      ctx.font = `900 ${Math.round(canvas.width * .063)}px ${/^[\w ,'-]{1,50}$/.test(plan.text?.font || '') ? plan.text?.font : 'sans-serif'}`;
      const maxWidth = canvas.width * .91; const words = text.split(/\s+/); const lines: string[] = []; let line = '';
      for (const word of words) { const candidate = line ? `${line} ${word}` : word; if (ctx.measureText(candidate).width > maxWidth && line) { lines.push(line); line = word; } else line = candidate; }
      if (line) lines.push(line); const lineHeight = canvas.width * .076; const startY = y - (lines.length - 1) * lineHeight / 2;
      lines.forEach((part, i) => { ctx.lineWidth = 10; ctx.strokeStyle = '#000'; ctx.strokeText(part, x, startY + i * lineHeight, maxWidth); ctx.fillStyle = '#fff'; ctx.fillText(part, x, startY + i * lineHeight, maxWidth); }); ctx.restore();
    }
    if (plan.watermark) { ctx.font = `bold ${Math.round(canvas.width * .026)}px sans-serif`; ctx.textAlign = 'right'; ctx.fillStyle = 'rgba(255,255,255,.88)'; ctx.fillText('WyCut', canvas.width - 18, canvas.height - 24); }
    canvas.toBlob(blob => resolve(blob), 'image/png');
  });
}
/** Filters/placement for supported animated text/sticker overlays. The overlay input is looped so these effects animate across frames. */
function overlayAnimation(animation: string | undefined, duration: number, width: number, height: number, xPercent = 50, yPercent = 50) {
  const filters: string[] = [];
  let x = `W*${(xPercent / 100).toFixed(3)}-w/2`; let y = `H*${(yPercent / 100).toFixed(3)}-h/2`;
  const slide = (direction: 'up' | 'down' | 'left' | 'right') => {
    const span = direction === 'up' || direction === 'down' ? 'H*0.28' : 'W*0.28';
    const sign = direction === 'up' || direction === 'left' ? '+' : '-';
    const expr = `if(lt(t\\,0.45)\\,${span}*(1-t/0.45)\\,0)`;
    if (direction === 'up' || direction === 'down') y = `H*${(yPercent / 100).toFixed(3)}-h/2${sign}${expr}`;
    else x = `W*${(xPercent / 100).toFixed(3)}-w/2${sign}${expr}`;
  };
  if (animation === 'Fade in' || animation === 'Blur in' || animation === 'Rise') filters.push('fade=t=in:st=0:d=0.45:alpha=1');
  if (animation === 'Fade out') filters.push(`fade=t=out:st=${Math.max(0, duration - 0.55).toFixed(3)}:d=0.55:alpha=1`);
  if (animation === 'Pop' || animation === 'Elastic' || animation === 'Rubber band' || animation === 'Typewriter') filters.push('fade=t=in:st=0:d=0.35:alpha=1');
  if (animation === 'Neon glow') filters.push(`eq=brightness='0.92+0.12*abs(sin(6*t))':eval=frame`);
  if (animation === 'Heart beat' || animation === 'Tada') filters.push(`eq=brightness='0.95+0.05*abs(sin(8*t))':eval=frame`);
  if (animation === 'Slide up' || animation === 'Rise') slide('up');
  if (animation === 'Slide down' || animation === 'Drop') slide('down');
  if (animation === 'Slide left') slide('left');
  if (animation === 'Slide right') slide('right');
  if (animation === 'Bounce') y = `H*${(yPercent / 100).toFixed(3)}-h/2+H*0.025*abs(sin(10*t))*if(lt(t\\,1)\\,1\\,0)`;
  if (animation === 'Swing' || animation === 'Wiggle' || animation === 'Wave') filters.push(`rotate='0.06*sin(8*t)':ow=${width}:oh=${height}:c=black@0`);
  if (animation === 'Spin in') filters.push(`rotate='(1-min(t/0.45\\,1))*PI':ow=${width}:oh=${height}:c=black@0`);
  if (animation === 'Flash' || animation === 'Flicker') filters.push(`eq=brightness='if(lt(t\\,0.8)\\,0.65+0.35*abs(sin(18*t))\\,1)':eval=frame`);
  return { filters, x, y };
}

/**
 * Render the shared EditPlan into a real MP4. The WASM build cannot stream encoded output directly to native storage,
 * so the function deliberately applies conservative source-size guards instead of risking WebView OOM.
 */
export async function renderEditPlan(input: Blob, planInput: EditPlan | unknown, onProgress?: (percent: number) => void, shouldCancel?: () => boolean): Promise<Blob> {
  const stillImage = input.type.startsWith('image/');
  if (!input.size || (!input.type.startsWith('video/') && !stillImage)) throw new Error('Choose a valid video or image before exporting.');
  if (stillImage && !['image/png','image/jpeg','image/webp'].includes(input.type)) throw new Error('Still-image video export supports PNG, JPEG and WebP images.');
  const native = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const limit = (native ? 90 : 220) * 1024 * 1024;
  if (input.size > limit) throw new Error(`This video is ${Math.round(input.size / 1024 / 1024)} MB. Safe in-browser rendering is limited to ${native ? '90 MB on mobile' : '220 MB in a browser'} to prevent memory crashes. Save the source to Drive and export a shorter/lower-resolution cut.`);
  const plan = normalizeEditPlan(planInput);
  const duration = stillImage ? 5 : await new Promise<number>(resolve => { const url = URL.createObjectURL(input); const v = document.createElement('video'); v.preload = 'metadata'; v.onloadedmetadata = () => { const d = Number.isFinite(v.duration) ? v.duration : 0; URL.revokeObjectURL(url); resolve(d); }; v.onerror = () => { URL.revokeObjectURL(url); resolve(0); }; v.src = url; });
  if (plan.exportQuality === '2K' && duration > (native ? 120 : 180)) throw new Error(`2K export is limited to ${native ? '2 minutes on mobile' : '3 minutes in a browser'} to protect memory and prevent app crashes. Choose 1080p for longer videos.`);
  if (plan.exportQuality === '2K' && input.size > (native ? 40 : 120) * 1024 * 1024) throw new Error(`2K export is limited to sources under ${native ? '40 MB on mobile' : '120 MB in a browser'} to protect memory. Choose 1080p for this video.`);
  const ff = await getEngine();
  const inputExt = stillImage ? (input.type === 'image/png' ? 'png' : input.type === 'image/webp' ? 'webp' : 'jpg') : 'mp4'; const inputName = `wycut_input_${Date.now()}.${inputExt}`; const outputName = `wycut_render_${Date.now()}.mp4`; const overlayName = `wycut_overlay_${Date.now()}.png`;
  let handler: ((event: { progress: number }) => void) | null = null;
  try {
    if (shouldCancel?.()) throw new Error('Export cancelled.');
    await ff.writeFile(inputName, await fetchFile(input));
    const overlay = await makeOverlay(plan);
    let vf = videoFilterForPlan(plan);
    const outDuration = duration / plan.speed;
    if (plan.fadeOutSeconds > 0 && outDuration > plan.fadeOutSeconds) vf = [vf, `fade=t=out:st=${Math.max(0, outDuration - plan.fadeOutSeconds).toFixed(3)}:d=${plan.fadeOutSeconds}`].filter(Boolean).join(',');
    const args = stillImage ? ['-loop', '1', '-framerate', '30', '-t', '5', '-i', inputName] : ['-i', inputName];
    if (overlay) { await ff.writeFile(overlayName, await fetchFile(overlay)); args.push('-loop', '1', '-framerate', '30', '-i', overlayName); }
    const audio = audioFilterForPlan(plan, outDuration);
    if (overlay) { const dimensions: Record<string, [number, number]> = { '9:16': [plan.exportQuality === '2K' ? 1440 : plan.exportQuality === '1080p' ? 1080 : 720, plan.exportQuality === '2K' ? 2560 : plan.exportQuality === '1080p' ? 1920 : 1280], '1:1': [plan.exportQuality === '2K' ? 2048 : plan.exportQuality === '1080p' ? 1080 : 720, plan.exportQuality === '2K' ? 2048 : plan.exportQuality === '1080p' ? 1080 : 720], '16:9': [plan.exportQuality === '2K' ? 2560 : plan.exportQuality === '1080p' ? 1920 : 1280, plan.exportQuality === '2K' ? 1440 : plan.exportQuality === '1080p' ? 1080 : 720], '4:5': [plan.exportQuality === '2K' ? 2048 : plan.exportQuality === '1080p' ? 1080 : 720, plan.exportQuality === '2K' ? 2560 : plan.exportQuality === '1080p' ? 1350 : 900] }; const [ow, oh] = dimensions[plan.aspectRatio] || dimensions['9:16']; const anim = overlayAnimation(plan.text?.animation, outDuration, ow, oh, Number(plan.text?.x ?? 50), Number(plan.text?.y ?? 50)); const overlayFilterChain = anim.filters.length ? anim.filters.join(',') : 'null'; const chain = `${vf ? `[0:v]${vf}[base];` : '[0:v]null[base];'}[1:v]${overlayFilterChain}[ov];[base][ov]overlay=x='${anim.x}':y='${anim.y}':format=auto:eof_action=repeat:shortest=1[vout]`; args.push('-filter_complex', chain); }
    else if (vf) args.push('-vf', vf);
    args.push('-map', overlay ? '[vout]' : '0:v:0', ...(stillImage ? ['-an'] : ['-map', '0:a:0?', '-af', audio]), '-c:v', 'libx264', '-preset', plan.exportQuality === '2K' ? 'veryfast' : 'ultrafast', '-crf', plan.exportQuality === '2K' ? '18' : plan.exportQuality === '1080p' ? '21' : '23', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', ...(overlay ? ['-shortest'] : []), ...(stillImage ? ['-t','5'] : []), '-y', outputName);
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
