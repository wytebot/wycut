'use client';

import { useEffect, useMemo, useState } from 'react';
import { AudioLines, Check, ChevronLeft, Music2, Pause, Play, Plus, Search, Smartphone, Trash2, Volume2 } from 'lucide-react';

export type WyCutAudioTrack = {
  id: string;
  name: string;
  category: string;
  blob: Blob;
  startSeconds: number;
  durationSeconds: number;
  volume: number;
  source: 'library' | 'device';
};

type SoundPreset = { id: string; name: string; category: string; kind: number; variant: number; duration: number };
const categories = [
  ['Background Music', ['Calm cinematic bed','Sad emotional bed','Suspense pulse bed','Epic heroic bed','Romantic soft bed','Dark mystery bed','Hopeful piano-inspired bed','Dreamy ambient bed','Action tension bed','Victory theme bed','Documentary bed','Gentle focus bed']],
  ['Moods', ['Calm glow','Hope rising','Sad piano-like tone','Lonely space','Warm memory','Dream haze','Nervous pulse','Angry tension','Joy sparkle','Romantic shimmer','Triumph rise','Wonder bloom']],
  ['Emotions', ['Fear swell','Relief exhale','Surprise hit','Curiosity ping','Heartbreak fall','Confidence lift','Suspicion pulse','Excitement burst','Disappointment drop','Courage rise','Mystery question','Tender moment']],
  ['Animal-inspired', ['Bird chirps','Cat-like cartoon call','Dog-like cartoon bark','Wolf howl tone','Owl hoot tone','Frog croak pulse','Insect buzz','Whale-like call','Dolphin-like clicks','Horse-like snort','Monkey-like chatter','Rooster-like crow']],
  ['Nature', ['Soft rain','Heavy rain','Thunder roll','Wind gust','Ocean wash','Forest air','Fire crackle','Water drip','River flow','Leaves rustle','Snow wind','Distant storm']],
  ['Objects & Foley', ['Door creak','Metal clank','Glass shimmer','Paper rustle','Footstep thud','Keys jingle','Clock tick','Phone vibration','Camera click','Machine hum','Wood knock','Coins drop']],
  ['Impacts', ['Punch thump','Body fall','Heavy slam','Stone impact','Metal impact','Glass impact','Low boom','Double hit','Quick slap','Crash burst','Rumble hit','Tiny pop']],
  ['Cinematic', ['Trailer rise','Epic reveal','Suspense bed','Dramatic hit','Tension pulse','Hero arrival','Dark reveal','Emotional swell','Flashback wash','Memory shimmer','Cliffhanger','Finale lift']],
  ['Sci-fi', ['Laser zap','Energy charge','Teleport shimmer','Robot pulse','Digital glitch','Space drone','Alien signal','Engine startup','Power down','Portal open','Scanner sweep','Futuristic alert']],
  ['Horror', ['Dread drone','Ghostly whisper tone','Creepy knock','Haunted wind','Distant shriek tone','Dark heartbeat','Creaking room','Uneasy shimmer','Monster growl tone','Sting hit','Eerie bell','Nightmare swell']],
  ['Comedy', ['Boing','Cartoon slide','Funny pop','Sneaky tiptoe tone','Awkward pause tone','Tiny fail sting','Silly wobble','Quirky bounce','Record-stop style tone','Goofy reveal','Bubble pop','Comic victory']],
  ['Magic & Fantasy', ['Magic sparkle','Spell charge','Fairy shimmer','Potion bubble','Enchanted bell','Mystic portal','Dragon-like rumble','Crystal resonance','Rune activation','Fairy dust','Sword shimmer','Fantasy reveal']],
  ['Ambience', ['Quiet room','Night insects','Underwater hum','City far away','Crowd-like wash','Cave resonance','Windy plain','Space ambience','Rainy window','Abandoned hall','Subtle tension bed','Soft focus bed']],
  ['Transitions', ['Whoosh short','Whoosh long','Swipe left','Swipe right','Air sweep','Reverse swell','Soft transition','Fast transition','Deep transition','Bright transition','Riser short','Riser long']],
  ['UI & Alerts', ['Success chime','Error tone','Notification soft','Notification bright','Loading pulse','Confirm click','Warning alert','Level up','Message pop','Timer tick','Achievement','Subtle tap']],
  ['Vehicles & Machines', ['Car engine start','Motorcycle rev tone','Train passing drone','Aircraft engine hum','Helicopter pulse','Electric motor whine','Machine startup','Engine shutdown','Mechanical rattle','Hydraulic hiss','Alarm siren tone','Heavy machinery hum']],
  ['Crowd & Sports', ['Crowd cheer wash','Stadium excitement bed','Applause-like noise','Victory crowd swell','Referee whistle tone','Ball bounce','Race countdown','Finish-line sting','Audience gasp wash','Arena ambience','Sports transition','Crowd anticipation']],
  ['Weather', ['Windstorm gust','Rain on roof','Distant thunder','Lightning crack tone','Gentle drizzle','Hail-like rattle','Blizzard wind','Summer night air','Storm approach','Rain fade','Thunderous boom','Weather transition']],
] as const;

