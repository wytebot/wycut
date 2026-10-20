/** Shared, versioned edit plan used by the preview, export renderer and Drive Project.json. */
export const EDIT_PLAN_VERSION = 1 as const;
export type EditPlan = {
  schemaVersion: typeof EDIT_PLAN_VERSION;
  exportQuality: '720p' | '1080p' | '2K';
  keyframes: { time: number; scale: number; rotation: number }[];
  transitionCuts: number[];
  aspectRatio: '9:16' | '1:1' | '16:9' | '4:5';
  filter: string;
  effect: string;
  transition: string;
  speed: number;
  volume: number;
  fadeInSeconds: number;
  fadeOutSeconds: number;
  mirror: boolean;
  crop: 'contain' | 'cover';
  text?: { value: string; animation: string; font: string; position: 'top' | 'center' | 'bottom'; x?: number; y?: number; scale?: number; rotation?: number };
  emoji?: string;
  sticker?: string;
  watermark: boolean;
  /** Non-destructive mask applied to a video overlay track during export. */
  overlayMask: { shape: 'none' | 'rectangle' | 'ellipse' | 'split'; x: number; y: number; width: number; height: number; feather: number; invert: boolean };
  /** Chroma-key settings for a video overlay track. */
  chromaKey: { enabled: boolean; color: string; similarity: number; blend: number };
  /** Manual background mask strokes, normalized to 0..100 canvas coordinates. */
  manualMaskStrokes: { mode: 'erase' | 'restore'; radius: number; points: { x: number; y: number }[] }[];
  /** Colour adjustments, each -100..100 (0 = unchanged). */
  adjust: Adjust;
};
export type Adjust = { brightness: number; contrast: number; saturation: number; temperature: number; sharpness: number; vignette: number };
export const NO_ADJUST: Adjust = { brightness: 0, contrast: 0, saturation: 0, temperature: 0, sharpness: 0, vignette: 0 };
export function normalizeAdjust(value: unknown): Adjust {
  const v = value && typeof value === 'object' ? value as Partial<Adjust> : {};
  const n = (x: unknown) => { const num = Number(x); return Number.isFinite(num) ? Math.round(Math.min(100, Math.max(-100, num))) : 0; };
  return { brightness: n(v.brightness), contrast: n(v.contrast), saturation: n(v.saturation), temperature: n(v.temperature), sharpness: Math.max(0, n(v.sharpness)), vignette: Math.max(0, n(v.vignette)) };
}
export function hasAdjust(a: Adjust): boolean { return Object.values(a).some(x => x !== 0); }
export const FREE_ASSETS = {
  filters: ['Original','Cinematic','Vivid','Monochrome','Warm','Cool','Vintage','Dream','Dramatic','Fade'],
  effects: ['None','Glow','Blur','Sharpen','Grain','Glitch','Chromatic','Vignette','Bloom','Soft'],
  animations: ['None','Fade in','Fade out','Pop','Bounce','Typewriter','Slide up','Slide down','Slide left','Slide right'],
  sounds: ['Background Music','Whoosh','Hit','Pop','Riser','Ambient','UI'],
  fonts: ['Inter','Arial','sans-serif','serif'],
} as const;
const FILTERS: Record<string,string> = {
  Original:'null', Cinematic:'eq=contrast=1.16:saturation=0.88:brightness=-0.02', Vivid:'eq=contrast=1.08:saturation=1.55',
  Monochrome:'hue=s=0,eq=contrast=1.12', Warm:'colorbalance=rs=0.08:gs=0.02:bs=-0.06', Cool:'colorbalance=rs=-0.05:gs=0.01:bs=0.08',
  Vintage:'curves=vintage', Dream:'eq=brightness=0.04:saturation=1.12:contrast=0.94', Dramatic:'eq=contrast=1.35:saturation=1.18:brightness=-0.08',
  Silver:'hue=s=0,eq=brightness=0.08:contrast=0.9', Cobalt:'colorbalance=rs=-0.05:gs=0:bs=0.1', Crimson:'colorbalance=rs=0.12:gs=0:bs=-0.05', Mint:'colorbalance=rs=-0.03:gs=0.06:bs=0.02', Lemon:'colorbalance=rs=0.08:gs=0.03:bs=-0.08', Midnight:'eq=brightness=-0.12:saturation=1.2, hue=h=10', Daylight:'eq=brightness=0.05:saturation=1.08', Cloudy:'eq=contrast=0.9:saturation=0.8', Polaroid:'curves=vintage,eq=contrast=0.95:saturation=0.8', BleachedFilm:'eq=contrast=1.2:saturation=0.55:brightness=0.08', CinemaBlue:'colorbalance=rs=-0.05:gs=0:bs=0.12', Candy:'hue=h=-12:s=1.6', Moody:'eq=brightness=-0.08:contrast=1.2:saturation=0.85', Autumn:'colorbalance=rs=0.08:gs=0.01:bs=-0.08', Spring:'hue=h=25:s=1.1', Lofi:'eq=saturation=0.7:contrast=0.9', Clean:'eq=contrast=1.04:saturation=1.04', SkinTone:'hue=h=-4:s=1.08',
  Fade:'eq=contrast=0.86:saturation=0.72:brightness=0.06', Noir:'hue=s=0,eq=contrast=1.45:brightness=-0.08', Golden:'colorbalance=rs=0.08:gs=0.02:bs=-0.08',
  Arctic:'colorbalance=rs=-0.08:gs=0:bs=0.1', Rose:'colorbalance=rs=0.1:gs=-0.02:bs=0.02', TealOrange:'colorbalance=rs=0.08:gs=-0.02:bs=0.08',
  Pastel:'eq=saturation=0.72:contrast=0.9:brightness=0.04', Bleach:'hue=s=0.25,eq=contrast=1.4', Matte:'eq=contrast=0.86:saturation=0.82:brightness=0.03',
  Sunset:'colorbalance=rs=0.12:gs=0.02:bs=-0.1', Forest:'colorbalance=rs=-0.02:gs=0.08:bs=-0.03', Ocean:'colorbalance=rs=-0.06:gs=0.01:bs=0.1',
  Lavender:'colorbalance=rs=0.05:gs=-0.03:bs=0.08', Amber:'colorbalance=rs=0.12:gs=0.03:bs=-0.08', Ice:'colorbalance=rs=-0.1:gs=0:bs=0.12',
  Neon:'eq=saturation=1.8:contrast=1.3', SoftFocus:'gblur=sigma=0.35', Bleak:'eq=saturation=0.55:brightness=-0.06:contrast=1.18',
  Bright:'eq=brightness=0.08:saturation=1.08', Punch:'eq=contrast=1.3:saturation=1.35', Retro:'curves=vintage',
};
Object.assign(FILTERS, {
  SoftPortrait:'eq=brightness=0.03:contrast=0.94:saturation=0.92', FilmWarm:'colorbalance=rs=0.08:gs=0.02:bs=-0.05', Studio:'eq=brightness=0.02:contrast=1.08:saturation=1.03',
  CityNight:'eq=brightness=-0.1:contrast=1.28:saturation=1.35', FoodPop:'eq=contrast=1.08:saturation=1.42:brightness=0.02', CleanSkin:'eq=brightness=0.02:contrast=0.97:saturation=0.94',
  BlueHour:'colorbalance=rs=-0.04:gs=0:bs=0.08,eq=brightness=-0.04', DreamyRose:'colorbalance=rs=0.06:gs=-0.01:bs=0.02,eq=brightness=0.03:saturation=1.12',
  Action:'eq=contrast=1.35:saturation=1.25', Documentary:'eq=saturation=0.78:contrast=1.12', GoldenHour:'colorbalance=rs=0.08:gs=0.02:bs=-0.06,eq=brightness=0.03',
  Wedding:'eq=brightness=0.03:saturation=0.82:contrast=0.94', CreatorPop:'eq=saturation=1.3:contrast=1.08', MatteCinema:'eq=contrast=0.92:saturation=0.86:brightness=0.01',
  DeepBlack:'hue=s=0,eq=contrast=1.65:brightness=-0.08', PastelPink:'colorbalance=rs=0.04:bs=0.03,eq=saturation=0.78:brightness=0.04',
  RetroGreen:'colorbalance=gs=0.06:bs=-0.02,eq=saturation=0.85', AmberNight:'colorbalance=rs=0.08:bs=-0.05,eq=brightness=-0.06', Snow:'eq=brightness=0.07:saturation=0.55', Tropical:'eq=saturation=1.4:brightness=0.02'
});
export function normalizeEditPlan(value: unknown): EditPlan {
  const v = value && typeof value === 'object' ? value as Partial<EditPlan> : {};
  const ratio = ['9:16','1:1','16:9','4:5'].includes(String(v.aspectRatio)) ? v.aspectRatio! : '9:16';
  const quality = ['720p', '1080p', '2K'].includes(String(v.exportQuality)) ? v.exportQuality! : '720p';
  const transitionCuts = Array.isArray(v.transitionCuts) ? v.transitionCuts.slice(0, 200).map((t: unknown) => Math.max(0, Math.min(24 * 60 * 60, Number(t) || 0))).sort((a, b) => a - b) : [];
  const clampPercent = (value: unknown, fallback: number) => { const n = Number(value); return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : fallback; };
  const keyframes = Array.isArray(v.keyframes) ? v.keyframes.slice(0, 500).map((k: any) => ({ time: Math.max(0, Math.min(24 * 60 * 60, Number(k?.time) || 0)), scale: Math.max(0.25, Math.min(3, Number(k?.scale) || 1)), rotation: Math.max(-360, Math.min(360, Number(k?.rotation) || 0)) })).sort((a, b) => a.time - b.time).filter((k, i, all) => i === 0 || k.time > all[i - 1].time + 0.001) : [];
  return { schemaVersion: EDIT_PLAN_VERSION, exportQuality: quality, keyframes, transitionCuts, aspectRatio: ratio, filter: String(v.filter || 'Original'), effect: String(v.effect || 'None'), transition: String(v.transition || 'Cut'),
    speed: Math.min(2, Math.max(0.25, Number(v.speed) || 1)), volume: Math.min(2, Math.max(0, Number(v.volume ?? 1))),
    fadeInSeconds: Math.min(5, Math.max(0, Number(v.fadeInSeconds) || 0)), fadeOutSeconds: Math.min(5, Math.max(0, Number(v.fadeOutSeconds) || 0)),
    mirror: Boolean(v.mirror), crop: v.crop === 'cover' ? 'cover' : 'contain',
    text: v.text && typeof v.text.value === 'string' ? { value: v.text.value.slice(0, 500), animation: String(v.text.animation || 'None'), font: String(v.text.font || 'Inter'), position: ['top','center','bottom'].includes(String(v.text.position)) ? v.text.position! : 'center', x: clampPercent(v.text.x, 50), y: clampPercent(v.text.y, v.text.position === 'top' ? 15 : v.text.position === 'bottom' ? 85 : 50), scale: Math.max(0.5, Math.min(2, Number(v.text.scale) || 1)), rotation: Math.max(-180, Math.min(180, Number(v.text.rotation) || 0)) } : undefined,
    emoji: typeof v.emoji === 'string' ? v.emoji.slice(0, 12) : '', sticker: typeof v.sticker === 'string' ? v.sticker.slice(0, 120) : '', watermark: Boolean(v.watermark), overlayMask: normalizeMask(v.overlayMask), chromaKey: normalizeChromaKey(v.chromaKey), manualMaskStrokes: normalizeManualMaskStrokes(v.manualMaskStrokes), adjust: normalizeAdjust(v.adjust) };
}

