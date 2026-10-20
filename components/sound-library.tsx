'use client';

import { Music2, Smartphone, Trash2, Volume2 } from 'lucide-react';

export type WyCutAudioTrack = {
  id: string;
  name: string;
  category: string;
  blob: Blob;
  startSeconds: number;
  durationSeconds: number;
  volume: number;
  fadeInSeconds?: number;
  fadeOutSeconds?: number;
  /** 'library' is kept only so projects saved by older versions still open. New audio is always 'device'. */
  source: 'library' | 'device';
};

const AUDIO_NAME_RE = /\.(mp3|wav|m4a|aac|ogg|opus|flac|mp4|3gp)$/i;

export function isAudioFile(file: File): boolean {
  return file.type.startsWith('audio/') || AUDIO_NAME_RE.test(file.name);
}

/** Reads a file the user picked from their device and returns a timeline track. Rejects with a readable message. */
export function readDeviceAudioTrack(file: File, startSeconds: number): Promise<WyCutAudioTrack> {
  return new Promise((resolve, reject) => {
    if (!isAudioFile(file)) { reject(new Error('Choose an audio file such as MP3, WAV, M4A, AAC, OGG or FLAC.')); return; }
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    let done = false;
    const finish = (fn: () => void) => { if (done) return; done = true; window.clearTimeout(timer); audio.removeAttribute('src'); audio.load(); URL.revokeObjectURL(url); fn(); };
    const timer = window.setTimeout(() => finish(() => reject(new Error('This audio file took too long to open. Try an MP3 or WAV file.'))), 8000);
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => finish(() => resolve({
      id: `device-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: file.name.replace(/\.[^.]+$/, '') || 'Audio',
      category: 'Device audio',
      blob: file,
      startSeconds: Math.max(0, startSeconds || 0),
      durationSeconds: Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0,
      volume: 0.8,
      source: 'device',
    }));
    audio.onerror = () => finish(() => reject(new Error('This audio format could not be read. Try an MP3 or WAV file.')));
    audio.src = url;
  });
}

/** Audio layer list for the Audio tool. Sounds come only from the user's device. */
export function SoundLibrary({ tracks, onChange, onAdd, selectedId, onSelect, maxStart = 60, disabled = false, message = '' }: {
  tracks: WyCutAudioTrack[];
  onChange: (tracks: WyCutAudioTrack[]) => void;
  onAdd: (file?: File) => void;
  selectedId?: string;
  onSelect?: (id: string) => void;
  maxStart?: number;
  disabled?: boolean;
  message?: string;
}) {
  const update = (id: string, patch: Partial<WyCutAudioTrack>) => onChange(tracks.map(t => (t.id === id ? { ...t, ...patch } : t)));
  const selected = tracks.find(t => t.id === selectedId) || null;
  return <div className="space-y-3">
    <label className={`flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl bg-violet-500 px-4 text-sm font-black text-white ${disabled ? 'opacity-40' : ''}`}>
      <Smartphone size={18} />Add audio from device
      <input type="file" accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.opus,.flac" disabled={disabled} onChange={e => { onAdd(e.target.files?.[0]); e.currentTarget.value = ''; }} className="sr-only" />
    </label>
    {message && <p role="status" className="text-xs leading-5 text-violet-200">{message}</p>}
    {tracks.length === 0 && <p className="flex items-center justify-center gap-2 py-2 text-center text-xs text-slate-400"><Music2 size={15} />Music, voice-overs or sound effects you pick from your device appear on the audio track.</p>}
    {tracks.length > 0 && <div className="flex gap-2 overflow-x-auto pb-1">
      {tracks.map((t, i) => <button key={t.id} type="button" onClick={() => onSelect?.(t.id)} className={`flex min-h-11 max-w-[11rem] shrink-0 items-center gap-2 rounded-xl border px-3 text-left text-xs ${selected?.id === t.id ? 'border-violet-300 bg-violet-500/20' : 'border-white/10 bg-black/20'}`}><Volume2 size={15} className="shrink-0 text-violet-200" /><span className="truncate">{i + 1}. {t.name}</span></button>)}
    </div>}
    {selected && <div className="space-y-3 rounded-xl border border-white/10 bg-black/20 p-3">
      <div className="flex items-center justify-between gap-2"><p className="min-w-0 truncate text-sm font-bold">{selected.name}</p><button type="button" disabled={disabled} onClick={() => onChange(tracks.filter(t => t.id !== selected.id))} aria-label={`Remove ${selected.name}`} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-red-500/15 text-red-200"><Trash2 size={17} /></button></div>
      <label className="flex items-center gap-3 text-xs text-slate-300"><Volume2 size={16} /><span className="w-14 shrink-0">Volume {Math.round(selected.volume * 100)}%</span><input type="range" min="0" max="1.5" step="0.05" value={selected.volume} disabled={disabled} onChange={e => update(selected.id, { volume: Number(e.target.value) })} className="min-w-0 flex-1 accent-violet-400" /></label>
      <label className="flex items-center gap-3 text-xs text-slate-300"><span className="w-[4.5rem] shrink-0">Starts at {selected.startSeconds.toFixed(1)}s</span><input type="range" min="0" max={Math.max(1, Math.ceil(maxStart))} step="0.1" value={selected.startSeconds} disabled={disabled} onChange={e => update(selected.id, { startSeconds: Math.max(0, Number(e.target.value) || 0) })} className="min-w-0 flex-1 accent-violet-400" /></label>
      <label className="flex items-center gap-3 text-xs text-slate-300"><span className="w-[4.5rem] shrink-0">Fade in {(selected.fadeInSeconds || 0).toFixed(1)}s</span><input type="range" min="0" max={Math.min(10, Math.max(0.1, selected.durationSeconds / 2))} step="0.1" value={selected.fadeInSeconds || 0} disabled={disabled} onChange={e => update(selected.id, { fadeInSeconds: Number(e.target.value) })} className="min-w-0 flex-1 accent-violet-400" /></label>
      <label className="flex items-center gap-3 text-xs text-slate-300"><span className="w-[4.5rem] shrink-0">Fade out {(selected.fadeOutSeconds || 0).toFixed(1)}s</span><input type="range" min="0" max={Math.min(10, Math.max(0.1, selected.durationSeconds / 2))} step="0.1" value={selected.fadeOutSeconds || 0} disabled={disabled} onChange={e => update(selected.id, { fadeOutSeconds: Number(e.target.value) })} className="min-w-0 flex-1 accent-violet-400" /></label>
    </div>}
  </div>;
}
