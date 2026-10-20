'use client';
import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import type { ReactNode } from 'react';
import { Download, ArrowLeft, ArrowRight, ChevronLeft, ChevronRight, Copy, Crop, FlipHorizontal, Gauge, Maximize2, Scissors, ShieldCheck, Trash2, Timer, Volume2, Type, Smile } from 'lucide-react';
import type { RecapScript, NarrativeBeat } from '@/lib/ai/script-generator';
import { unlockPremiumEditorAsset, type PremiumAssetCategory } from '@/lib/editor/unlock-premium-asset';
import { EMOJIS, FILTERS, EFFECTS, TRANSITIONS, ANIMATIONS, STICKERS, FONT_CHOICES, PREMIUM_STICKER_PACKS, ANIMATION_CSS } from '@/lib/editor/asset-catalog';
import pricing from '@/config/credit-pricing.json';
import { NO_ADJUST, type Adjust } from '@/lib/editor/edit-plan';
import { trimEdge, frameDuration } from '@/lib/editor/manual-cuts';
import { getLocalSetting, setLocalSetting } from '@/lib/projects/store';

export type EditorSection = 'edit' | 'text' | 'stickers' | 'effects' | 'canvas' | 'adjust' | 'beat' | 'keyframe' | 'speed' | 'inout' | 'combo' | 'filters' | 'overlay' | 'captions' | 'voice';
type Props = {
  section: EditorSection; script: RecapScript | null; onScriptChange: (s: RecapScript) => void; selected: number; onSelect: (i: number) => void;
  watermark: boolean; onWatermarkChange: (v: boolean) => void; mirror: boolean; onMirrorChange: (v: boolean) => void; crop: string; onCropChange: (v: string) => void;
  textOverlay: string; onTextOverlayChange: (v: string) => void; textPosition: 'top' | 'center' | 'bottom'; onTextPositionChange: (v: 'top' | 'center' | 'bottom') => void; textX: number; onTextXChange: (v: number) => void; textY: number; onTextYChange: (v: number) => void; textScale: number; onTextScaleChange: (v: number) => void; textRotation: number; onTextRotationChange: (v: number) => void; emoji: string; onEmojiChange: (v: string) => void; font: string; onFontChange: (v: string) => void;
  aspectRatio: string; onAspectRatioChange: (v: '9:16' | '16:9' | '1:1' | '4:5') => void; applyAspectRatio: boolean; onApplyAspectRatioChange: (v: boolean) => void;
  playbackRate: string; onPlaybackRateChange: (v: string) => void; thumb?: string;
  effectPreset: string; onEffectPresetChange: (v: string) => void; transition: string; onTransitionChange: (v: string) => void; sticker: string; onStickerChange: (v: string) => void;
  animation: string; onAnimationChange: (v: string) => void; visualEffect: string; onVisualEffectChange: (v: string) => void; disabled?: boolean;
  onDownloadCaptions: () => void; onSplitAtPlayhead: () => void; onFrameStep: (frames: number) => void; fps: number; videoDuration: number;
  adjust: Adjust; onAdjustChange: (a: Adjust) => void; clipVolume: number; onClipVolumeChange: (v: number) => void; fadeIn: number; onFadeInChange: (v: number) => void; fadeOut: number; onFadeOutChange: (v: number) => void;
  playheadSeconds: number; beatMarkers: number[]; onBeatMarkersChange: (v: number[]) => void; keyframes: { time: number; scale: number; rotation: number }[]; onKeyframesChange: (v: { time: number; scale: number; rotation: number }[]) => void;
};
const PREMIUM_KEY: Record<PremiumAssetCategory, string> = { font: 'fonts', animation: 'animations', sound: 'sounds', filter: 'filters', effect: 'effects', transition: 'transitions', sticker: 'stickers' };
const SPEEDS = ['0.25', '0.5', '0.75', '1', '1.25', '1.5', '2'];

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
function Tile({ label, active, premium, onClick, thumb, css, previewClass, children }: { label: string; active: boolean; premium?: boolean; onClick: () => void; thumb?: string; css?: string; previewClass?: string; children?: ReactNode }) {
  const [preview, setPreview] = useState(false);
  function runPreview() { setPreview(true); window.setTimeout(() => setPreview(false), 900); }
  return <button type="button" onMouseEnter={runPreview} onFocus={runPreview} onClick={() => { runPreview(); onClick(); }} aria-label={`Preview and select ${label}`} className="flex w-full min-w-0 flex-col items-center gap-1 text-[11px] text-slate-300">
    <span className={`relative grid h-[68px] w-full max-w-[82px] place-items-center overflow-hidden rounded-xl bg-gradient-to-br from-violet-500/30 to-[#111521] ${active ? 'ring-2 ring-violet-300' : 'ring-1 ring-white/10'}`}>
      {thumb ? <img src={thumb} alt="" className={`h-full w-full object-cover ${preview ? (previewClass || 'wy-asset-preview') : ''}`} style={{ filter: css && css !== 'none' ? css : undefined }} /> : <span className={preview ? (previewClass || 'wy-asset-preview') : ''}>{children || 'Aa'}</span>}
      {preview && <span className="pointer-events-none absolute inset-0 border-2 border-violet-200/70" />}
      {premium && <span aria-label="Premium" className="absolute right-1 top-1 rounded bg-black/70 px-1 text-[10px] text-violet-200">◇</span>}
    </span>
    <span className="w-full truncate text-center">{label}</span>
  </button>;
}

