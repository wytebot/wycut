'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import pricing from '@/config/credit-pricing.json';
import type { PointerEvent as ReactPointerEvent, ReactNode, RefObject } from 'react';
import { Check, Pause, Play, Redo2, Scissors, Sparkles, Music2, Type, Smile, Wand2, Crop, Undo2, Volume2, VolumeX, X, Plus, Minus, Maximize2, ChevronLeft, ChevronRight, Trash2, SlidersHorizontal, AudioLines, Crosshair, Gauge, Timer, Layers, Film, Captions, Mic, ImagePlus } from 'lucide-react';

/* Palette note: only the app's existing colors are used (#080a10, #111521, violet accents, white/slate text). */

export type EditorToolName = 'Edit' | 'Audio' | 'Text' | 'Overlay' | 'Captions' | 'Stickers' | 'Effects' | 'Filters' | 'Adjust' | 'Speed' | 'Beat' | 'Keyframe' | 'In/Out' | 'Combo' | 'Canvas' | 'Voice';
export const EDITOR_TOOLS: { name: EditorToolName; icon: typeof Scissors }[] = [
  { name: 'Edit', icon: Scissors }, { name: 'Audio', icon: Music2 }, { name: 'Beat', icon: AudioLines }, { name: 'Keyframe', icon: Crosshair },
  { name: 'Speed', icon: Gauge }, { name: 'In/Out', icon: Timer }, { name: 'Combo', icon: Layers }, { name: 'Text', icon: Type },
  { name: 'Overlay', icon: ImagePlus }, { name: 'Captions', icon: Captions }, { name: 'Stickers', icon: Smile }, { name: 'Effects', icon: Wand2 },
  { name: 'Filters', icon: Film }, { name: 'Adjust', icon: SlidersHorizontal }, { name: 'Canvas', icon: Crop }, { name: 'Voice', icon: Mic },
];

export function fmtClock(n: number) { const s = Math.max(0, Math.floor(n || 0)); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; }