const presets: SoundPreset[] = categories.flatMap(([category, names], kind) => names.map((name, variant) => ({
  id: `${kind}-${variant}`, name, category, kind, variant, duration: category === 'Background Music' ? 12 + (variant % 4) * 3 : category === 'Ambience' ? 6 + (variant % 3) * 2 : category === 'Transitions' || category === 'Impacts' || category === 'UI & Alerts' ? 1.1 + (variant % 4) * 0.25 : 1.8 + (variant % 5) * 0.35,
})));

function writeWav(buffer: AudioBuffer): Blob {
  const channels = buffer.numberOfChannels; const frames = buffer.length; const bytes = 44 + frames * channels * 2;
  const out = new ArrayBuffer(bytes); const view = new DataView(out);
  const str = (offset: number, value: string) => { for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i)); };
  str(0, 'RIFF'); view.setUint32(4, bytes - 8, true); str(8, 'WAVE'); str(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, channels, true); view.setUint32(24, buffer.sampleRate, true); view.setUint32(28, buffer.sampleRate * channels * 2, true); view.setUint16(32, channels * 2, true); view.setUint16(34, 16, true); str(36, 'data'); view.setUint32(40, frames * channels * 2, true);
  let offset = 44;
  for (let i = 0; i < frames; i++) for (let c = 0; c < channels; c++) { const sample = Math.max(-1, Math.min(1, buffer.getChannelData(c)[i])); view.setInt16(offset, sample < 0 ? sample * 32768 : sample * 32767, true); offset += 2; }
  return new Blob([out], { type: 'audio/wav' });
}

