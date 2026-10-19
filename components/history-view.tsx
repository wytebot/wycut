'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { LoaderCircle, Trash2, PlayCircle, CheckCircle2, Cloud, ChevronDown, FileText, Mic2, Film, ExternalLink, Download, RefreshCw } from 'lucide-react';
import { listProjects, deleteProject, liveProjects, PROJECTS_CHANGED, type ProjectRecord } from '@/lib/projects/store';
import { requestOpenProject, requestDriveConnect, readDriveToken, requestCancelGeneration } from '@/lib/projects/bus';
import { DRIVE_TOKEN_EVENT } from '@/lib/projects/bus';
import { loadProductionKit, fetchDriveBlob, fetchDriveText, DriveReadError, type DriveKit, type DriveItem } from '@/lib/drive/read';

const ROUTES: Record<ProjectRecord['mode'], string> = { subtitles: '/dashboard/subtitles', file: '/dashboard/file', url: '/dashboard/url' };
const MAX_INLINE_VIDEO_BYTES = 150 * 1024 * 1024;
function ago(ts: number): string { const s = Math.max(1, Math.round((Date.now() - ts) / 1000)); if (s < 60) return 'just now'; if (s < 3600) return `${Math.round(s / 60)} min ago`; if (s < 86400) return `${Math.round(s / 3600)} h ago`; return new Date(ts).toLocaleDateString(); }
const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;

export function HistoryView() {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectRecord[] | null>(null);
  const [tab, setTab] = useState<'ongoing' | 'completed'>('ongoing');
  const [, force] = useState(0);
  const refresh = useCallback(() => { void listProjects().then(setProjects); }, []);
  useEffect(() => { refresh(); const timer = window.setInterval(() => { refresh(); force(n => n + 1); }, 3000); window.addEventListener(PROJECTS_CHANGED, refresh); return () => { window.clearInterval(timer); window.removeEventListener(PROJECTS_CHANGED, refresh); }; }, [refresh]);
  const ongoing = (projects || []).filter(p => p.status !== 'exported');
  const completed = (projects || []).filter(p => p.status === 'exported' && p.drive);
  const open = (p: ProjectRecord) => { requestOpenProject(p.id); router.push(ROUTES[p.mode]); };
  const stop = (p: ProjectRecord) => { router.push(ROUTES[p.mode]); window.setTimeout(() => requestCancelGeneration(), 150); };
  const remove = async (p: ProjectRecord) => { if (liveProjects.has(p.id)) return; if (!window.confirm(p.status === 'exported' ? `Remove “${p.title}” from this list? Your files in Google Drive are not touched.` : `Delete “${p.title}” from this device? Its saved transcript and narration will be removed.`)) return; await deleteProject(p.id); refresh(); };
  const list = tab === 'ongoing' ? ongoing : completed;
  return <main className="min-h-screen bg-[#080a10] px-4 pb-28 pt-8 text-white sm:px-8"><div className="mx-auto max-w-3xl">
    <header className="mb-6"><Link href="/dashboard" className="text-sm text-violet-300">← Recap Studio</Link><h1 className="mt-2 text-2xl font-black sm:text-4xl">History</h1><p className="mt-2 text-sm text-slate-400">Projects are saved on this device so you can pick up where you left off. Finished kits are read live from your Google Drive and are never copied here.</p></header>
    <div role="tablist" className="mb-5 grid grid-cols-2 gap-1 rounded-xl border border-white/10 bg-[#111521] p-1">{(['ongoing', 'completed'] as const).map(t => <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`rounded-lg px-3 py-2.5 text-sm font-bold capitalize ${tab === t ? 'bg-violet-500 text-white' : 'text-slate-300'}`}>{t} · {t === 'ongoing' ? ongoing.length : completed.length}</button>)}</div>
    {projects === null && <p className="flex items-center gap-2 text-sm text-slate-400"><LoaderCircle size={16} className="animate-spin" /> Loading…</p>}
    {projects !== null && list.length === 0 && <div className="rounded-2xl border border-dashed border-white/15 p-8 text-center text-sm leading-6 text-slate-400">{tab === 'ongoing' ? 'Nothing in progress. Start a recap in the studio and it will appear here, even if you leave the app.' : 'No completed projects yet. After you export a kit to Google Drive it shows up here.'}<div className="mt-4"><Link href="/dashboard" className="rounded-xl bg-violet-500 px-4 py-2.5 text-sm font-bold">Open studio</Link></div></div>}
    <div className="space-y-4">{tab === 'ongoing' ? ongoing.map(p => <OngoingCard key={p.id} p={p} onOpen={() => open(p)} onStop={() => stop(p)} onDelete={() => void remove(p)} />) : completed.map(p => <CompletedCard key={p.id} p={p} onDelete={() => void remove(p)} />)}</div>
  </div></main>;
}