export type OverlayMask = EditPlan['overlayMask'];
export type ChromaKey = EditPlan['chromaKey'];
export function normalizeMask(value: unknown): OverlayMask {
  const v = value && typeof value === 'object' ? value as Partial<OverlayMask> : {};
  const n = (x: unknown, fallback: number) => { const a = Number(x); return Number.isFinite(a) ? a : fallback; };
  const shape = ['none','rectangle','ellipse','split'].includes(String(v.shape)) ? v.shape! : 'none';
  return { shape, x: Math.max(0, Math.min(100, n(v.x, 50))), y: Math.max(0, Math.min(100, n(v.y, 50))), width: Math.max(1, Math.min(100, n(v.width, 80))), height: Math.max(1, Math.min(100, n(v.height, 80))), feather: Math.max(0, Math.min(25, n(v.feather, 0))), invert: Boolean(v.invert) };
}
export function normalizeChromaKey(value: unknown): ChromaKey {
  const v = value && typeof value === 'object' ? value as Partial<ChromaKey> : {};
  const color = /^#[0-9a-fA-F]{6}$/.test(String(v.color || '')) ? String(v.color) : '#00ff00';
  const n = (x: unknown, fallback: number) => { const a = Number(x); return Number.isFinite(a) ? a : fallback; };
  return { enabled: Boolean(v.enabled), color, similarity: Math.max(0.01, Math.min(0.5, n(v.similarity, 0.12))), blend: Math.max(0, Math.min(0.5, n(v.blend, 0.08))) };
}