/** Generates stylized sound-design effects locally. These are synthetic effects, not real-world animal recordings. */
async function synthesize(preset: SoundPreset): Promise<Blob> {
  const Ctx = window.OfflineAudioContext || (window as Window & { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext;
  if (!Ctx) throw new Error('This browser does not support local sound generation. Try an updated Chrome browser.');
  const sampleRate = 22050; const duration = preset.duration; const ctx = new Ctx(1, Math.ceil(sampleRate * duration), sampleRate);
  const master = ctx.createGain(); master.gain.value = 0.22; master.connect(ctx.destination);
  const t = preset.variant; const category = preset.category;
  const base = 90 + ((preset.kind * 71 + t * 53) % 900);
  const transient = ['Impacts','Objects & Foley','UI & Alerts','Comedy'].includes(category);
  const oscillator = (freq: number, type: OscillatorType, start: number, length: number, gain: number, endFreq?: number) => {
    const osc = ctx.createOscillator(); const g = ctx.createGain(); osc.type = type; osc.frequency.setValueAtTime(Math.max(20, freq), start); if (endFreq) osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), Math.min(duration, start + length));
    g.gain.setValueAtTime(0.0001, start); g.gain.linearRampToValueAtTime(gain, Math.min(duration, start + Math.min(0.04, length / 4))); g.gain.exponentialRampToValueAtTime(0.0001, Math.min(duration, start + length)); osc.connect(g); g.connect(master); osc.start(start); osc.stop(Math.min(duration, start + length));
  };
  const noise = (start: number, length: number, gain: number, filterType: BiquadFilterType = 'lowpass') => {
    const size = Math.max(1, Math.ceil(sampleRate * length)); const noiseBuffer = ctx.createBuffer(1, size, sampleRate); const data = noiseBuffer.getChannelData(0);
    let seed = (preset.kind + 1) * 1009 + (preset.variant + 1) * 7919; for (let i = 0; i < data.length; i++) { seed = (seed * 16807) % 2147483647; data[i] = (seed / 1073741823.5) - 1; }
    const src = ctx.createBufferSource(); src.buffer = noiseBuffer; const filter = ctx.createBiquadFilter(); filter.type = filterType; filter.frequency.value = filterType === 'highpass' ? 900 + base : 400 + base * 2; const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, start); g.gain.linearRampToValueAtTime(gain, Math.min(duration, start + 0.06)); g.gain.exponentialRampToValueAtTime(0.0001, Math.min(duration, start + length)); src.connect(filter); filter.connect(g); g.connect(master); src.start(start); src.stop(Math.min(duration, start + length));
  };
  if (category === 'Background Music') {
    const progressions = [[1, 1.25, 1.5], [1, 1.2, 1.42], [1, 1.19, 1.414], [1, 1.333, 1.6]]; const chord = progressions[t % progressions.length]; const chordLength = duration / 4;
    for (let bar = 0; bar < 4; bar++) { const root = base * (bar === 2 && t % 2 === 0 ? 0.84 : 1) * (bar === 3 ? 0.94 : 1); oscillator(root, 'sine', bar * chordLength, chordLength * 1.08, 0.15, root * 0.99); oscillator(root * chord[1], 'triangle', bar * chordLength, chordLength * 1.02, 0.10, root * chord[1] * 0.99); oscillator(root * chord[2], 'sine', bar * chordLength, chordLength * 1.02, 0.08, root * chord[2] * 0.99); oscillator(root * 2, 'sine', bar * chordLength + chordLength * 0.45, chordLength * 0.35, 0.07); }
    noise(0, duration, 0.018, 'lowpass');
  } else if (['Nature','Ambience','Weather'].includes(category)) { noise(0, duration, 0.22, 'lowpass'); if (t % 2 === 0) noise(0.1, duration * 0.75, 0.1, 'highpass'); }
  else if (['Animal-inspired'].includes(category)) { for (let i = 0; i < 3 + t % 4; i++) { const start = i * duration / (4 + t % 3); oscillator(base * (0.55 + (i % 3) * 0.5), i % 2 ? 'triangle' : 'sine', start, Math.min(0.7, duration - start), 0.28, base * (1.5 + (t % 5) * 0.35)); if (t % 3 === 0) noise(start, 0.18, 0.07, 'highpass'); } }
  else if (['Impacts','Objects & Foley'].includes(category)) { noise(0, Math.min(duration, 0.35 + (t % 4) * 0.08), 0.45, t % 2 ? 'highpass' : 'lowpass'); oscillator(base, t % 2 ? 'square' : 'triangle', 0, Math.min(duration, 0.7), 0.4, base / 5); }
  else if (['Transitions','Sci-fi','Cinematic','Magic & Fantasy'].includes(category)) { oscillator(base, t % 2 ? 'sawtooth' : 'triangle', 0, duration, 0.28, base * (1.2 + (t % 5) * 0.4)); oscillator(base * 1.51, 'sine', 0.05, duration * 0.85, 0.16, base * 2.1); if (t % 2 === 0) noise(0, duration * 0.6, 0.08, 'highpass'); }
  else if (['Horror','Emotions','Moods'].includes(category)) { oscillator(base / 2, 'sine', 0, duration, 0.32, base / (1.3 + t % 3)); oscillator(base * 1.07, 'triangle', 0, duration * 0.82, 0.16, base * (0.6 + (t % 4) * 0.3)); if (t % 3 === 0) noise(0, duration, 0.06, 'highpass'); }
  else { for (let i = 0; i < (transient ? 2 : 4); i++) oscillator(base * (1 + i * 0.45), t % 3 === 0 ? 'square' : 'sine', Math.min(duration - 0.05, i * duration / (transient ? 3 : 5)), Math.max(0.1, duration / (transient ? 2.5 : 1.5)), 0.24, base * (0.7 + i * 0.3)); }
  const rendered = await ctx.startRendering(); return writeWav(rendered);
}

