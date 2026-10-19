/** Shared, versioned edit plan used by the preview, export renderer and Drive Project.json. */
export const EDIT_PLAN_VERSION = 1 as const;
export type EditPlan = {
  schemaVersion: typeof EDIT_PLAN_VERSION;
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
  text?: { value: string; animation: string; font: string; position: 'top' | 'center' | 'bottom' };
  emoji?: string;
  sticker?: string;
  watermark: boolean;
};
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
  Fade:'eq=contrast=0.86:saturation=0.72:brightness=0.06', Noir:'hue=s=0,eq=contrast=1.45:brightness=-0.08', Golden:'colorbalance=rs=0.08:gs=0.02:bs=-0.08',
  Arctic:'colorbalance=rs=-0.08:gs=0:bs=0.1', Rose:'colorbalance=rs=0.1:gs=-0.02:bs=0.02', TealOrange:'colorbalance=rs=0.08:gs=-0.02:bs=0.08',
  Pastel:'eq=saturation=0.72:contrast=0.9:brightness=0.04', Bleach:'hue=s=0.25,eq=contrast=1.4', Matte:'eq=contrast=0.86:saturation=0.82:brightness=0.03',
  Sunset:'colorbalance=rs=0.12:gs=0.02:bs=-0.1', Forest:'colorbalance=rs=-0.02:gs=0.08:bs=-0.03', Ocean:'colorbalance=rs=-0.06:gs=0.01:bs=0.1',
  Lavender:'colorbalance=rs=0.05:gs=-0.03:bs=0.08', Amber:'colorbalance=rs=0.12:gs=0.03:bs=-0.08', Ice:'colorbalance=rs=-0.1:gs=0:bs=0.12',
  Neon:'eq=saturation=1.8:contrast=1.3', SoftFocus:'gblur=sigma=0.35', Bleak:'eq=saturation=0.55:brightness=-0.06:contrast=1.18',
  Bright:'eq=brightness=0.08:saturation=1.08', Punch:'eq=contrast=1.3:saturation=1.35', Retro:'curves=vintage',
};
export function normalizeEditPlan(value: unknown): EditPlan {
  const v = value && typeof value === 'object' ? value as Partial<EditPlan> : {};
  const ratio = ['9:16','1:1','16:9','4:5'].includes(String(v.aspectRatio)) ? v.aspectRatio! : '9:16';
  return { schemaVersion: EDIT_PLAN_VERSION, aspectRatio: ratio, filter: String(v.filter || 'Original'), effect: String(v.effect || 'None'), transition: String(v.transition || 'Cut'),
    speed: Math.min(2, Math.max(0.25, Number(v.speed) || 1)), volume: Math.min(2, Math.max(0, Number(v.volume ?? 1))),
    fadeInSeconds: Math.min(5, Math.max(0, Number(v.fadeInSeconds) || 0)), fadeOutSeconds: Math.min(5, Math.max(0, Number(v.fadeOutSeconds) || 0)),
    mirror: Boolean(v.mirror), crop: v.crop === 'cover' ? 'cover' : 'contain',
    text: v.text && typeof v.text.value === 'string' ? { value: v.text.value.slice(0, 500), animation: String(v.text.animation || 'None'), font: String(v.text.font || 'Inter'), position: ['top','center','bottom'].includes(String(v.text.position)) ? v.text.position! : 'center' } : undefined,
    emoji: typeof v.emoji === 'string' ? v.emoji.slice(0, 12) : '', sticker: typeof v.sticker === 'string' ? v.sticker.slice(0, 120) : '', watermark: Boolean(v.watermark) };
}
export function videoFilterForPlan(planValue: unknown): string {
  const p = normalizeEditPlan(planValue); const filters: string[] = [];
  const dimensions: Record<string,string> = {'9:16':'720:1280','1:1':'720:720','16:9':'1280:720','4:5':'720:900'};
  const size = dimensions[p.aspectRatio] || dimensions['9:16'];
  filters.push(`scale=${size}:force_original_aspect_ratio=increase`, `crop=${size}`, 'setsar=1');
  const f = FILTERS[p.filter]; if (f && f !== 'null') filters.push(f);
  if (p.mirror) filters.push('hflip');
  const effects: Record<string,string> = { Glow:'eq=brightness=0.04:saturation=1.2', Blur:'gblur=sigma=1.2', Sharpen:'unsharp=5:5:0.8:3:3:0', Grain:'noise=alls=8:allf=t', Glitch:'hue=h=18,eq=contrast=1.25', Chromatic:'hue=h=8:s=1.2', Vignette:'vignette=PI/4', Bloom:'eq=brightness=0.06', Soft:'gblur=sigma=0.45', HighContrast:'eq=contrast=1.55', LowContrast:'eq=contrast=0.78', Invert:'negate', Solarize:'negate,hue=s=1.3', Posterize:'eq=contrast=1.4:saturation=1.4', Thermal:'hue=h=220:s=1.8', Underwater:'hue=h=40:s=0.85', Heatwave:'colorbalance=rs=0.1:bs=-0.08', LightLeak:'eq=brightness=0.08', Dreamy:'gblur=sigma=0.25,eq=brightness=0.04', CCTV:'hue=s=0,eq=contrast=1.5:brightness=-0.08' };
  if (effects[p.effect]) filters.push(effects[p.effect]);
  if (p.speed !== 1) filters.push(`setpts=${(1 / p.speed).toFixed(4)}*PTS`);
  if (p.fadeInSeconds > 0) filters.push(`fade=t=in:st=0:d=${p.fadeInSeconds}`);
  return filters.join(',');
}
export function audioFilterForPlan(planValue: unknown, duration = 0): string {
  const p = normalizeEditPlan(planValue); const filters = [`volume=${p.volume}`]; if (p.speed !== 1) filters.push(`atempo=${p.speed}`); if (p.fadeInSeconds > 0) filters.push(`afade=t=in:st=0:d=${p.fadeInSeconds}`); if (p.fadeOutSeconds > 0 && duration > p.fadeOutSeconds) filters.push(`afade=t=out:st=${Math.max(0, duration - p.fadeOutSeconds).toFixed(3)}:d=${p.fadeOutSeconds}`); return filters.join(',');
}

