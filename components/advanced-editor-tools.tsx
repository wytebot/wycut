'use client';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { ArrowLeft, ArrowRight, ChevronLeft, ChevronRight, Copy, Crop, FlipHorizontal, Gauge, Maximize2, Scissors, ShieldCheck, Trash2, Timer, Volume2 } from 'lucide-react';
import type { RecapScript, NarrativeBeat } from '@/lib/ai/script-generator';
import { unlockPremiumEditorAsset, type PremiumAssetCategory } from '@/lib/editor/unlock-premium-asset';
import { EMOJIS, FILTERS, EFFECTS, TRANSITIONS, ANIMATIONS, STICKERS, FONT_CHOICES, PREMIUM_STICKER_PACKS } from '@/lib/editor/asset-catalog';
import pricing from '@/config/credit-pricing.json';
import { NO_ADJUST, type Adjust } from '@/lib/editor/edit-plan';
import { trimEdge, frameDuration } from '@/lib/editor/manual-cuts';

export type EditorSection = 'edit' | 'text' | 'stickers' | 'effects' | 'canvas' | 'adjust';
type Props = {
  section: EditorSection; script: RecapScript | null; onScriptChange: (s: RecapScript) => void; selected: number; onSelect: (i: number) => void;
  watermark: boolean; onWatermarkChange: (v: boolean) => void; mirror: boolean; onMirrorChange: (v: boolean) => void; crop: string; onCropChange: (v: string) => void;
  textOverlay: string; onTextOverlayChange: (v: string) => void; emoji: string; onEmojiChange: (v: string) => void; font: string; onFontChange: (v: string) => void;
  aspectRatio: string; onAspectRatioChange: (v: '9:16' | '16:9' | '1:1' | '4:5') => void; applyAspectRatio: boolean; onApplyAspectRatioChange: (v: boolean) => void;
  playbackRate: string; onPlaybackRateChange: (v: string) => void; thumb?: string;
  effectPreset: string; onEffectPresetChange: (v: string) => void; transition: string; onTransitionChange: (v: string) => void; sticker: string; onStickerChange: (v: string) => void;
  animation: string; onAnimationChange: (v: string) => void; visualEffect: string; onVisualEffectChange: (v: string) => void; disabled?: boolean;
  onSplitAtPlayhead: () => void; onFrameStep: (frames: number) => void; fps: number; videoDuration: number;
  adjust: Adjust; onAdjustChange: (a: Adjust) => void; clipVolume: number; onClipVolumeChange: (v: number) => void; fadeIn: number; onFadeInChange: (v: number) => void; fadeOut: number; onFadeOutChange: (v: number) => void;
};
const PREMIUM_KEY: Record<PremiumAssetCategory, string> = { font: 'fonts', animation: 'animations', sound: 'sounds', filter: 'filters', effect: 'effects', transition: 'transitions', sticker: 'stickers' };
const SPEEDS = ['0.5', '0.75', '1', '1.25', '1.5', '2'];