export default function AdvancedEditorTools(p: Props) {
  const [assetNotice, setAssetNotice] = useState(''); const [assetBusy, setAssetBusy] = useState(false);
  const [keyScale, setKeyScale] = useState(1); const [keyRotation, setKeyRotation] = useState(0);
  const [effectTab, setEffectTab] = useState('Filters'); const [stickerTab, setStickerTab] = useState('Stickers'); const [textTab, setTextTab] = useState('Text'); const [editSub, setEditSub] = useState<'' | 'trim' | 'speed' | 'volume'>('');
  const beat = p.script?.beats[p.selected] || null;
  const premiumAssets = pricing.editorAssets.premium as Record<string, string[]>;
  const assetCosts = pricing.editorAssets.premiumUnlockCosts as Record<string, number>;
  const isPremium = (category: PremiumAssetCategory, asset: string) => (premiumAssets[PREMIUM_KEY[category]] || []).includes(asset);
  // Premium items ask before spending credits. Items already unlocked on this device apply with no prompt.
  const [pending, setPending] = useState<{ category: PremiumAssetCategory; asset: string; apply: () => void } | null>(null);
  const [owned, setOwned] = useState<Set<string>>(new Set());
  useEffect(() => { let alive = true; void getLocalSetting<string[]>('owned_editor_assets').then(items => { if (alive && items) setOwned(new Set(items)); }); return () => { alive = false; }; }, []);
  async function runUnlock(category: PremiumAssetCategory, asset: string, apply: () => void) {
    setPending(null); setAssetBusy(true); setAssetNotice('Checking premium access…');
    try {
      const result = await unlockPremiumEditorAsset(category, asset); apply();
      const next = new Set(owned); next.add(`${category}:${asset}`); setOwned(next); void setLocalSetting('owned_editor_assets', [...next]);
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
  async function downloadRecapScript() {
    if (!p.script) return;
    const content = [p.script.title || 'WyCut recap script', '', ...p.script.beats.map((b, i) => `${String(i + 1).padStart(2, '0')}. [${Number(b.startSeconds).toFixed(2)}s - ${Number(b.endSeconds).toFixed(2)}s] ${b.title}\n${b.narration || ''}`)].join('\n\n');
    const filename = `${(p.script.title || 'wycut-recap-script').replace(/[^a-z0-9-_]+/gi, '-').slice(0, 60)}.txt`;
    try {
      if (Capacitor.isNativePlatform()) {
        const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');
        const { Share } = await import('@capacitor/share');
        const saved = await Filesystem.writeFile({ path: filename, data: content, directory: Directory.Documents, encoding: Encoding.UTF8 });
        await Share.share({ title: 'Download recap script', text: 'Your timestamped WyCut recap script', url: saved.uri, dialogTitle: 'Save or share script' });
      } else {
        const href = URL.createObjectURL(new Blob([content], { type: 'text/plain;charset=utf-8' }));
        const link = document.createElement('a'); link.href = href; link.download = filename; link.click();
        window.setTimeout(() => URL.revokeObjectURL(href), 1000);
      }
    } catch { setAssetNotice('Could not save the script. Check device storage permissions and try again.'); }
  }

  const notice = <>{pending && <div role="alertdialog" aria-label="Unlock premium item" className="mb-2 flex items-center justify-between gap-2 rounded-xl bg-violet-500/15 px-3 py-2 text-xs text-violet-100"><span className="min-w-0">Unlock <strong>{pending.asset}</strong> for {assetCosts[pending.category]} credits? You only pay once.</span><span className="flex shrink-0 gap-1.5"><button type="button" onClick={() => setPending(null)} className="min-h-9 rounded-lg bg-white/10 px-3">Not now</button><button type="button" onClick={() => void runUnlock(pending.category, pending.asset, pending.apply)} className="min-h-9 rounded-lg bg-violet-500 px-3 font-bold text-white">Unlock</button></span></div>}{(assetNotice || assetBusy) && <p role="status" className="mb-2 rounded-lg bg-violet-500/10 px-2 py-1.5 text-xs text-violet-100">{assetBusy ? 'Checking premium access…' : assetNotice}</p>}</>;

  if (p.section === 'beat') return <div>{notice}
    <div className="flex items-center justify-between gap-2"><div><p className="text-sm font-bold">Beat markers</p><p className="text-[11px] text-slate-400">Add markers on the timeline to align cuts, captions and music manually.</p></div><button type="button" onClick={() => { const t = Math.max(0, Math.min(p.videoDuration || p.playheadSeconds, p.playheadSeconds)); p.onBeatMarkersChange([...p.beatMarkers.filter(x => Math.abs(x-t) > 0.04), Number(t.toFixed(3))].sort((a,b)=>a-b)); }} className="min-h-11 shrink-0 rounded-xl bg-violet-500 px-3 text-xs font-black">+ Add beat</button></div>
    <div className="mt-3 flex flex-wrap gap-2">{p.beatMarkers.map((t,i)=><button key={`${t}-${i}`} type="button" onClick={()=>p.onBeatMarkersChange(p.beatMarkers.filter((_,j)=>j!==i))} className="rounded-lg border border-violet-400/30 bg-violet-500/10 px-3 py-2 text-xs text-violet-100">{t.toFixed(2)}s ×</button>)}{!p.beatMarkers.length&&<span className="text-xs text-slate-500">No beat markers yet. Move the playhead to a beat and tap Add beat.</span>}</div>
    <div className="mt-2 flex gap-2"><button type="button" onClick={()=>p.onBeatMarkersChange([])} disabled={!p.beatMarkers.length} className="min-h-10 rounded-xl bg-white/5 px-3 text-xs disabled:opacity-30">Clear markers</button><span className="self-center text-[11px] text-slate-500">{p.beatMarkers.length} marker(s) · saved with project JSON</span></div>
  </div>;

  if (p.section === 'keyframe') return <div>{notice}
    <div className="mb-2"><p className="text-sm font-bold">Transform keyframes</p><p className="text-[11px] leading-5 text-slate-400">Animate scale and rotation between saved timeline points. Keyframes preview live and interpolate into the exported MP4; add at least two keyframes to animate a change.</p></div>
    <Slider label="Scale" value={keyScale} min={0.5} max={2.5} step={0.05} unit="×" onChange={setKeyScale}/><Slider label="Rotation" value={keyRotation} min={-180} max={180} unit="°" onChange={setKeyRotation}/>
    <button type="button" onClick={()=>p.onKeyframesChange([...p.keyframes.filter(k=>Math.abs(k.time-p.playheadSeconds)>0.02),{time:Number(p.playheadSeconds.toFixed(3)),scale:keyScale,rotation:keyRotation}].sort((a,b)=>a.time-b.time))} className="mt-2 min-h-11 w-full rounded-xl bg-violet-500 px-3 text-sm font-black">＋ Add keyframe at {p.playheadSeconds.toFixed(2)}s</button>
    <div className="mt-2 space-y-1">{p.keyframes.map((k,i)=><div key={`${k.time}-${i}`} className="flex items-center justify-between rounded-lg bg-black/20 px-3 py-2 text-xs"><span>{k.time.toFixed(2)}s · {k.scale.toFixed(2)}× · {k.rotation}°</span><button type="button" onClick={()=>p.onKeyframesChange(p.keyframes.filter((_,j)=>j!==i))} className="rounded bg-white/10 px-2 py-1">Remove</button></div>)}</div>
  </div>;

  if (p.section === 'speed') return <div>{notice}<p className="mb-2 text-sm font-bold">Speed & slow motion</p><Row>{SPEEDS.map(s => <button key={s} type="button" onClick={() => p.onPlaybackRateChange(s)} className={`min-h-12 min-w-14 shrink-0 rounded-xl px-3 text-sm font-bold ${p.playbackRate === s ? 'bg-violet-500 text-white' : 'bg-white/5 text-slate-300'}`}>{s}×{Number(s)<1?<span className="block text-[9px]">Slo-mo</span>:null}</button>)}</Row><p className="mt-2 text-[11px] text-slate-500">Changes playback and the exported video speed. 0.25× is quarter-speed slow motion.</p></div>;

  if (p.section === 'inout') return <div>{notice}<p className="mb-2 text-sm font-bold">In & out effects</p><Slider label="Fade in" value={p.fadeIn} min={0} max={5} step={0.25} unit="s" onChange={p.onFadeInChange}/><Slider label="Fade out" value={p.fadeOut} min={0} max={5} step={0.25} unit="s" onChange={p.onFadeOutChange}/><div className="mt-2 flex gap-2"><button type="button" onClick={()=>{p.onFadeInChange(0);p.onFadeOutChange(0)}} className="min-h-10 rounded-xl bg-white/5 px-3 text-xs">Reset fades</button><button type="button" onClick={()=>{p.onFadeInChange(0.5);p.onFadeOutChange(0.5)}} className="min-h-10 rounded-xl bg-violet-500/20 px-3 text-xs font-bold text-violet-100">Quick cinematic fade</button></div><p className="mt-1 text-[11px] text-slate-500">Fade timing is applied during MP4 export.</p></div>;

  if (p.section === 'combo') return <div>{notice}<p className="mb-2 text-sm font-bold">Combo looks</p><p className="mb-2 text-[11px] text-slate-400">Each preset applies a filter and visual effect, and renders the selected supported transition at clip boundaries.</p><div className="grid grid-cols-2 gap-2">{[{name:'Cinematic Punch',filter:'Cinematic',effect:'Glow',transition:'Fade'},{name:'Dream Sequence',filter:'Dream',effect:'Bloom',transition:'Fade'},{name:'Retro Flash',filter:'Vintage',effect:'Glitch',transition:'Fade'},{name:'Noir Drama',filter:'Monochrome',effect:'Vignette',transition:'Fade'},{name:'Neon Rush',filter:'Vivid',effect:'Chromatic',transition:'Fade'},{name:'Soft Romance',filter:'Dream',effect:'Soft',transition:'Fade'}].map(c=><button key={c.name} type="button" onClick={()=>{p.onEffectPresetChange(c.filter);p.onVisualEffectChange(c.effect);p.onTransitionChange(c.transition);setAssetNotice(`${c.name} applied.`)}} className="min-h-12 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-left text-xs font-bold">{c.name}<span className="mt-1 block text-[10px] font-normal text-slate-400">{c.filter} · {c.effect} · {c.transition}</span></button>)}</div></div>;

  if (p.section === 'filters') return <div>{notice}<p className="mb-2 text-sm font-bold">Quick filters</p><div className="grid grid-cols-4 gap-2 sm:grid-cols-5">{Object.keys(FILTERS).map(k=><Tile key={k} label={k} active={p.effectPreset===k} premium={isPremium('filter',k)} thumb={p.thumb} css={FILTERS[k]} onClick={()=>{if(!busy)void applyAsset('filter',k,()=>p.onEffectPresetChange(k));}} />)}</div></div>;
  if (p.section === 'overlay') return <div>{notice}<p className="mb-2 text-sm font-bold">Overlay layer</p><p className="mb-2 text-xs text-slate-400">Add media from the plus button on the timeline. Text and stickers can be edited in their own tools.</p><Row><Action icon={<Type size={21}/>} label="Edit text" onClick={()=>setAssetNotice('Use the Text tool to edit the active text overlay.')}/><Action icon={<Smile size={21}/>} label="Stickers" onClick={()=>setAssetNotice('Choose Stickers from the toolbar.')}/></Row></div>;
  if (p.section === 'captions') return <div>{notice}<p className="text-sm font-bold">Captions</p><p className="mt-1 text-xs leading-5 text-slate-400">Export timestamped SRT captions from your clip titles and narration. Burned-in word-by-word karaoke captions and per-word highlighting are not yet implemented.</p><button type="button" disabled={!p.script || busy} onClick={p.onDownloadCaptions} className="mt-2 min-h-10 rounded-xl bg-violet-500/15 px-3 text-xs font-bold text-violet-100 disabled:opacity-30">Download timestamped SRT captions</button></div>;
  if (p.section === 'voice') return <div>{notice}<p className="text-sm font-bold">Voice & narration</p><p className="mt-1 text-xs leading-5 text-slate-400">Narration generation is available in the AI workflow. Use the Audio tool to position and mix generated narration or music with the video.</p></div>;

  if (p.section === 'edit') return <div>{notice}
    {p.script && <button type="button" onClick={() => void downloadRecapScript()} className="mb-2 flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-violet-500/15 px-3 text-xs font-bold text-violet-100"><Download size={16}/> Download timestamped recap script</button>}
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
    {textTab === 'Text' && <div className="space-y-2"><div className="flex gap-2"><input value={p.textOverlay} onChange={e => p.onTextOverlayChange(e.target.value)} maxLength={120} placeholder="Tap to add text" className="h-12 min-w-0 flex-1 rounded-xl border border-white/10 bg-[#080a10] px-3 text-sm text-white outline-none focus:border-violet-400" />{p.textOverlay && <button type="button" onClick={() => p.onTextOverlayChange('')} className="h-12 rounded-xl bg-white/10 px-3 text-sm">Clear</button>}</div><div className="flex gap-2">{(['top','center','bottom'] as const).map(pos=><button key={pos} type="button" onClick={()=>p.onTextPositionChange(pos)} className={`min-h-10 flex-1 rounded-lg px-2 text-xs font-bold capitalize ${p.textPosition===pos?'bg-violet-500 text-white':'bg-white/5 text-slate-300'}`}>{pos}</button>)}</div><Slider label="Horizontal" value={p.textX} min={0} max={100} unit="%" onChange={p.onTextXChange}/><Slider label="Vertical" value={p.textY} min={0} max={100} unit="%" onChange={p.onTextYChange}/><Slider label="Text size" value={p.textScale} min={0.5} max={2} step={0.05} unit="×" onChange={p.onTextScaleChange}/><Slider label="Rotation" value={p.textRotation} min={-180} max={180} unit="°" onChange={p.onTextRotationChange}/></div>}
    {textTab === 'Font' && <Row>{FONT_CHOICES.map(f => <button key={f.label} type="button" disabled={busy} onClick={() => void applyAsset('font', f.label, () => p.onFontChange(f.value))} className={`relative min-h-12 shrink-0 rounded-xl px-4 text-base ${p.font === f.value ? 'bg-violet-500 text-white' : 'bg-white/5 text-slate-200'}`} style={{ fontFamily: f.value }}>{f.label}{isPremium('font', f.label) && <span className="ml-1 text-[10px] text-violet-200">◇</span>}</button>)}</Row>}
    {textTab === 'Animation' && <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">{ANIMATIONS.map(a => <Tile key={a} label={a} active={p.animation === a} premium={isPremium('animation', a)} previewClass={ANIMATION_CSS[a] || 'wy-asset-preview'} onClick={() => { if (!busy) void applyAsset('animation', a, () => p.onAnimationChange(a)); }}><span className="text-lg font-black" >Aa</span></Tile>)}</div>}
  </div>;

  if (p.section === 'stickers') return <div>{notice}
    <Tabs tabs={['Stickers', 'Emoji', 'Packs']} value={stickerTab} onChange={setStickerTab} />
    {stickerTab === 'Stickers' && <Row><button type="button" onClick={() => p.onStickerChange('')} className={`min-h-12 shrink-0 rounded-xl px-3 text-xs font-bold ${!p.sticker ? 'bg-violet-500' : 'bg-white/5'}`}>None</button>{STICKERS.map(s => <button key={s} type="button" onClick={() => p.onStickerChange(p.sticker === s ? '' : s)} className={`min-h-12 shrink-0 rounded-xl border-2 px-3 text-xs font-black ${p.sticker === s ? 'border-violet-300 bg-violet-500/20' : 'border-white/15 bg-black/30'}`}>{s}</button>)}</Row>}
    {stickerTab === 'Emoji' && <Row>{EMOJIS.map(e => <button key={e} type="button" onClick={() => p.onEmojiChange(p.emoji === e ? '' : e)} className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl text-2xl ${p.emoji === e ? 'bg-violet-500/30 ring-2 ring-violet-300' : 'bg-white/5'}`}>{e}</button>)}</Row>}
    {stickerTab === 'Packs' && <div className="space-y-2">{Object.entries(PREMIUM_STICKER_PACKS).map(([pack, items]) => <div key={pack}><p className="mb-1 text-[11px] text-slate-400">{pack} ◇ {assetCosts.sticker} credits to unlock once</p><Row>{items.map(s => <button key={s} type="button" disabled={busy} onClick={() => void applyAsset('sticker', pack, () => p.onStickerChange(p.sticker === s ? '' : s))} className={`min-h-11 shrink-0 rounded-xl border-2 px-3 text-xs font-black ${p.sticker === s ? 'border-violet-300 bg-violet-500/20' : 'border-white/15 bg-black/30'}`}>{s}</button>)}</Row></div>)}</div>}
  </div>;

  if (p.section === 'effects') return <div>{notice}
    <Tabs tabs={['Filters', 'Effects', 'Transitions']} value={effectTab} onChange={setEffectTab} />
    {effectTab === 'Filters' && <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">{Object.keys(FILTERS).map(k => <Tile key={k} label={k} active={p.effectPreset === k} premium={isPremium('filter', k)} thumb={p.thumb} css={FILTERS[k]} onClick={() => { if (!busy) void applyAsset('filter', k, () => p.onEffectPresetChange(k)); }} />)}</div>}
    {effectTab === 'Effects' && <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">{Object.keys(EFFECTS).map(k => <Tile key={k} label={k} active={p.visualEffect === k} premium={isPremium('effect', k)} thumb={p.thumb} css={EFFECTS[k]} onClick={() => { if (!busy) void applyAsset('effect', k, () => p.onVisualEffectChange(k)); }} />)}</div>}
    {effectTab === 'Transitions' && <><div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{TRANSITIONS.map(k => <button key={k} type="button" disabled={busy} onMouseEnter={e => { const el=e.currentTarget; el.classList.add('wy-transition-preview'); window.setTimeout(() => el.classList.remove('wy-transition-preview'), 850); }} onClick={() => { const el = document.activeElement; if (el instanceof HTMLElement) { el.classList.add('wy-transition-preview'); window.setTimeout(() => el.classList.remove('wy-transition-preview'), 850); } void applyAsset('transition', k, () => p.onTransitionChange(k)); }} className={`min-h-11 rounded-xl px-3 text-xs font-bold ${p.transition === k ? 'bg-violet-500 text-white' : 'bg-white/5 text-slate-300'}`}>{k}{isPremium('transition', k) && <span className="ml-1 text-violet-200">◇</span>}</button>)}</div><p className="mt-1 text-[11px] text-slate-500">Tap or focus an item to preview its motion briefly. Applies after the selected clip.</p></>}
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