const PREVIEW_FILTERS: Record<string,string> = { Original:'none', Cinematic:'contrast(1.16) saturate(.88) brightness(.94)', Vivid:'saturate(1.55) contrast(1.08)', Monochrome:'grayscale(1) contrast(1.12)', Warm:'sepia(.24) saturate(1.2) brightness(1.04)', Cool:'saturate(.86) hue-rotate(12deg) brightness(1.04)', Vintage:'sepia(.38) contrast(.92) saturate(.78)', Dream:'brightness(1.1) saturate(1.12) blur(.25px)', Dramatic:'contrast(1.35) saturate(1.18) brightness(.88)', Fade:'contrast(.86) saturate(.72) brightness(1.08)', Noir:'grayscale(1) contrast(1.45) brightness(.78)', Golden:'sepia(.28) saturate(1.45) contrast(1.05)', Arctic:'hue-rotate(28deg) saturate(.78) brightness(1.08)', Rose:'hue-rotate(-18deg) saturate(1.2)', TealOrange:'contrast(1.18) saturate(1.25) hue-rotate(-8deg)', Pastel:'saturate(.72) brightness(1.12) contrast(.9)', Bleach:'saturate(.25) contrast(1.4)', Matte:'contrast(.86) saturate(.82) brightness(1.06)', Sunset:'sepia(.18) saturate(1.55) hue-rotate(-8deg)', Forest:'hue-rotate(20deg) saturate(1.25)', Ocean:'hue-rotate(35deg) saturate(1.12)', Lavender:'hue-rotate(45deg) saturate(.92)', Amber:'sepia(.35) saturate(1.35)', Ice:'hue-rotate(155deg) saturate(.7) brightness(1.08)', Neon:'saturate(2) contrast(1.35)', SoftFocus:'blur(.35px) brightness(1.06) saturate(.9)', Bleak:'saturate(.55) brightness(.86) contrast(1.18)', Bright:'brightness(1.18) saturate(1.08)', Punch:'contrast(1.3) saturate(1.35)', Retro:'sepia(.2) contrast(1.08) saturate(.85)' };
const PREVIEW_EFFECTS: Record<string,string> = { None:'none', Glow:'brightness(1.08) saturate(1.2)', Blur:'blur(1.2px)', Sharpen:'contrast(1.22) saturate(1.08)', Grain:'contrast(1.12) saturate(.88)', Glitch:'hue-rotate(35deg) contrast(1.3)', Chromatic:'hue-rotate(8deg) saturate(1.3)', Vignette:'brightness(.88) contrast(1.12)', Bloom:'brightness(1.13) blur(.2px)', Soft:'blur(.45px)', HighContrast:'contrast(1.55)', LowContrast:'contrast(.78)', Ghost:'opacity(.85) brightness(1.1)', Invert:'invert(1)', Solarize:'invert(.65) saturate(1.3)', Posterize:'contrast(1.4) saturate(1.4)', Thermal:'hue-rotate(220deg) saturate(1.8)', Underwater:'hue-rotate(40deg) saturate(.85) brightness(.92)', Heatwave:'sepia(.3) saturate(1.6)', LightLeak:'sepia(.12) brightness(1.12)', LensFlare:'brightness(1.18) contrast(1.05)', MotionBlur:'blur(.7px)', Shimmer:'saturate(1.35) brightness(1.05)', Duotone:'grayscale(.7) sepia(.25)', Halftone:'contrast(1.35) saturate(.7)', Edge:'grayscale(1) contrast(1.8)', Dreamy:'blur(.25px) brightness(1.1) saturate(1.15)', CCTV:'grayscale(1) contrast(1.5) brightness(.82)' };
export function previewFilterForPlan(value: unknown): string { const p = normalizeEditPlan(value); return PREVIEW_FILTERS[p.filter] || 'none'; }
export function previewEffectForPlan(value: unknown): string { const p = normalizeEditPlan(value); return PREVIEW_EFFECTS[p.effect] || 'none'; }