/** mm:ss:ff — shows the exact frame, which is what you need to place a cut. */
export function fmtFrames(n: number, fps = 30) { const t = Math.max(0, n || 0); const s = Math.floor(t); const f = Math.min(Math.round(fps) - 1, Math.round((t - s) * fps)); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}:${String(Math.max(0, f)).padStart(2, '0')}`; }
function haptic(ms = 8) { try { navigator.vibrate?.(ms); } catch { /* not supported */ } }

export function EditorTopBar({ onClose, credits, quality, onQuality, onExport, exportDisabled }: { onClose: () => void; credits: number | null; quality: '720p' | '1080p' | '2K'; onQuality: (v: '720p' | '1080p' | '2K') => void; onExport: () => void; exportDisabled: boolean }) {
  const [qualityOpen, setQualityOpen] = useState(false);
  const qualities: ('720p' | '1080p' | '2K')[] = ['720p', '1080p', '2K'];
  return <header className="relative flex h-14 shrink-0 items-center justify-between gap-2 px-2">
    <button type="button" aria-label="Close editor" onClick={onClose} className="grid h-11 w-11 place-items-center rounded-xl"><X size={24} /></button>
    <div className="flex min-w-0 items-center gap-2">
      <a href="/billing" aria-label="Credits" className="flex h-10 items-center gap-1 rounded-xl bg-violet-500/15 px-2.5 text-xs font-bold text-violet-200"><Sparkles size={14} />{credits === null ? '—' : credits}</a>
      <button type="button" aria-haspopup="dialog" aria-expanded={qualityOpen} aria-label={`Export quality ${quality}`} onClick={() => setQualityOpen(v => !v)} className="h-10 rounded-xl bg-[#111521] px-3 text-xs font-black text-white">{quality}⌄</button>
      <button type="button" disabled={exportDisabled} onClick={onExport} className="h-10 rounded-xl bg-violet-500 px-4 text-sm font-black text-white disabled:opacity-40">Export</button>
    </div>
    {qualityOpen && <><button type="button" aria-label="Close quality picker" onClick={() => setQualityOpen(false)} className="fixed inset-0 z-[88] bg-black/35"/><section role="dialog" aria-label="Choose export quality" className="absolute right-2 top-12 z-[89] w-44 rounded-2xl border border-white/10 bg-[#111521] p-2 shadow-2xl">{qualities.map(q => <button type="button" key={q} onClick={() => { onQuality(q); setQualityOpen(false); }} className={`flex min-h-11 w-full items-center justify-between rounded-xl px-3 text-sm font-bold ${q === quality ? 'bg-violet-500/20 text-violet-200' : 'text-slate-200'}`}>{q}<span className="text-xs">{q === quality ? '✓ Selected' : q === '720p' ? 'HD' : q === '1080p' ? 'Full HD' : '2K'}</span></button>)}</section></>}
  </header>;
}

/** Fits the preview box inside the free space without distorting the chosen ratio. */
export function PreviewStage({ children, ratio }: { children: ReactNode; ratio: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    const [rw, rh] = ratio.split(':').map(Number); const r = rw > 0 && rh > 0 ? rw / rh : 9 / 16;
    const measure = () => { const cw = el.clientWidth - 16; const ch = el.clientHeight - 8; if (cw <= 0 || ch <= 0) return; const w = cw / ch > r ? ch * r : cw; setBox({ w: Math.floor(w), h: Math.floor(w / r) }); };
    measure(); const ro = new ResizeObserver(measure); ro.observe(el); return () => ro.disconnect();
  }, [ratio]);
  return <div ref={ref} className="flex min-h-0 flex-1 items-center justify-center bg-[#080a10]"><div className="relative overflow-hidden bg-black" style={{ width: box.w || '100%', height: box.h || '100%' }}>{children}</div></div>;
}

export function PlaybackBar({ playing, onPlay, onFullscreen, current, duration, canUndo, canRedo, onUndo, onRedo }: { playing: boolean; onPlay: () => void; onFullscreen: () => void; current: number; duration: number; canUndo: boolean; canRedo: boolean; onUndo: () => void; onRedo: () => void }) {
  return <div className="grid h-12 shrink-0 grid-cols-[1fr_auto_1fr] items-center px-2">
    <div className="flex items-center gap-1"><button type="button" onClick={onFullscreen} aria-label="Fullscreen preview" className="grid h-11 w-11 place-items-center rounded-xl text-slate-300"><Maximize2 size={19} /></button><span className="text-xs tabular-nums text-slate-400"><span className="text-white">{fmtClock(current)}</span> / {fmtClock(duration)}</span></div>
    <button type="button" onClick={onPlay} aria-label={playing ? 'Pause' : 'Play'} className="grid h-11 w-11 place-items-center rounded-full text-white">{playing ? <Pause size={26} /> : <Play size={26} />}</button>
    <div className="flex justify-end"><button type="button" disabled={!canUndo} onClick={onUndo} aria-label="Undo" className="grid h-11 w-11 place-items-center rounded-xl text-white disabled:text-slate-600"><Undo2 size={20} /></button><button type="button" disabled={!canRedo} onClick={onRedo} aria-label="Redo" className="grid h-11 w-11 place-items-center rounded-xl text-white disabled:text-slate-600"><Redo2 size={20} /></button></div>
  </div>;
}

export function TrackRail({ muted, onMute, onAI, busy }: { muted: boolean; onMute: () => void; onAI: () => void; busy?: boolean }) {
  return <aside className="flex w-[64px] shrink-0 flex-col items-center gap-2 py-1">
    <button type="button" onClick={onMute} className={`flex min-h-[52px] w-14 flex-col items-center justify-center gap-0.5 rounded-xl text-[10px] ${muted ? 'bg-violet-500/20 text-violet-200' : 'text-slate-300'}`}>{muted ? <VolumeX size={19} /> : <Volume2 size={19} />}{muted ? 'Unmute' : 'Mute clip'}</button>
    <button type="button" onClick={onAI} disabled={busy} className="relative flex min-h-[52px] w-14 flex-col items-center justify-center gap-0.5 rounded-xl bg-[#111521] text-[10px] text-violet-200 ring-1 ring-violet-400/30 disabled:opacity-50"><Sparkles size={19} />AI clipper</button>
  </aside>;
}

/* ---- video frame thumbnails for the video track (best effort; the track still works without them) ---- */
export function useVideoThumbs(url: string, duration: number, count = 10, enabled = true) {
  const [thumbs, setThumbs] = useState<string[]>([]);
  const doneKey = useRef('');
  useEffect(() => { setThumbs([]); doneKey.current = ''; }, [url]);
  useEffect(() => {
    // Wait while a cut/export is running (a second video decoder would slow it down) and never build twice for one video.
    if (!enabled || !url || !(duration > 0) || doneKey.current === `${url}|${duration}`) return;
    let cancelled = false;
    const v = document.createElement('video'); v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = url;
    const waitFor = (event: string, ms: number) => new Promise<boolean>(resolve => { const timer = window.setTimeout(() => { v.removeEventListener(event, ok); resolve(false); }, ms); const ok = () => { window.clearTimeout(timer); resolve(true); }; v.addEventListener(event, ok, { once: true }); });
    (async () => {
      if (v.readyState < 2) await waitFor('loadeddata', 6000);
      if (cancelled || !v.videoWidth) return;
      const w = 96; const h = Math.max(1, Math.round(w * v.videoHeight / v.videoWidth));
      const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h; const ctx = canvas.getContext('2d'); if (!ctx) return;
      const out: string[] = [];
      for (let i = 0; i < count && !cancelled; i++) {
        const seeked = waitFor('seeked', 4000);
        try { v.currentTime = Math.min(Math.max(0, duration - 0.1), duration * (i + 0.5) / count); } catch { out.push(out[out.length - 1] || ''); continue; }
        if (await seeked) { try { ctx.drawImage(v, 0, 0, w, h); out.push(canvas.toDataURL('image/jpeg', 0.6)); } catch { out.push(out[out.length - 1] || ''); } } else out.push(out[out.length - 1] || '');
        if (i % 2 === 1 || i === count - 1) setThumbs([...out]);
      }
      if (!cancelled) doneKey.current = `${url}|${duration}`;
    })().catch(() => undefined);
    return () => { cancelled = true; v.removeAttribute('src'); v.load(); };
  }, [url, duration, count, enabled]);
  return thumbs;
}

export type TimelineClip = { start: number; end: number; label: string };
export type TimelineAudio = { id: string; name: string; start: number; duration: number };

/** CapCut-style timeline: fixed centre playhead, tracks scroll beneath it. Scrolling scrubs the video. */
export function Timeline({ compact = false, videoRef, playing, duration, current, zoom, onZoom, onSeek, thumbs, clips, selectedClip, onSelectClip, audio, selectedAudio, onSelectAudio, onAddAudio, audioBusy, text, onText, sticker, onSticker, onAddMedia, rail, fps = 30, gaps = [], onTrim, onSplit, onDelete, onStep, canCut = false }: {
  compact?: boolean; videoRef: RefObject<HTMLVideoElement>; playing: boolean; duration: number; current: number; zoom: number; onZoom: (z: number) => void; onSeek: (s: number) => void; thumbs: string[];
  clips: TimelineClip[]; selectedClip: number; onSelectClip: (i: number) => void;
  audio: TimelineAudio[]; selectedAudio?: string; onSelectAudio: (id: string) => void; onAddAudio: (file?: File) => void; audioBusy?: boolean;
  text: string; onText: () => void; sticker: string; onSticker: () => void; onAddMedia: () => void; rail: ReactNode;
  fps?: number; gaps?: { start: number; end: number }[]; canCut?: boolean;
  onTrim?: (index: number, edge: 'start' | 'end', time: number) => void; onSplit?: () => void; onDelete?: () => void; onStep?: (frames: number) => void;
}) {
  const total = Math.max(1, duration || 1); const pps = 36 * zoom; const width = Math.max(40, total * pps);
  const scroller = useRef<HTMLDivElement>(null); const lastSet = useRef(-100); const idle = useRef<number | undefined>(undefined); const userScrolling = useRef(false);
  const [syncTick, setSyncTick] = useState(0);
  const zoomRef = useRef(zoom); zoomRef.current = zoom; const onZoomRef = useRef(onZoom); onZoomRef.current = onZoom;
  useEffect(() => {
    const el = scroller.current; if (!el || userScrolling.current) return;
    const left = Math.min(width, Math.max(0, current * pps)); lastSet.current = left; el.scrollLeft = left;
  }, [current, pps, width, syncTick]);
  // Pinch with two fingers to zoom the timeline (zoom up to frame level).
  useEffect(() => {
    const el = scroller.current; if (!el) return;
    let d0 = 0; let z0 = 1;
    const dist = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const start = (e: TouchEvent) => { if (e.touches.length === 2) { d0 = dist(e.touches); z0 = zoomRef.current; userScrolling.current = true; } };
    const move = (e: TouchEvent) => { if (e.touches.length === 2 && d0 > 0) { e.preventDefault(); onZoomRef.current(Math.min(16, Math.max(0.25, +(z0 * dist(e.touches) / d0).toFixed(3)))); } };
    const end = (e: TouchEvent) => { if (e.touches.length < 2 && d0 > 0) { d0 = 0; window.setTimeout(() => { userScrolling.current = false; setSyncTick(t => t + 1); }, 120); } };
    el.addEventListener('touchstart', start, { passive: true }); el.addEventListener('touchmove', move, { passive: false }); el.addEventListener('touchend', end); el.addEventListener('touchcancel', end);
    return () => { el.removeEventListener('touchstart', start); el.removeEventListener('touchmove', move); el.removeEventListener('touchend', end); el.removeEventListener('touchcancel', end); };
  }, []);
  // Drag the white handles on the selected clip to trim it. Every move is snapped to a whole frame by the caller.
  const drag = useRef<{ edge: 'start' | 'end'; index: number; x0: number; t0: number } | null>(null);
  const handleDown = (e: ReactPointerEvent, index: number, edge: 'start' | 'end') => { e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId); drag.current = { edge, index, x0: e.clientX, t0: clips[index][edge] }; userScrolling.current = true; haptic(8); };
  const handleMove = (e: ReactPointerEvent) => { const d = drag.current; if (!d || !onTrim) return; onTrim(d.index, d.edge, d.t0 + (e.clientX - d.x0) / pps); };
  const handleUp = () => { if (!drag.current) return; drag.current = null; haptic(6); window.setTimeout(() => { userScrolling.current = false; setSyncTick(t => t + 1); }, 60); };
  useEffect(() => () => window.clearTimeout(idle.current), []);
  // While playing, follow the video every frame without re-rendering React.
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const tick = () => { const el = scroller.current; const v = videoRef.current; if (el && v && !userScrolling.current) { const left = Math.min(width, Math.max(0, v.currentTime * pps)); lastSet.current = left; el.scrollLeft = left; } raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, pps, width, videoRef]);
  const onScroll = () => {
    const el = scroller.current; if (!el) return;
    if (Math.abs(el.scrollLeft - lastSet.current) < 2) return;
    userScrolling.current = true; window.clearTimeout(idle.current); idle.current = window.setTimeout(() => { userScrolling.current = false; }, 180);
    onSeek(Math.min(total, Math.max(0, el.scrollLeft / pps)));
  };
  const step = useMemo(() => { const need = Math.max(Math.ceil(46 / pps), Math.ceil(total / 120)); return [1, 2, 5, 10, 15, 30, 60, 120, 300, 600].find(s => s >= need) || 600; }, [pps, total]);
  const ticks = useMemo(() => Array.from({ length: Math.floor(total / step) + 1 }, (_, i) => i * step), [total, step]);
  return <section aria-label="Timeline" className="flex shrink-0 flex-col bg-[#111521]">
    <div className="flex h-10 items-center justify-between gap-1 px-2 text-xs text-slate-400">
      <span className="min-w-[78px] tabular-nums"><span className="text-white">{fmtFrames(current, fps)}</span></span>
      <span className="flex items-center gap-0.5">
        <button type="button" aria-label="Back one frame" disabled={!canCut} onClick={() => onStep?.(-1)} className="grid h-9 w-9 place-items-center rounded-lg text-slate-200 disabled:opacity-30"><ChevronLeft size={18} /></button>
        <button type="button" aria-label="Forward one frame" disabled={!canCut} onClick={() => onStep?.(1)} className="grid h-9 w-9 place-items-center rounded-lg text-slate-200 disabled:opacity-30"><ChevronRight size={18} /></button>
        <button type="button" aria-label="Split at playhead" disabled={!canCut} onClick={() => { haptic(12); onSplit?.(); }} className="flex h-9 items-center gap-1 rounded-lg bg-violet-500 px-3 text-[11px] font-bold text-white disabled:opacity-30"><Scissors size={14} />Split</button>
        <button type="button" aria-label="Delete selected clip" disabled={!canCut} onClick={() => { haptic(10); onDelete?.(); }} className="grid h-9 w-9 place-items-center rounded-lg text-red-300 disabled:opacity-30"><Trash2 size={17} /></button>
      </span>
      <span className="flex items-center"><button type="button" aria-label="Zoom out" onClick={() => onZoom(Math.max(0.25, +(zoom / 1.5).toFixed(3)))} className="grid h-9 w-9 place-items-center rounded-lg"><Minus size={15} /></button><button type="button" aria-label="Zoom in" onClick={() => onZoom(Math.min(16, +(zoom * 1.5).toFixed(3)))} className="grid h-9 w-9 place-items-center rounded-lg"><Plus size={15} /></button></span>
    </div>
    <div className="flex" style={{ height: compact ? 'min(21vh, 124px)' : 'min(30vh, 176px)' }}>
      {rail}
      <div className="relative min-w-0 flex-1">
        <div className="pointer-events-none absolute inset-y-0 left-1/2 z-20 w-0.5 -translate-x-1/2 bg-white" />
        <div ref={scroller} onScroll={onScroll} className="h-full overflow-x-auto overflow-y-auto" style={{ overscrollBehavior: 'contain', scrollbarWidth: 'none' }}>
          <div className="flex min-h-full">
            <div style={{ flex: '0 0 50%' }} />
            <div className="shrink-0 pb-3" style={{ width }}>
              <div className="relative h-5 text-[10px] text-slate-500">{ticks.map(t => <span key={t} className="absolute top-0 -translate-x-1/2 whitespace-nowrap" style={{ left: t * pps }}>{fmtClock(t)}</span>)}</div>
              <div className="relative h-14 overflow-hidden rounded-md bg-black/40">
                {thumbs.length > 0 && <div className="absolute inset-0 flex">{thumbs.map((src, i) => <div key={i} className="h-full flex-1 bg-cover bg-center" style={{ backgroundImage: src ? `url(${src})` : undefined }} />)}</div>}
                {gaps.map((g, i) => <div key={`gap-${i}`} aria-hidden className="pointer-events-none absolute inset-y-0 bg-black/75" style={{ left: g.start * pps, width: Math.max(2, (g.end - g.start) * pps), backgroundImage: 'repeating-linear-gradient(135deg, rgba(255,255,255,.08) 0 4px, transparent 4px 9px)' }} />)}
                {clips.map((c, i) => <button key={`${c.start}-${i}`} type="button" onClick={() => { onSelectClip(i); onSeek(Math.min(Math.max(current, c.start), Math.max(c.start, c.end - 1 / fps))); }} aria-label={c.label} className={`absolute inset-y-0 rounded-md border ${selectedClip === i ? 'z-10 border-2 border-white bg-white/10' : 'border-violet-300/60 bg-violet-500/25'}`} style={{ left: Math.min(width - 6, c.start * pps), width: Math.max(6, (c.end - c.start) * pps) }}><span className="absolute left-4 top-0.5 max-w-full truncate text-[9px] font-bold text-white drop-shadow">{i + 1}</span></button>)}
                {canCut && clips[selectedClip] && (['start', 'end'] as const).map(edge => { const c = clips[selectedClip]; const x = edge === 'start' ? c.start * pps : c.end * pps - 16; return <div key={edge} role="slider" aria-label={edge === 'start' ? 'Trim start' : 'Trim end'} aria-valuenow={Math.round(c[edge] * 100) / 100} onPointerDown={e => handleDown(e, selectedClip, edge)} onPointerMove={handleMove} onPointerUp={handleUp} onPointerCancel={handleUp} className={`absolute inset-y-0 z-20 flex w-4 touch-none items-center justify-center bg-white text-black ${edge === 'start' ? 'rounded-l-md' : 'rounded-r-md'}`} style={{ left: x }}>{edge === 'start' ? <ChevronLeft size={12} strokeWidth={3} /> : <ChevronRight size={12} strokeWidth={3} />}</div>; })}
              </div>
              <div className="relative mt-1.5 h-8">
                {audio.length === 0 && <label className={`absolute inset-y-0 left-0 flex cursor-pointer items-center gap-2 rounded-md bg-white/5 px-3 text-xs text-slate-400 ${audioBusy ? 'opacity-50' : ''}`} style={{ width: Math.min(width, Math.max(width * 0.6, 180)) }}><Plus size={14} />Add audio<input type="file" accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.opus,.flac" disabled={audioBusy} onChange={e => { onAddAudio(e.target.files?.[0]); e.currentTarget.value = ''; }} className="sr-only" /></label>}
                {audio.map(a => <button key={a.id} type="button" onClick={() => onSelectAudio(a.id)} className={`absolute inset-y-0 flex items-center gap-1 overflow-hidden rounded-md px-2 text-[10px] ${selectedAudio === a.id ? 'border-2 border-white bg-violet-500/50' : 'bg-violet-500/30'}`} style={{ left: Math.min(width - 24, a.start * pps), width: Math.max(24, Math.min(width - a.start * pps, (a.duration || 3) * pps)) }}><Music2 size={11} className="shrink-0" /><span className="truncate">{a.name}</span></button>)}
              </div>
              <div className="relative mt-1.5 h-8">
                {text ? <button type="button" onClick={onText} className="absolute inset-y-0 left-0 flex items-center gap-1 overflow-hidden rounded-md bg-violet-400/30 px-2 text-[10px]" style={{ width }}><Type size={11} className="shrink-0" /><span className="truncate">{text}</span></button> : <button type="button" onClick={onText} className="absolute inset-y-0 left-0 flex items-center gap-2 rounded-md bg-white/5 px-3 text-xs text-slate-400" style={{ width: Math.min(width, Math.max(width * 0.6, 180)) }}><Plus size={14} />Add text</button>}
              </div>
              {sticker && <div className="relative mt-1.5 h-8"><button type="button" onClick={onSticker} className="absolute inset-y-0 left-0 flex items-center gap-1 overflow-hidden rounded-md bg-fuchsia-400/25 px-2 text-[10px]" style={{ width }}><Smile size={11} className="shrink-0" /><span className="truncate">{sticker}</span></button></div>}
              <div className="mt-1.5 flex"><button type="button" onClick={onAddMedia} className="flex h-8 items-center gap-2 rounded-md bg-white/5 px-3 text-xs text-slate-400"><Plus size={14} />Add video or image</button></div>
            </div>
            <div style={{ flex: '0 0 50%' }} />
          </div>
        </div>
      </div>
    </div>
  </section>;
}

export function ToolBar({ active, onSelect }: { active: EditorToolName | ''; onSelect: (t: EditorToolName) => void }) {
  return <nav aria-label="Editor tools" className="flex shrink-0 overflow-x-auto border-t border-white/10 bg-[#080a10] px-1 pb-[max(6px,env(safe-area-inset-bottom))] pt-1" style={{ scrollbarWidth: 'none' }}>
    {EDITOR_TOOLS.map(({ name, icon: Icon }) => <button key={name} type="button" onClick={() => onSelect(name)} className={`flex min-h-[56px] min-w-[72px] shrink-0 flex-col items-center justify-center gap-1 rounded-lg text-[11px] ${active === name ? 'text-violet-300' : 'text-slate-300'}`}><Icon size={22} strokeWidth={active === name ? 2.4 : 1.8} />{name}</button>)}
  </nav>;
}

/** Bottom panel that replaces the tool bar while a tool is open (like CapCut). */
export function ToolSheet({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return <section aria-label={`${title} tools`} className="shrink-0 rounded-t-2xl border-t border-white/10 bg-[#111521] px-3 pt-2 pb-[max(10px,env(safe-area-inset-bottom))]" style={{ maxHeight: '40vh', overflowY: 'auto' }}>
    <div className="mb-2 flex items-center justify-between"><h3 className="text-sm font-bold">{title}</h3><button type="button" onClick={onClose} aria-label="Done" className="grid h-10 w-10 place-items-center rounded-xl bg-violet-500 text-white"><Check size={19} /></button></div>
    {children}
  </section>;
}

export function AIQuickSheet({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  if (!open) return null;
  return <div className="fixed inset-0 z-[65] flex items-end bg-black/60" onClick={onClose}>
    <section onClick={e => e.stopPropagation()} className="max-h-[82vh] w-full overflow-y-auto rounded-t-3xl border-t border-white/10 bg-[#111521] p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
      <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/20" />
      <div className="mb-3 flex items-center justify-between"><h3 className="font-bold">AI & project</h3><button type="button" onClick={onClose} aria-label="Close" className="grid h-10 w-10 place-items-center rounded-xl"><X size={18} /></button></div>
      {children}
    </section>
  </div>;
}