function Row({ children }: { children: ReactNode }) { return <div className="flex gap-2 overflow-x-auto pb-1" style={{ touchAction: 'pan-x', overscrollBehaviorX: 'contain' }}>{children}</div>; }
function Action({ icon, label, onClick, disabled, active }: { icon: ReactNode; label: string; onClick: () => void; disabled?: boolean; active?: boolean }) {
  return <button type="button" onClick={onClick} disabled={disabled} className={`flex min-h-[58px] min-w-[62px] shrink-0 flex-col items-center justify-center gap-1 rounded-xl px-2 text-[11px] disabled:opacity-30 ${active ? 'bg-violet-500/25 text-violet-100' : 'text-slate-200'}`}>{icon}<span>{label}</span></button>;
}
function Slider({ label, value, min, max, step = 1, unit = '', onChange }: { label: string; value: number; min: number; max: number; step?: number; unit?: string; onChange: (v: number) => void }) {
  return <label className="flex items-center gap-3 text-xs text-slate-300"><span className="w-20 shrink-0">{label}</span><input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(Number(e.target.value))} className="h-10 min-w-0 flex-1 accent-violet-400" /><span className="w-12 shrink-0 text-right tabular-nums text-white">{value}{unit}</span></label>;
}
function Tabs({ tabs, value, onChange }: { tabs: string[]; value: string; onChange: (v: string) => void }) {
  return <div className="mb-2 flex gap-5 border-b border-white/10 text-sm">{tabs.map(t => <button key={t} type="button" onClick={() => onChange(t)} className={`-mb-px min-h-10 border-b-2 px-1 font-bold ${value === t ? 'border-violet-400 text-white' : 'border-transparent text-slate-400'}`}>{t}</button>)}</div>;
}
function Tile({ label, active, premium, onClick, thumb, css, children }: { label: string; active: boolean; premium?: boolean; onClick: () => void; thumb?: string; css?: string; children?: ReactNode }) {
  return <button type="button" onClick={onClick} className="flex w-[68px] shrink-0 flex-col items-center gap-1 text-[11px] text-slate-300">
    <span className={`relative grid h-[68px] w-[68px] place-items-center overflow-hidden rounded-xl bg-gradient-to-br from-violet-500/30 to-[#111521] ${active ? 'ring-2 ring-violet-300' : 'ring-1 ring-white/10'}`}>
      {thumb ? <img src={thumb} alt="" className="h-full w-full object-cover" style={{ filter: css && css !== 'none' ? css : undefined }} /> : children}
      {premium && <span aria-label="Premium" className="absolute right-1 top-1 rounded bg-black/70 px-1 text-[10px] text-violet-200">◇</span>}
    </span>
    <span className="w-full truncate text-center">{label}</span>
  </button>;
}