function Chip({ on, children }: { on: boolean; children: React.ReactNode }) { return <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${on ? 'bg-emerald-400/10 text-emerald-300' : 'bg-white/5 text-slate-500'}`}>{on ? '✓ ' : ''}{children}</span>; }

function OngoingCard({ p, onOpen, onStop, onDelete }: { p: ProjectRecord; onOpen: () => void; onStop: () => void; onDelete: () => void }) {
  const live = p.status === 'running' && liveProjects.has(p.id);
  const interrupted = p.status === 'running' && !live;
  const label = live ? 'Running now' : interrupted ? 'Interrupted' : p.status === 'failed' ? 'Needs attention' : 'Saved';
  const tone = live ? 'bg-emerald-400/15 text-emerald-300' : interrupted || p.status === 'failed' ? 'bg-amber-400/15 text-amber-200' : 'bg-white/10 text-slate-300';
  return <article className="rounded-2xl border border-white/10 bg-[#111521] p-4">
    <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h2 className="truncate font-bold">{p.title}</h2><p className="mt-1 text-xs text-slate-400">Updated {ago(p.updatedAt)} · {p.mode === 'file' ? 'Video file' : p.mode === 'url' ? 'Video URL' : 'Subtitles'}</p></div><span className={`flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${tone}`}>{live && <LoaderCircle size={12} className="animate-spin" />}{label}</span></div>
    {(live || interrupted) && <div className="mt-3"><div className="mb-1 flex justify-between text-xs text-slate-300"><span className="truncate pr-2">{p.stage || 'Working…'}</span><span>{Math.round(p.progress || 0)}%</span></div><div className="h-2 overflow-hidden rounded-full bg-white/10"><div className={`h-full rounded-full ${live ? 'bg-violet-400' : 'bg-amber-400/70'}`} style={{ width: `${Math.max(4, Math.min(100, p.progress || 0))}%` }} /></div></div>}
    {interrupted && <p className="mt-3 text-xs leading-5 text-amber-200/90">The app was closed while this was running. Open it to continue; saved work is reused and nothing already paid for is charged again.</p>}
    {p.status === 'failed' && p.error && <p className="mt-3 line-clamp-3 text-xs leading-5 text-red-200/90">{p.error}</p>}
    <div className="mt-3 flex flex-wrap gap-1.5"><Chip on={Boolean(p.transcript)}>Transcript</Chip><Chip on={Boolean(p.script)}>Script</Chip><Chip on={Boolean(p.narrationReady)}>Voiceover</Chip><Chip on={(p.clipCount || 0) > 0}>{p.clipCount ? `${p.clipCount} clips` : 'Clips'}</Chip></div>
    <div className="mt-4 flex gap-2"><button onClick={onOpen} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-violet-500 px-4 py-3 text-sm font-bold active:scale-[.99]"><PlayCircle size={17} /> {live ? 'View progress' : 'Resume project'}</button>{live ? <button onClick={onStop} className="rounded-xl border border-red-400/40 px-4 py-3 text-sm font-bold text-red-200">Cancel</button> : <button onClick={onDelete} aria-label={`Delete ${p.title}`} className="grid w-12 place-items-center rounded-xl border border-white/10 text-slate-400"><Trash2 size={17} /></button>}</div>
    {(p.clipCount || 0) > 0 && <p className="mt-2 text-[11px] leading-4 text-slate-500">Cut clips are kept in memory only. Export to Drive to keep them, or re-slice after resuming.</p>}
  </article>;
}

function CompletedCard({ p, onDelete }: { p: ProjectRecord; onDelete: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [token, setToken] = useState('');
  const [kit, setKit] = useState<DriveKit | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'auth' | 'missing' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [media, setMedia] = useState<Record<string, { url: string; type: 'video' | 'audio' }>>({});
  const [busyId, setBusyId] = useState('');
  const [scriptText, setScriptText] = useState('');
  const mediaRef = useRef(media); mediaRef.current = media;
  useEffect(() => { const sync = () => setToken(readDriveToken()); sync(); window.addEventListener(DRIVE_TOKEN_EVENT, sync); return () => window.removeEventListener(DRIVE_TOKEN_EVENT, sync); }, []);
  useEffect(() => () => { Object.values(mediaRef.current).forEach(m => URL.revokeObjectURL(m.url)); }, []);
  const load = useCallback(async () => {
    if (!p.drive) return;
    if (!token) { setState('auth'); setMessage('Connect Google Drive to view this project.'); return; }
    setState('loading'); setMessage('');
    try { setKit(await loadProductionKit(token, p.drive.folderId)); setState('idle'); }
    catch (e) { const err = e as DriveReadError; setState(err instanceof DriveReadError ? (err.kind === 'auth' ? 'auth' : err.kind === 'missing' ? 'missing' : 'error') : 'error'); setMessage(e instanceof Error ? e.message : 'Could not read Google Drive.'); }
  }, [p.drive, token]);
  useEffect(() => { if (expanded && !kit && state !== 'missing') void load(); }, [expanded, token]); // eslint-disable-line react-hooks/exhaustive-deps
  async function play(item: DriveItem, type: 'video' | 'audio') {
    if (media[item.id]) { URL.revokeObjectURL(media[item.id].url); setMedia(m => { const { [item.id]: _, ...rest } = m; return rest; }); return; }
    if (type === 'video' && item.size > MAX_INLINE_VIDEO_BYTES) { setMessage(`${item.name} is ${mb(item.size)}, too large to preview in the app. Use “Open in Drive”.`); return; }
    setBusyId(item.id); setMessage('');
    try { const blob = await fetchDriveBlob(token, item.id); setMedia(m => ({ ...m, [item.id]: { url: URL.createObjectURL(blob), type } })); }
    catch (e) { if (e instanceof DriveReadError && e.kind === 'auth') setState('auth'); setMessage(e instanceof Error ? e.message : 'Could not load this file.'); }
    finally { setBusyId(''); }
  }
  async function save(item: DriveItem) {
    setBusyId(item.id); setMessage('');
    try { const blob = await fetchDriveBlob(token, item.id); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = item.name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 30_000); }
    catch (e) { setMessage(e instanceof Error ? e.message : 'Could not save this file.'); }
    finally { setBusyId(''); }
  }
  async function showScript(item: DriveItem) { if (scriptText) { setScriptText(''); return; } setBusyId(item.id); try { setScriptText(await fetchDriveText(token, item.id)); } catch (e) { setMessage(e instanceof Error ? e.message : 'Could not read the script.'); } finally { setBusyId(''); } }
  const roughCut = kit?.master.find(f => /^Full_RoughCut\.mp4$/i.test(f.name));
  const scriptFile = kit?.master.find(f => /Timeline_Script\.txt$/i.test(f.name));
  const fullVoice = kit?.master.find(f => /^Full_Voiceover\.mp3$/i.test(f.name));
  const captions = kit?.master.find(f => /Captions\.srt$/i.test(f.name));
  const Row = ({ item, kind }: { item: DriveItem; kind: 'video' | 'audio' }) => <li className="rounded-xl border border-white/10 bg-black/20 p-3">
    <div className="flex items-center gap-2"><span className="min-w-0 flex-1 truncate text-xs text-slate-200">{item.name}{item.size ? ` · ${mb(item.size)}` : ''}</span>
      <button onClick={() => void play(item, kind)} disabled={busyId === item.id} className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-bold disabled:opacity-50">{busyId === item.id ? 'Loading…' : media[item.id] ? 'Close' : kind === 'video' ? 'Watch' : 'Listen'}</button>
      <button onClick={() => void save(item)} disabled={busyId === item.id} aria-label={`Save ${item.name}`} className="grid h-8 w-8 place-items-center rounded-lg bg-white/10 disabled:opacity-50"><Download size={14} /></button>
      {item.webViewLink && <a href={item.webViewLink} target="_blank" rel="noopener noreferrer" aria-label={`Open ${item.name} in Drive`} className="grid h-8 w-8 place-items-center rounded-lg bg-white/10"><ExternalLink size={14} /></a>}</div>
    {media[item.id] && (media[item.id].type === 'video' ? <video src={media[item.id].url} controls playsInline className="mt-3 w-full rounded-lg bg-black" /> : <audio src={media[item.id].url} controls className="mt-3 w-full" />)}
  </li>;
  return <article className="rounded-2xl border border-emerald-400/20 bg-[#111521]">
    <button onClick={() => setExpanded(v => !v)} aria-expanded={expanded} className="flex w-full items-center gap-3 p-4 text-left"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-400/10 text-emerald-300"><CheckCircle2 size={20} /></span><span className="min-w-0 flex-1"><span className="block truncate font-bold">{p.title}</span><span className="block text-xs text-slate-400">Exported {ago(p.drive!.exportedAt)} · {p.drive!.fileCount} files in Google Drive</span></span><ChevronDown size={18} className={`shrink-0 text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`} /></button>
    {expanded && <div className="space-y-4 border-t border-white/10 p-4">
      {state === 'loading' && <p className="flex items-center gap-2 text-sm text-slate-400"><LoaderCircle size={16} className="animate-spin" /> Reading from Google Drive…</p>}
      {message && <p role="alert" className={`rounded-xl border px-3 py-2 text-xs leading-5 ${state === 'idle' ? 'border-amber-400/30 bg-amber-400/10 text-amber-100' : 'border-red-400/30 bg-red-500/10 text-red-200'}`}>{message}</p>}
      {state === 'auth' && <button onClick={() => requestDriveConnect()} className="flex w-full items-center justify-center gap-2 rounded-xl bg-violet-500 px-4 py-3 text-sm font-bold"><Cloud size={16} /> {token ? 'Reconnect Google Drive' : 'Connect Google Drive'}</button>}
      {(state === 'error') && <button onClick={() => void load()} className="flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2 text-sm font-semibold"><RefreshCw size={15} /> Try again</button>}
      {state === 'missing' && <button onClick={onDelete} className="flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2 text-sm font-semibold"><Trash2 size={15} /> Remove from history</button>}
      {kit && <>
        {roughCut && <section><h3 className="mb-2 flex items-center gap-2 text-sm font-bold"><Film size={15} className="text-violet-300" /> Rough cut</h3><ul><Row item={roughCut} kind="video" /></ul></section>}
        <section><h3 className="mb-2 flex items-center gap-2 text-sm font-bold"><Film size={15} className="text-violet-300" /> Video clips ({kit.videos.length})</h3>{kit.videos.length ? <ul className="space-y-2">{kit.videos.map(v => <Row key={v.id} item={v} kind="video" />)}</ul> : <p className="text-xs text-slate-500">No video clips were exported for this project.</p>}</section>
        <section><h3 className="mb-2 flex items-center gap-2 text-sm font-bold"><Mic2 size={15} className="text-violet-300" /> Voice files ({kit.voices.length + (fullVoice ? 1 : 0)})</h3>{(fullVoice || kit.voices.length) ? <ul className="space-y-2">{fullVoice && <Row item={fullVoice} kind="audio" />}{kit.voices.map(v => <Row key={v.id} item={v} kind="audio" />)}</ul> : <p className="text-xs text-slate-500">No voiceover was exported for this project.</p>}</section>
        <section><h3 className="mb-2 flex items-center gap-2 text-sm font-bold"><FileText size={15} className="text-violet-300" /> Script & captions</h3><div className="flex flex-wrap gap-2">{scriptFile && <button onClick={() => void showScript(scriptFile)} disabled={busyId === scriptFile.id} className="rounded-lg bg-white/10 px-3 py-2 text-xs font-bold disabled:opacity-50">{scriptText ? 'Hide script' : busyId === scriptFile.id ? 'Loading…' : 'Read script'}</button>}{scriptFile && <button onClick={() => void save(scriptFile)} className="rounded-lg bg-white/10 px-3 py-2 text-xs font-bold">Save script</button>}{captions && <button onClick={() => void save(captions)} className="rounded-lg bg-white/10 px-3 py-2 text-xs font-bold">Save captions</button>}</div>{scriptText && <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap rounded-xl border border-white/10 bg-black/30 p-3 text-xs leading-5 text-slate-300">{scriptText}</pre>}</section>
      </>}
      <div className="flex flex-wrap items-center gap-3 border-t border-white/10 pt-3 text-xs"><a href={p.drive!.folderUrl} target="_blank" rel="noopener noreferrer" className="font-bold text-emerald-300 underline">Open folder in Drive ↗</a><button onClick={onDelete} className="ml-auto flex items-center gap-1.5 text-slate-400"><Trash2 size={13} /> Remove from history</button></div>
    </div>}
  </article>;
}