export type ManualMaskStroke = EditPlan['manualMaskStrokes'][number];
export function normalizeManualMaskStrokes(value: unknown): EditPlan['manualMaskStrokes'] {
  if (!Array.isArray(value)) return [];
  return value.slice(-200).map((raw: any) => ({
    mode: raw?.mode === 'restore' ? 'restore' as const : 'erase' as const,
    radius: Math.max(0.2, Math.min(15, Number(raw?.radius) || 2)),
    points: (Array.isArray(raw?.points) ? raw.points : []).slice(0, 1000).map((point: any) => ({ x: Math.max(0, Math.min(100, Number(point?.x) || 0)), y: Math.max(0, Math.min(100, Number(point?.y) || 0)) })),
  })).filter((stroke: ManualMaskStroke) => stroke.points.length > 0);
}

export function videoFilterForPlan(planValue: unknown): string {
  const p = normalizeEditPlan(planValue); const filters: string[] = [];
  const dimensions: Record<string, Record<'720p' | '1080p' | '2K', string>> = { '9:16': { '720p': '720:1280', '1080p': '1080:1920', '2K': '1440:2560' }, '1:1': { '720p': '720:720', '1080p': '1080:1080', '2K': '2048:2048' }, '16:9': { '720p': '1280:720', '1080p': '1920:1080', '2K': '2560:1440' }, '4:5': { '720p': '720:900', '1080p': '1080:1350', '2K': '2048:2560' } };
  const size = dimensions[p.aspectRatio]?.[p.exportQuality] || dimensions['9:16']['720p'];
  const [outW, outH] = size.split(':').map(Number);
  filters.push(`scale=${size}:force_original_aspect_ratio=increase`, `crop=${size}`, 'setsar=1');
  const f = FILTERS[p.filter]; if (f && f !== 'null') filters.push(f);
  filters.push(...adjustFilters(p.adjust));
  if (p.mirror) filters.push('hflip');
  const effects: Record<string,string> = { Glow:'eq=brightness=0.04:saturation=1.2', Blur:'gblur=sigma=1.2', Sharpen:'unsharp=5:5:0.8:3:3:0', Grain:'noise=alls=8:allf=t', Glitch:'hue=h=18,eq=contrast=1.25', Chromatic:'hue=h=8:s=1.2', Vignette:'vignette=PI/4', Bloom:'eq=brightness=0.06', Soft:'gblur=sigma=0.45', HighContrast:'eq=contrast=1.55', LowContrast:'eq=contrast=0.78', Fisheye:'lenscorrection=k1=-0.12:k2=0.03', Pixel:`scale=${Math.max(24,Math.round(outW/24))}:${Math.max(24,Math.round(outH/24))}:flags=neighbor,scale=${outW}:${outH}:flags=neighbor`, Ghost:'tblend=all_mode=average', Invert:'negate', Solarize:'negate,hue=s=1.3', Posterize:'elbg=codebook_length=16:nb_steps=1', Thermal:'hue=h=220:s=1.8', Underwater:'hue=h=40:s=0.85', Heatwave:'colorbalance=rs=0.1:bs=-0.08', LightLeak:'eq=brightness=0.08', LensFlare:'eq=brightness=0.12:contrast=1.05', MotionBlur:'tmix=frames=3:weights=1 0.5 0.25', Shimmer:'noise=alls=2:allf=t,eq=saturation=1.35:brightness=0.03', Duotone:'hue=s=0,colorbalance=rs=0.15:gs=0:bs=-0.1', Halftone:'edgedetect=low=0.1:high=0.4,eq=saturation=0.7', Edge:'format=gray,edgedetect=low=0.1:high=0.4', Dreamy:'gblur=sigma=0.25,eq=brightness=0.04', CCTV:'hue=s=0,eq=contrast=1.5:brightness=-0.08', Shake:`rotate='0.015*sin(25*t)':ow=${outW}:oh=${outH}:c=black`, RGBGlitch:'hue=h=25,eq=contrast=1.25', ZoomBlur:'gblur=sigma=0.8:steps=2', Flash:'eq=brightness=0.4', Flicker:`eq=brightness='0.95+0.08*sin(22*t)':eval=frame`, VHS:'noise=alls=4:allf=t,hue=h=-5:s=0.8,eq=contrast=1.15', RetroTV:'curves=vintage,eq=contrast=1.3:saturation=0.7', Comic:'edgedetect=low=0.1:high=0.4,eq=contrast=1.6:saturation=1.5', Sketch:'format=gray,edgedetect=low=0.1:high=0.4', DreamPop:'eq=saturation=1.5:brightness=0.08,gblur=sigma=0.15', NightVision:'hue=h=75:s=1.7,eq=contrast=1.2', Infrared:'hue=h=260:s=1.8', FadeFilm:'eq=contrast=0.9:saturation=0.7:brightness=0.08', PunchZoom:'eq=contrast=1.3:saturation=1.25' };
  if (effects[p.effect]) filters.push(effects[p.effect]);
  if (p.keyframes.length) {
    const points = p.keyframes.length && p.keyframes[0].time > 0.001 ? [{ time: 0, scale: 1, rotation: 0 }, ...p.keyframes] : p.keyframes;
    const expr = (field: 'scale' | 'rotation') => {
      if (points.length === 1) return String(points[0][field]);
      let result = String(points[points.length - 1][field]);
      for (let i = points.length - 2; i >= 0; i--) {
        const a = points[i], b = points[i + 1], dt = Math.max(0.001, b.time - a.time);
        result = `if(lt(t\\,${b.time.toFixed(3)})\\,${a[field].toFixed(4)}+(${(b[field] - a[field]).toFixed(4)})*(t-${a.time.toFixed(3)})/${dt.toFixed(3)}\\,${result})`;
      }
      return `if(lt(t\\,${points[0].time.toFixed(3)})\\,${points[0][field].toFixed(4)}\\,${result})`;
    };
    const maxScale = Math.max(1, ...points.map(k => k.scale));
    const scaleExpr = expr('scale');
    const rotationExpr = expr('rotation');
    filters.push(`scale=w='max(2\\,ceil(${outW}*(${scaleExpr})/2)*2)':h='max(2\\,ceil(${outH}*(${scaleExpr})/2)*2)':eval=frame`, `pad=w=${Math.ceil(outW * maxScale / 2) * 2}:h=${Math.ceil(outH * maxScale / 2) * 2}:x=(ow-iw)/2:y=(oh-ih)/2:color=black`, `crop=${outW}:${outH}`, `rotate='(${rotationExpr})*PI/180':ow=${outW}:oh=${outH}:c=black`);
  }
  if (p.fadeInSeconds > 0) filters.push(`fade=t=in:st=0:d=${p.fadeInSeconds}`);
  // Apply actual frame-level transitions at edited clip boundaries, not just in the preview.
  for (const cut of p.transitionCuts) {
    if (p.transition === 'Dissolve' || p.transition === 'Fade') { const d = p.transition === 'Fade' ? 0.28 : 0.12; filters.push(`fade=t=out:st=${Math.max(0, cut-d).toFixed(3)}:d=${d}`, `fade=t=in:st=${cut.toFixed(3)}:d=${d}`); }
    else if (p.transition === 'Flash') filters.push(`eq=brightness=0.9:enable='between(t\\,${cut.toFixed(3)}\\,${(cut + 0.10).toFixed(3)})'`);
    else if (p.transition === 'Glitch cut') filters.push(`hue=h=90:enable='between(t\\,${Math.max(0, cut-0.06).toFixed(3)}\\,${(cut + 0.06).toFixed(3)})'`);
    else if (p.transition === 'Zoom in' || p.transition === 'Zoom out') filters.push(`scale=w='ceil(${outW}*(1+0.12*between(t\\,${Math.max(0, cut-0.15).toFixed(3)}\\,${cut.toFixed(3)}))/2)*2':h='ceil(${outH}*(1+0.12*between(t\\,${Math.max(0, cut-0.15).toFixed(3)}\\,${cut.toFixed(3)}))/2)*2':eval=frame,crop=${outW}:${outH}`);
    else if (p.transition === 'Light leak') filters.push(`colorbalance=rs=0.4:gs=0.12:bs=-0.2:enable='between(t\\,${Math.max(0, cut-0.08).toFixed(3)}\\,${(cut+0.12).toFixed(3)})'`);
    else if (p.transition === 'Whip pan') filters.push(`rotate='0.08*PI':ow=${outW}:oh=${outH}:c=black:enable='between(t\\,${Math.max(0, cut-0.05).toFixed(3)}\\,${(cut+0.05).toFixed(3)})'`);
    else if (p.transition === 'Film burn') filters.push(`eq=brightness=0.65:saturation=1.6:enable='between(t\\,${Math.max(0, cut-0.08).toFixed(3)}\\,${(cut+0.12).toFixed(3)})'`);
    else if (p.transition === 'Blur' || p.transition === 'Zoom blur') filters.push(`gblur=sigma=${p.transition === 'Blur' ? '2.2' : '1.4'}:enable='between(t\\,${Math.max(0, cut-0.12).toFixed(3)}\\,${(cut+0.12).toFixed(3)})'`);
    else if (p.transition === 'Spin') filters.push(`rotate='0.16*PI':ow=${outW}:oh=${outH}:c=black:enable='between(t\\,${Math.max(0, cut-0.10).toFixed(3)}\\,${(cut+0.10).toFixed(3)})'`);
    else if (p.transition === 'Shake') filters.push(`rotate='0.025*sin(85*t)':ow=${outW}:oh=${outH}:c=black:enable='between(t\\,${Math.max(0, cut-0.10).toFixed(3)}\\,${(cut+0.10).toFixed(3)})'`);
    else if (p.transition === 'RGB split') filters.push(`hue=h=45:enable='between(t\\,${Math.max(0, cut-0.08).toFixed(3)}\\,${(cut+0.08).toFixed(3)})'`);
    else if (p.transition === 'Color flash') filters.push(`colorbalance=rs=0.3:bs=0.2:enable='between(t\\,${Math.max(0, cut-0.06).toFixed(3)}\\,${(cut+0.10).toFixed(3)})'`);
    else if (p.transition === 'White flash') filters.push(`eq=brightness=0.85:contrast=1.15:enable='between(t\\,${Math.max(0, cut-0.05).toFixed(3)}\\,${(cut+0.08).toFixed(3)})'`);
    else if (p.transition === 'Fade to black') { const d = 0.22; filters.push(`fade=t=out:st=${Math.max(0, cut-d).toFixed(3)}:d=${d}`, `fade=t=in:st=${cut.toFixed(3)}:d=${d}`); }
  }
  if (p.speed !== 1) filters.push(`setpts=${(1 / p.speed).toFixed(4)}*PTS`);
  return filters.join(',');
}
/** ffmpeg filters for the Adjust sliders. Order: exposure/colour first, then sharpness and vignette. */
export function adjustFilters(a: Adjust): string[] {
  const out: string[] = [];
  if (a.brightness || a.contrast || a.saturation) out.push(`eq=brightness=${(a.brightness / 250).toFixed(3)}:contrast=${(1 + a.contrast / 200).toFixed(3)}:saturation=${(1 + a.saturation / 100).toFixed(3)}`);
  if (a.temperature) { const t = (a.temperature / 400).toFixed(3); out.push(`colorbalance=rs=${t}:gs=0:bs=${(-a.temperature / 400).toFixed(3)}`); }
  if (a.sharpness > 0) out.push(`unsharp=5:5:${(a.sharpness / 50).toFixed(2)}:3:3:0`);
  if (a.vignette > 0) out.push(`vignette=a=${(Math.PI / 2 * a.vignette / 100).toFixed(3)}`);
  return out;
}
/** CSS filter that mirrors the Adjust sliders in the live preview (vignette is drawn separately). */
export function previewAdjustForPlan(value: unknown): string {
  const a = normalizeAdjust(value); const parts: string[] = [];
  if (a.brightness) parts.push(`brightness(${(1 + a.brightness / 200).toFixed(3)})`);
  if (a.contrast) parts.push(`contrast(${(1 + a.contrast / 200).toFixed(3)})`);
  if (a.saturation) parts.push(`saturate(${(1 + a.saturation / 100).toFixed(3)})`);
  if (a.temperature > 0) parts.push(`sepia(${(a.temperature / 250).toFixed(3)})`);
  if (a.temperature < 0) parts.push(`hue-rotate(${(a.temperature / 5).toFixed(1)}deg)`);
  return parts.join(' ');
}
export function audioFilterForPlan(planValue: unknown, duration = 0): string {
  const p = normalizeEditPlan(planValue); const filters = [`volume=${p.volume}`]; if (p.speed !== 1) { let rate = p.speed; while (rate < 0.5) { filters.push('atempo=0.5'); rate /= 0.5; } while (rate > 2) { filters.push('atempo=2'); rate /= 2; } if (Math.abs(rate - 1) > 0.001) filters.push(`atempo=${rate}`); } if (p.fadeInSeconds > 0) filters.push(`afade=t=in:st=0:d=${p.fadeInSeconds}`); if (p.fadeOutSeconds > 0 && duration > p.fadeOutSeconds) filters.push(`afade=t=out:st=${Math.max(0, duration - p.fadeOutSeconds).toFixed(3)}:d=${p.fadeOutSeconds}`); return filters.join(',');
}