export default function AdvancedEditorTools(p: Props) {
  const [assetNotice, setAssetNotice] = useState(''); const [assetBusy, setAssetBusy] = useState(false);
  const [effectTab, setEffectTab] = useState('Filters'); const [stickerTab, setStickerTab] = useState('Stickers'); const [textTab, setTextTab] = useState('Text'); const [editSub, setEditSub] = useState<'' | 'trim' | 'speed' | 'volume'>('');
  const beat = p.script?.beats[p.selected] || null;
  const premiumAssets = pricing.editorAssets.premium as Record<string, string[]>;
  const assetCosts = pricing.editorAssets.premiumUnlockCosts as Record<string, number>;
  const isPremium = (category: PremiumAssetCategory, asset: string) => (premiumAssets[PREMIUM_KEY[category]] || []).includes(asset);
  // Premium items ask before spending credits. Items already unlocked on this device apply with no prompt.
  const [pending, setPending] = useState<{ category: PremiumAssetCategory; asset: string; apply: () => void } | null>(null);
  const [owned, setOwned] = useState<Set<string>>(() => { try { return new Set<string>(JSON.parse(localStorage.getItem('wycut_owned_assets') || '[]')); } catch { return new Set<string>(); } });
  async function runUnlock(category: PremiumAssetCategory, asset: string, apply: () => void) {
    setPending(null); setAssetBusy(true); setAssetNotice('Checking premium access…');
    try {
      const result = await unlockPremiumEditorAsset(category, asset); apply();
      const next = new Set(owned); next.add(`${category}:${asset}`); setOwned(next); try { localStorage.setItem('wycut_owned_assets', JSON.stringify([...next])); } catch { /* storage unavailable */ }
      setAssetNotice(result.alreadyOwned ? '' : `Unlocked ${asset} for ${assetCosts[category]} credits. Balance: ${result.credits}.`);
    } catch (error) { setAssetNotice(error instanceof Error ? error.message : 'Could not unlock this premium item.'); }
    finally { setAssetBusy(false); }
  }
  function applyAsset(category: PremiumAssetCategory, asset: string, apply: () => void) {
    if (!isPremium(category, asset)) { apply(); setAssetNotice(''); return; }
    if (owned.has(`${category}:${asset}`)) { void runUnlock(category, asset, apply); return; }
    setAssetNotice(''); setPending({ category, asset, apply });
  }
  const busy = assetBusy || Boolean(p.disabled);
  function reindex(beats: NarrativeBeat[]) { return beats.map((b, i) => ({ ...b, index: i + 1 })); }
  function updateBeat(patch: Partial<NarrativeBeat>) { if (!p.script || !beat) return; p.onScriptChange({ ...p.script, beats: p.script.beats.map((b, i) => (i === p.selected ? { ...b, ...patch } : b)) }); }
  function move(from: number, to: number) { if (!p.script || from === to || to < 0 || to >= p.script.beats.length) return; const beats = [...p.script.beats]; const [item] = beats.splice(from, 1); beats.splice(to, 0, item); p.onScriptChange({ ...p.script, beats: reindex(beats) }); p.onSelect(to); }
  function remove() { if (!p.script || !beat) return; if (p.script.beats.length <= 1) { setAssetNotice('Keep at least one clip.'); return; } const beats = p.script.beats.filter((_, i) => i !== p.selected); p.onScriptChange({ ...p.script, beats: reindex(beats) }); p.onSelect(Math.min(p.selected, beats.length - 1)); }
  function duplicate() { if (!p.script || !beat) return; const beats = [...p.script.beats]; beats.splice(p.selected + 1, 0, { ...beat, id: `${beat.id}_copy${Date.now() % 10000}`, title: `${beat.title} (copy)` }); p.onScriptChange({ ...p.script, beats: reindex(beats) }); p.onSelect(p.selected + 1); }
  const nudge = (key: 'startSeconds' | 'endSeconds', delta: number) => { if (!p.script || !beat) return; const segs = p.script.beats.map(x => ({ start: x.startSeconds, end: x.endSeconds })); const edge = key === 'startSeconds' ? 'start' : 'end'; const next = trimEdge(segs, p.selected, edge, beat[key] + delta, p.videoDuration || beat.endSeconds + 1, p.fps); if (next === segs) return; updateBeat({ startSeconds: next[p.selected].start, endSeconds: next[p.selected].end }); };
  const noClips = !p.script || !beat;

  const notice = <>{pending && <div role="alertdialog" aria-label="Unlock premium item" className="mb-2 flex items-center justify-between gap-2 rounded-xl bg-violet-500/15 px-3 py-2 text-xs text-violet-100"><span className="min-w-0">Unlock <strong>{pending.asset}</strong> for {assetCosts[pending.category]} credits? You only pay once.</span><span className="flex shrink-0 gap-1.5"><button type="button" onClick={() => setPending(null)} className="min-h-9 rounded-lg bg-white/10 px-3">Not now</button><button type="button" onClick={() => void runUnlock(pending.category, pending.asset, pending.apply)} className="min-h-9 rounded-lg bg-violet-500 px-3 font-bold text-white">Unlock</button></span></div>}{(assetNotice || assetBusy) && <p role="status" className="mb-2 rounded-lg bg-violet-500/10 px-2 py-1.5 text-xs text-violet-100">{assetBusy ? 'Checking premium access…' : assetNotice}</p>}</>;

  if (p.section === 'edit') return <div>{notice}
    <Row>
      <Action icon={<Scissors size={21} />} label="Split" onClick={p.onSplitAtPlayhead} disabled={noClips || busy} />
      <Action icon={<Trash2 size={21} />} label="Delete" onClick={remove} disabled={noClips} />
      <Action icon={<Copy size={21} />} label="Duplicate" onClick={duplicate} disabled={noClips} />
      <Action icon={<ArrowLeft size={21} />} label="Move back" onClick={() => move(p.selected, p.selected - 1)} disabled={noClips || p.selected === 0} />
      <Action icon={<ArrowRight size={21} />} label="Move on" onClick={() => move(p.selected, p.selected + 1)} disabled={noClips || !p.script || p.selected >= p.script.beats.length - 1} />
      <Action icon={<Timer size={21} />} label="Trim" onClick={() => setEditSub(editSub === 'trim' ? '' : 'trim')} disabled={noClips} active={editSub === 'trim'} />
      <Action icon={<Gauge size={21} />} label="Speed" onClick={() => setEditSub(editSub === 'speed' ? '' : 'speed')} active={editSub === 'speed'} />
      <Action icon={<Volume2 size={21} />} label="Volume" onClick={() => setEditSub(editSub === 'volume' ? '' : 'volume')} active={editSub === 'volume'} />
      <Action icon={<FlipHorizontal size={21} />} label="Mirror" onClick={() => p.onMirrorChange(!p.mirror)} active={p.mirror} />
      <Action icon={<Crop size={21} />} label={p.crop === 'cover' ? 'Fill' : 'Fit'} onClick={() => p.onCropChange(p.crop === 'cover' ? 'contain' : 'cover')} active={p.crop === 'cover'} />
    </Row>
    {noClips && <p className="mt-2 text-xs text-slate-400">Open a video to start cutting.</p>}
    {editSub === 'trim' && beat && <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-300">
      {([['Start', 'startSeconds'], ['End', 'endSeconds']] as const).map(([label, key]) => <div key={key} className="rounded-xl bg-black/25 px-2 py-1.5"><div className="mb-1 tabular-nums">{label} {beat[key].toFixed(2)}s</div><div className="flex gap-1">
        <button type="button" aria-label={`${label} back 1 frame`} onClick={() => nudge(key, -frameDuration(p.fps))} className="grid h-10 flex-1 place-items-center rounded-lg bg-white/10"><ChevronLeft size={16} /></button>
        <button type="button" aria-label={`${label} forward 1 frame`} onClick={() => nudge(key, frameDuration(p.fps))} className="grid h-10 flex-1 place-items-center rounded-lg bg-white/10"><ChevronRight size={16} /></button>
        <button type="button" aria-label={`${label} back half a second`} onClick={() => nudge(key, -0.5)} className="h-10 flex-1 rounded-lg bg-white/10">−.5s</button>
        <button type="button" aria-label={`${label} forward half a second`} onClick={() => nudge(key, 0.5)} className="h-10 flex-1 rounded-lg bg-white/10">+.5s</button></div></div>)}
      <p className="col-span-2 text-[11px] text-slate-500">Arrows move by one frame. You can also drag the white handles on the timeline.</p>
    </div>}
    {editSub === 'speed' && <div className="mt-2"><Row>{SPEEDS.map(s => <button key={s} type="button" onClick={() => p.onPlaybackRateChange(s)} className={`min-h-11 min-w-14 shrink-0 rounded-xl px-3 text-sm font-bold ${p.playbackRate === s ? 'bg-violet-500 text-white' : 'bg-white/5 text-slate-300'}`}>{s}×</button>)}</Row><p className="mt-1 text-[11px] text-slate-500">Speed applies to the whole video, in the preview and the export.</p></div>}
    {editSub === 'volume' && <div className="mt-2 space-y-1"><Slider label="Volume" value={p.clipVolume} min={0} max={200} unit="%" onChange={p.onClipVolumeChange} /><Slider label="Fade in" value={p.fadeIn} min={0} max={5} step={0.5} unit="s" onChange={p.onFadeInChange} /><Slider label="Fade out" value={p.fadeOut} min={0} max={5} step={0.5} unit="s" onChange={p.onFadeOutChange} /></div>}
  </div>;

  if (p.section === 'adjust') {
    const set = (key: keyof Adjust) => (v: number) => p.onAdjustChange({ ...p.adjust, [key]: v });
    const changed = Object.values(p.adjust).some(v => v !== 0);
    return <div>{notice}
      <div className="space-y-0.5">
        <Slider label="Brightness" value={p.adjust.brightness} min={-100} max={100} onChange={set('brightness')} />
        <Slider label="Contrast" value={p.adjust.contrast} min={-100} max={100} onChange={set('contrast')} />
        <Slider label="Saturation" value={p.adjust.saturation} min={-100} max={100} onChange={set('saturation')} />
        <Slider label="Temperature" value={p.adjust.temperature} min={-100} max={100} onChange={set('temperature')} />
        <Slider label="Sharpness" value={p.adjust.sharpness} min={0} max={100} onChange={set('sharpness')} />
        <Slider label="Vignette" value={p.adjust.vignette} min={0} max={100} onChange={set('vignette')} />
      </div>
      <button type="button" disabled={!changed} onClick={() => p.onAdjustChange(NO_ADJUST)} className="mt-1 min-h-10 rounded-xl bg-white/10 px-4 text-xs font-bold disabled:opacity-30">Reset all</button>
      <p className="mt-1 text-[11px] text-slate-500">Applies to the whole video, in the preview and the export.</p>
    </div>;
  }

  if (p.section === 'text') return <div>{notice}
    <Tabs tabs={['Text', 'Font', 'Animation']} value={textTab} onChange={setTextTab} />
    {textTab === 'Text' && <div className="flex gap-2"><input value={p.textOverlay} onChange={e => p.onTextOverlayChange(e.target.value)} maxLength={120} placeholder="Tap to add text" className="h-12 min-w-0 flex-1 rounded-xl border border-white/10 bg-[#080a10] px-3 text-sm text-white outline-none focus:border-violet-400" />{p.textOverlay && <button type="button" onClick={() => p.onTextOverlayChange('')} className="h-12 rounded-xl bg-white/10 px-3 text-sm">Clear</button>}</div>}
    {textTab === 'Font' && <Row>{FONT_CHOICES.map(f => <button key={f.label} type="button" disabled={busy} onClick={() => void applyAsset('font', f.label, () => p.onFontChange(f.value))} className={`relative min-h-12 shrink-0 rounded-xl px-4 text-base ${p.font === f.value ? 'bg-violet-500 text-white' : 'bg-white/5 text-slate-200'}`} style={{ fontFamily: f.value }}>{f.label}{isPremium('font', f.label) && <span className="ml-1 text-[10px] text-violet-200">◇</span>}</button>)}</Row>}
    {textTab === 'Animation' && <Row>{ANIMATIONS.map(a => <button key={a} type="button" disabled={busy} onClick={() => void applyAsset('animation', a, () => p.onAnimationChange(a))} className={`min-h-11 shrink-0 rounded-xl px-3 text-xs font-bold ${p.animation === a ? 'bg-violet-500 text-white' : 'bg-white/5 text-slate-300'}`}>{a}{isPremium('animation', a) && <span className="ml-1 text-violet-200">◇</span>}</button>)}</Row>}
  </div>;

  if (p.section === 'stickers') return <div>{notice}
    <Tabs tabs={['Stickers', 'Emoji', 'Packs']} value={stickerTab} onChange={setStickerTab} />
    {stickerTab === 'Stickers' && <Row><button type="button" onClick={() => p.onStickerChange('')} className={`min-h-12 shrink-0 rounded-xl px-3 text-xs font-bold ${!p.sticker ? 'bg-violet-500' : 'bg-white/5'}`}>None</button>{STICKERS.map(s => <button key={s} type="button" onClick={() => p.onStickerChange(p.sticker === s ? '' : s)} className={`min-h-12 shrink-0 rounded-xl border-2 px-3 text-xs font-black ${p.sticker === s ? 'border-violet-300 bg-violet-500/20' : 'border-white/15 bg-black/30'}`}>{s}</button>)}</Row>}
    {stickerTab === 'Emoji' && <Row>{EMOJIS.map(e => <button key={e} type="button" onClick={() => p.onEmojiChange(p.emoji === e ? '' : e)} className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl text-2xl ${p.emoji === e ? 'bg-violet-500/30 ring-2 ring-violet-300' : 'bg-white/5'}`}>{e}</button>)}</Row>}
    {stickerTab === 'Packs' && <div className="space-y-2">{Object.entries(PREMIUM_STICKER_PACKS).map(([pack, items]) => <div key={pack}><p className="mb-1 text-[11px] text-slate-400">{pack} ◇ {assetCosts.sticker} credits to unlock once</p><Row>{items.map(s => <button key={s} type="button" disabled={busy} onClick={() => void applyAsset('sticker', pack, () => p.onStickerChange(p.sticker === s ? '' : s))} className={`min-h-11 shrink-0 rounded-xl border-2 px-3 text-xs font-black ${p.sticker === s ? 'border-violet-300 bg-violet-500/20' : 'border-white/15 bg-black/30'}`}>{s}</button>)}</Row></div>)}</div>}
  </div>;

  if (p.section === 'effects') return <div>{notice}
    <Tabs tabs={['Filters', 'Effects', 'Transitions']} value={effectTab} onChange={setEffectTab} />
    {effectTab === 'Filters' && <Row>{Object.keys(FILTERS).map(k => <Tile key={k} label={k} active={p.effectPreset === k} premium={isPremium('filter', k)} thumb={p.thumb} css={FILTERS[k]} onClick={() => { if (!busy) void applyAsset('filter', k, () => p.onEffectPresetChange(k)); }} />)}</Row>}
    {effectTab === 'Effects' && <Row>{Object.keys(EFFECTS).map(k => <Tile key={k} label={k} active={p.visualEffect === k} premium={isPremium('effect', k)} thumb={p.thumb} css={EFFECTS[k]} onClick={() => { if (!busy) void applyAsset('effect', k, () => p.onVisualEffectChange(k)); }} />)}</Row>}
    {effectTab === 'Transitions' && <><Row>{TRANSITIONS.map(k => <button key={k} type="button" disabled={busy} onClick={() => void applyAsset('transition', k, () => p.onTransitionChange(k))} className={`min-h-11 shrink-0 rounded-xl px-3 text-xs font-bold ${p.transition === k ? 'bg-violet-500 text-white' : 'bg-white/5 text-slate-300'}`}>{k}{isPremium('transition', k) && <span className="ml-1 text-violet-200">◇</span>}</button>)}</Row><p className="mt-1 text-[11px] text-slate-500">Applies after the selected clip.</p></>}
    <p className="mt-1 text-[11px] text-slate-500">◇ Premium looks unlock once with credits and stay yours.</p>
  </div>;

  return <div>{notice}
    <Row>{(['9:16', '16:9', '1:1', '4:5'] as const).map(r => { const [w, h] = r.split(':').map(Number); return <button key={r} type="button" onClick={() => p.onAspectRatioChange(r)} className={`flex min-h-[64px] min-w-[64px] shrink-0 flex-col items-center justify-center gap-1 rounded-xl text-[11px] ${p.aspectRatio === r ? 'bg-violet-500/25 text-violet-100' : 'text-slate-300'}`}><span className="block rounded-sm border-2 border-current" style={{ width: 20 * Math.min(1, w / h), height: 20 * Math.min(1, h / w) }} />{r}</button>; })}
      <Action icon={<Maximize2 size={21} />} label={p.crop === 'cover' ? 'Fill' : 'Fit'} onClick={() => p.onCropChange(p.crop === 'cover' ? 'contain' : 'cover')} active={p.crop === 'cover'} />
      <Action icon={<ShieldCheck size={21} />} label="Watermark" onClick={() => p.onWatermarkChange(!p.watermark)} active={p.watermark} />
    </Row>
    <label className="mt-2 flex items-start gap-2 text-xs leading-5 text-slate-300"><input type="checkbox" checked={p.applyAspectRatio} onChange={e => p.onApplyAspectRatioChange(e.target.checked)} className="mt-1 accent-violet-400" /><span>Apply this canvas to the exported video <span className="text-slate-500">(slower, re-encodes on this device)</span></span></label>
  </div>;
}