export function SoundLibrary({ tracks, onChange, disabled = false }: { tracks: WyCutAudioTrack[]; onChange: (tracks: WyCutAudioTrack[]) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false); const [category, setCategory] = useState<string>('Moods'); const [search, setSearch] = useState(''); const [previewing, setPreviewing] = useState<string | null>(null); const [generating, setGenerating] = useState<string | null>(null); const [message, setMessage] = useState(''); const [playhead, setPlayhead] = useState('0'); const [audioUrl, setAudioUrl] = useState(''); const [deviceMode, setDeviceMode] = useState(false); const [pendingDeviceFile, setPendingDeviceFile] = useState<File | null>(null); const [pendingDeviceUrl, setPendingDeviceUrl] = useState('');
  useEffect(() => () => { if (audioUrl) URL.revokeObjectURL(audioUrl); if (pendingDeviceUrl) URL.revokeObjectURL(pendingDeviceUrl); }, [audioUrl, pendingDeviceUrl]);
  const filtered = useMemo(() => presets.filter(p => (category === 'All' || p.category === category) && `${p.name} ${p.category}`.toLowerCase().includes(search.toLowerCase())), [category, search]);
  const categoriesList = ['All', ...categories.map(c => c[0])];
  async function addPreset(preset: SoundPreset) {
    if (tracks.length >= 12) { setMessage('The local mixer supports up to 12 audio layers per project. Remove a layer before adding another.'); return; }
    setGenerating(preset.id); setMessage('Generating a local sound effect…');
    try { const blob = await synthesize(preset); const id = `sound-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`; onChange([...tracks, { id, name: preset.name, category: preset.category, blob, startSeconds: Math.max(0, Number(playhead) || 0), durationSeconds: preset.duration, volume: 0.65, source: 'library' }]); setMessage(`${preset.name} added to the sound timeline.`); }
    catch (e) { setMessage(e instanceof Error ? e.message : 'Could not generate this sound.'); }
    finally { setGenerating(null); }
  }
  async function previewPreset(preset: SoundPreset) {
    setPreviewing(preset.id); setMessage('');
    try { const blob = await synthesize(preset); const nextUrl = URL.createObjectURL(blob); if (audioUrl) URL.revokeObjectURL(audioUrl); setAudioUrl(nextUrl); const audio = new Audio(nextUrl); audio.onended = () => setPreviewing(null); await audio.play(); }
    catch (e) { setMessage(e instanceof Error ? e.message : 'Could not preview this sound.'); setPreviewing(null); }
  }
  function addDeviceAudio(file?: File) {
    if (!file) return;
    if (!file.type.startsWith('audio/') && !/\.(mp3|wav|m4a|aac|ogg|opus|flac)$/i.test(file.name)) { setMessage('Choose an audio file such as MP3, WAV, M4A, AAC, OGG or FLAC.'); return; }
    if (pendingDeviceUrl) URL.revokeObjectURL(pendingDeviceUrl);
    const url = URL.createObjectURL(file); setPendingDeviceFile(file); setPendingDeviceUrl(url); setDeviceMode(true); setOpen(true); setMessage('Preview this device audio before adding it to the timeline.');
  }
  function confirmDeviceAudio() {
    if (!pendingDeviceFile || !pendingDeviceUrl) return;
    if (tracks.length >= 12) { setMessage('The local mixer supports up to 12 audio layers per project. Remove a layer before adding another.'); return; }
    const audio = new Audio(pendingDeviceUrl);
    const file = pendingDeviceFile;
    const add = (duration: number) => { onChange([...tracks, { id: `device-${Date.now()}`, name: file.name, category: 'Device audio', blob: file, startSeconds: Math.max(0, Number(playhead) || 0), durationSeconds: Number.isFinite(duration) ? duration : 0, volume: 0.65, source: 'device' }]); setMessage(`${file.name} added from your device.`); setDeviceMode(false); setPendingDeviceFile(null); URL.revokeObjectURL(pendingDeviceUrl); setPendingDeviceUrl(''); };
    if (audio.readyState >= 1) add(audio.duration); else { audio.onloadedmetadata = () => add(audio.duration); audio.onerror = () => setMessage('This audio format could not be read. Try MP3 or WAV.'); audio.src = pendingDeviceUrl; }
  }
  function updateTrack(id: string, patch: Partial<WyCutAudioTrack>) { onChange(tracks.map(track => track.id === id ? { ...track, ...patch } : track)); }
  return <section className="overflow-hidden rounded-2xl border border-white/10 bg-[#111521]">
    <div className="flex items-center justify-between gap-3 border-b border-white/10 p-4"><div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-violet-500/15 text-violet-200"><Music2 size={20}/></div><div><h3 className="font-bold">Sound timeline</h3><p className="text-xs text-slate-400">{tracks.length} audio layer{tracks.length === 1 ? '' : 's'} · generated locally, no AI charges</p></div></div><button type="button" disabled={disabled} onClick={() => setOpen(true)} className="rounded-xl bg-violet-500 px-4 py-2.5 text-sm font-bold disabled:opacity-40"><Plus size={16} className="mr-1 inline"/>Add sound</button></div>
    <div className="space-y-3 p-3">{tracks.length === 0 && <div className="rounded-xl border border-dashed border-white/15 p-5 text-center text-sm text-slate-400">Add a sound effect, music file, ambience, or audio from your device. Set its start time below.</div>}
      {tracks.map(track => <div key={track.id} className="grid gap-3 rounded-xl border border-white/10 bg-black/20 p-3 sm:grid-cols-[minmax(0,1fr)_100px_110px_auto]"><div className="min-w-0"><p className="truncate text-sm font-bold">{track.name}</p><p className="text-[11px] text-slate-500">{track.category} · {Math.round(track.durationSeconds)}s · {track.source === 'device' ? 'Device file' : 'Local sound design'}</p><div className="mt-2 h-5 overflow-hidden rounded bg-violet-500/15"><div className="h-full rounded bg-violet-400/50" style={{ width: `${Math.min(100, Math.max(5, track.durationSeconds / Math.max(1, 30) * 100))}%` }}/></div></div><label className="text-[11px] text-slate-400">Start (sec)<input type="number" min="0" max={Math.max(0, 24*3600)} step="0.1" value={track.startSeconds} disabled={disabled} onChange={e => updateTrack(track.id, { startSeconds: Math.max(0, Number(e.target.value) || 0) })} className="mt-1 w-full rounded-lg border border-white/10 bg-[#080a10] px-2 py-2 text-sm text-white"/></label><label className="text-[11px] text-slate-400">Volume {Math.round(track.volume*100)}%<input type="range" min="0" max="1" step="0.05" value={track.volume} disabled={disabled} onChange={e => updateTrack(track.id, { volume: Number(e.target.value) })} className="mt-2 w-full accent-violet-400"/></label><button type="button" disabled={disabled} aria-label={`Remove ${track.name}`} onClick={() => onChange(tracks.filter(t => t.id !== track.id))} className="self-center rounded-lg p-2 text-red-300 hover:bg-red-500/10"><Trash2 size={16}/></button></div>)}
      <div className="flex flex-wrap items-center gap-2"><label className="flex cursor-pointer items-center gap-2 rounded-xl border border-white/10 px-3 py-2.5 text-sm font-bold"><Smartphone size={16}/>Add audio from device<input type="file" accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.opus,.flac" disabled={disabled} onChange={e => { addDeviceAudio(e.target.files?.[0]); e.currentTarget.value = ''; }} className="sr-only"/></label><label className="flex items-center gap-2 text-xs text-slate-400">Add at (sec)<input type="number" min="0" step="0.1" value={playhead} onChange={e => setPlayhead(e.target.value)} className="w-24 rounded-lg border border-white/10 bg-[#080a10] px-2 py-2 text-sm text-white"/></label></div>
      {message && <p role="status" className="text-xs leading-5 text-violet-200">{message}</p>}
    </div>
    {open && <div role="dialog" aria-modal="true" aria-label="Sound library" className="fixed inset-0 z-[70] overflow-y-auto bg-[#080a10] text-white"><div className="mx-auto min-h-screen max-w-6xl p-3 sm:p-6"><header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-white/10 bg-[#080a10]/95 py-3 backdrop-blur"><button type="button" onClick={() => setOpen(false)} className="rounded-xl border border-white/10 px-3 py-2 text-sm font-bold"><ChevronLeft size={16} className="mr-1 inline"/>Back to editor</button><div className="flex items-center gap-2"><button type="button" onClick={() => setDeviceMode(v => !v)} className="rounded-xl border border-white/10 px-3 py-2 text-xs font-bold">{deviceMode?'Sound library':'Device sounds'}</button><div className="text-right"><h2 className="font-black">WyCut Sound Library</h2><p className="text-[11px] text-slate-400">{presets.length} procedural sound designs · generated on device</p></div></div></header>
      <div className="my-4 rounded-xl border border-amber-300/20 bg-amber-300/[.06] p-3 text-xs leading-5 text-amber-100">These are original, synthesized sound-design effects, not recordings of real animals, instruments, or environments. They cost no AI credits and are generated on your device. For realistic licensed recordings, add your own sound packs.</div>
      {audioUrl && !deviceMode && <div className="my-3 rounded-xl border border-white/10 bg-[#111521] p-3"><p className="mb-2 text-xs font-bold text-slate-300">Sound preview</p><audio controls src={audioUrl} className="w-full"/></div>}
      {deviceMode ? <div className="my-5 rounded-2xl border border-white/10 bg-[#111521] p-5"><div className="mb-4 flex items-center gap-3"><Smartphone size={22} className="text-violet-200"/><div><h3 className="font-bold">Use audio from your device</h3><p className="text-xs text-slate-400">Choose a file, preview it, then add it to the sound timeline.</p></div></div><label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-violet-400/40 p-5 text-sm font-bold"><Smartphone size={18}/>Choose audio file<input type="file" accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.opus,.flac" onChange={e => { addDeviceAudio(e.target.files?.[0]); e.currentTarget.value = ''; }} className="sr-only"/></label>{pendingDeviceFile && pendingDeviceUrl && <div className="mt-4 rounded-xl border border-white/10 p-4"><p className="truncate text-sm font-bold">{pendingDeviceFile.name}</p><p className="mb-3 text-xs text-slate-500">{(pendingDeviceFile.size/1024/1024).toFixed(1)} MB · not uploaded to WyCut servers</p><audio controls preload="metadata" src={pendingDeviceUrl} className="w-full"/><div className="mt-4 flex gap-2"><button type="button" onClick={confirmDeviceAudio} className="flex-1 rounded-xl bg-violet-500 py-3 text-sm font-bold"><Check size={15} className="mr-1 inline"/>Add to timeline</button><button type="button" onClick={() => { URL.revokeObjectURL(pendingDeviceUrl); setPendingDeviceUrl(''); setPendingDeviceFile(null); }} className="rounded-xl border border-white/10 px-4 py-3 text-sm">Clear</button></div></div>}</div> : <>
      <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-[#111521] px-3 py-3"><Search size={17} className="text-slate-400"/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search sounds, moods, animals, objects…" className="w-full bg-transparent text-sm outline-none"/></label>
      <div className="my-4 flex gap-2 overflow-x-auto pb-2">{categoriesList.map(c => <button key={c} type="button" onClick={() => setCategory(c)} className={`shrink-0 rounded-full px-3 py-2 text-xs font-bold ${category===c?'bg-violet-500 text-white':'bg-white/5 text-slate-300'}`}>{c}</button>)}</div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{filtered.map(p => <article key={p.id} className="flex items-center gap-3 rounded-xl border border-white/10 bg-[#111521] p-3"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-violet-500/15 text-violet-200"><Volume2 size={18}/></div><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{p.name}</p><p className="text-[11px] text-slate-500">{p.category} · {p.duration.toFixed(1)}s</p></div><button type="button" aria-label={`Preview ${p.name}`} disabled={Boolean(generating)} onClick={() => void previewPreset(p)} className="rounded-lg border border-white/10 p-2 disabled:opacity-40">{previewing===p.id?<Pause size={15}/>:<Play size={15}/>}</button><button type="button" aria-label={`Add ${p.name}`} disabled={Boolean(generating)} onClick={() => void addPreset(p)} className="rounded-lg bg-violet-500 p-2 disabled:opacity-40">{generating===p.id?<span className="text-xs">…</span>:<Plus size={15}/>}</button></article>)}</div>
      <p className="mt-4 text-xs text-slate-500">Showing {filtered.length} of {presets.length} locally generated sound designs. Generate/preview is local. You can add multiple layers and adjust each layer's start time and volume.</p></>}<button type="button" onClick={() => setOpen(false)} className="mt-5 w-full rounded-xl bg-violet-500 py-3 font-bold">Done · {tracks.length} sounds in timeline</button></div></div>}
  </section>;
}