const PREVIEW_FILTERS: Record<string,string> = { Original:'none', Cinematic:'contrast(1.16) saturate(.88) brightness(.94)', Vivid:'saturate(1.55) contrast(1.08)', Monochrome:'grayscale(1) contrast(1.12)', Warm:'sepia(.24) saturate(1.2) brightness(1.04)', Cool:'saturate(.86) hue-rotate(12deg) brightness(1.04)', Vintage:'sepia(.38) contrast(.92) saturate(.78)', Dream:'brightness(1.1) saturate(1.12) blur(.25px)', Dramatic:'contrast(1.35) saturate(1.18) brightness(.88)', Fade:'contrast(.86) saturate(.72) brightness(1.08)', Noir:'grayscale(1) contrast(1.45) brightness(.78)', Golden:'sepia(.28) saturate(1.45) contrast(1.05)', Arctic:'hue-rotate(28deg) saturate(.78) brightness(1.08)', Rose:'hue-rotate(-18deg) saturate(1.2)', TealOrange:'contrast(1.18) saturate(1.25) hue-rotate(-8deg)', Pastel:'saturate(.72) brightness(1.12) contrast(.9)', Bleach:'saturate(.25) contrast(1.4)', Matte:'contrast(.86) saturate(.82) brightness(1.06)', Sunset:'sepia(.18) saturate(1.55) hue-rotate(-8deg)', Forest:'hue-rotate(20deg) saturate(1.25)', Ocean:'hue-rotate(35deg) saturate(1.12)', Lavender:'hue-rotate(45deg) saturate(.92)', Amber:'sepia(.35) saturate(1.35)', Ice:'hue-rotate(155deg) saturate(.7) brightness(1.08)', Neon:'saturate(2) contrast(1.35)', SoftFocus:'blur(.35px) brightness(1.06) saturate(.9)', Bleak:'saturate(.55) brightness(.86) contrast(1.18)', Bright:'brightness(1.18) saturate(1.08)', Punch:'contrast(1.3) saturate(1.35)', Retro:'sepia(.2) contrast(1.08) saturate(.85)' , Silver:'grayscale(1) brightness(1.12) contrast(.9)', Cobalt:'hue-rotate(190deg) saturate(1.3)', Crimson:'hue-rotate(-35deg) saturate(1.35)', Mint:'hue-rotate(75deg) saturate(.8)', Lemon:'sepia(.2) hue-rotate(350deg) saturate(1.5)', Midnight:'brightness(.7) saturate(1.2) hue-rotate(15deg)', Daylight:'brightness(1.12) saturate(1.08)', Cloudy:'contrast(.9) saturate(.8)', Polaroid:'sepia(.12) contrast(.95) saturate(.8)', BleachedFilm:'contrast(1.2) saturate(.55) brightness(1.08)', CinemaBlue:'hue-rotate(170deg) saturate(.8) contrast(1.12)', Candy:'saturate(1.6) hue-rotate(-12deg)', Moody:'brightness(.82) contrast(1.2) saturate(.85)', Autumn:'sepia(.22) hue-rotate(-15deg) saturate(1.25)', Spring:'hue-rotate(25deg) saturate(1.1) brightness(1.06)', Lofi:'sepia(.12) saturate(.7) contrast(.9)', Clean:'contrast(1.04) saturate(1.04)', SkinTone:'saturate(1.08) hue-rotate(-4deg)'};
const PREVIEW_EFFECTS: Record<string,string> = { None:'none', Glow:'brightness(1.08) saturate(1.2)', Blur:'blur(1.2px)', Sharpen:'contrast(1.22) saturate(1.08)', Grain:'contrast(1.12) saturate(.88)', Glitch:'hue-rotate(35deg) contrast(1.3)', Chromatic:'hue-rotate(8deg) saturate(1.3)', Vignette:'brightness(.88) contrast(1.12)', Bloom:'brightness(1.13) blur(.2px)', Soft:'blur(.45px)', HighContrast:'contrast(1.55)', LowContrast:'contrast(.78)', Ghost:'opacity(.85) brightness(1.1)', Invert:'invert(1)', Solarize:'invert(.65) saturate(1.3)', Posterize:'contrast(1.4) saturate(1.4)', Thermal:'hue-rotate(220deg) saturate(1.8)', Underwater:'hue-rotate(40deg) saturate(.85) brightness(.92)', Heatwave:'sepia(.3) saturate(1.6)', LightLeak:'sepia(.12) brightness(1.12)', LensFlare:'brightness(1.18) contrast(1.05)', MotionBlur:'blur(.7px)', Shimmer:'saturate(1.35) brightness(1.05)', Duotone:'grayscale(.7) sepia(.25)', Halftone:'contrast(1.35) saturate(.7)', Edge:'grayscale(1) contrast(1.8)', Dreamy:'blur(.25px) brightness(1.1) saturate(1.15)', CCTV:'grayscale(1) contrast(1.5) brightness(.82)' , Fisheye:'saturate(1.2) contrast(1.1)', Pixel:'contrast(1.15)', Shake:'contrast(1.12) saturate(1.2)', RGBGlitch:'hue-rotate(25deg) contrast(1.25)', ZoomBlur:'blur(.8px) contrast(1.1)', Flash:'brightness(1.5)', Flicker:'contrast(1.2) brightness(1.08)', VHS:'saturate(.8) contrast(1.15) hue-rotate(-5deg)', RetroTV:'sepia(.15) contrast(1.3) saturate(.7)', Comic:'contrast(1.6) saturate(1.5)', Sketch:'grayscale(1) contrast(1.8)', DreamPop:'saturate(1.5) brightness(1.08) blur(.15px)', NightVision:'hue-rotate(75deg) saturate(1.7) contrast(1.2)', Infrared:'hue-rotate(260deg) saturate(1.8)', FadeFilm:'contrast(.9) saturate(.7) brightness(1.08)', PunchZoom:'contrast(1.3) saturate(1.25)'};
Object.assign(PREVIEW_FILTERS, {
  SoftPortrait:'brightness(1.03) contrast(.94) saturate(.92)', FilmWarm:'sepia(.12) saturate(1.22)', Studio:'brightness(1.02) contrast(1.08) saturate(1.03)',
  CityNight:'brightness(.9) contrast(1.28) saturate(1.35)', FoodPop:'contrast(1.08) saturate(1.42) brightness(1.02)', CleanSkin:'brightness(1.02) contrast(.97) saturate(.94)',
  BlueHour:'hue-rotate(18deg) saturate(.9) brightness(.96)', DreamyRose:'hue-rotate(-12deg) saturate(1.12) brightness(1.03)', Action:'contrast(1.35) saturate(1.25)',
  Documentary:'saturate(.78) contrast(1.12)', GoldenHour:'sepia(.16) saturate(1.32) brightness(1.03)', Wedding:'brightness(1.08) saturate(.82) contrast(.94)',
  CreatorPop:'saturate(1.3) contrast(1.08)', MatteCinema:'contrast(.92) saturate(.86) brightness(1.01)', DeepBlack:'grayscale(1) contrast(1.65) brightness(.92)',
  PastelPink:'hue-rotate(-18deg) saturate(.78) brightness(1.12)', RetroGreen:'sepia(.16) hue-rotate(28deg) saturate(.85)', AmberNight:'sepia(.25) saturate(1.18) brightness(.94)',
  Snow:'brightness(1.18) saturate(.55)', Tropical:'saturate(1.4) hue-rotate(12deg) brightness(1.04)'
});
Object.assign(PREVIEW_EFFECTS, {
  FilmGrain:'contrast(1.12) saturate(.88)', SoftGlow:'brightness(1.1) saturate(1.1) blur(.2px)', ColorShift:'hue-rotate(28deg) saturate(1.35)', DreamBlur:'blur(.6px) brightness(1.08)',
  OldFilm:'sepia(.22) contrast(1.1) saturate(.75)', BlueFlare:'hue-rotate(170deg) brightness(1.1)', RedFlash:'sepia(.3) saturate(1.7) contrast(1.2)',
  VHSNoise:'contrast(1.2) saturate(.8) hue-rotate(-8deg)', ComicInk:'grayscale(.25) contrast(1.55) saturate(1.2)', FadeGlow:'brightness(1.12) contrast(.9)',
  ColorPop:'saturate(1.55) contrast(1.12)', SoftVignette:'brightness(.92) contrast(1.08)', Prism:'hue-rotate(40deg) saturate(1.4)', FlashFrame:'brightness(1.55) contrast(1.15)',
  RetroGlow:'sepia(.16) brightness(1.08) saturate(1.15)', NightClub:'hue-rotate(250deg) saturate(1.6) contrast(1.25)', SoftFocusPlus:'blur(.7px) brightness(1.05)'
});
export function previewFilterForPlan(value: unknown): string { const p = normalizeEditPlan(value); return PREVIEW_FILTERS[p.filter] || 'none'; }
export function previewEffectForPlan(value: unknown): string { const p = normalizeEditPlan(value); return PREVIEW_EFFECTS[p.effect] || 'none'; }
