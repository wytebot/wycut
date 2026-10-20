'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { LoaderCircle, Trash2, PlayCircle, CheckCircle2, Cloud, ChevronDown, FileText, Mic2, Film, ExternalLink, Download, RefreshCw, Plus } from 'lucide-react';
import type { ProjectRecord } from '@/lib/projects/store';
import { listProjects } from '@/lib/projects/store';
import { requestOpenProject } from '@/lib/projects/bus';
import { requestDriveConnect, requestOpenDriveProject, readDriveToken } from '@/lib/projects/bus';
import { DRIVE_TOKEN_EVENT } from '@/lib/projects/bus';
import { listWyCutProjectFolders, deleteDriveFile, loadProductionKit, fetchDriveBlob, fetchDriveText, DriveReadError, type DriveKit, type DriveItem } from '@/lib/drive/read';

const MAX_INLINE_VIDEO_BYTES = 150 * 1024 * 1024;
function ago(ts: number): string { const s = Math.max(1, Math.round((Date.now() - ts) / 1000)); if (s < 60) return 'just now'; if (s < 3600) return `${Math.round(s / 60)} min ago`; if (s < 86400) return `${Math.round(s / 3600)} h ago`; return new Date(ts).toLocaleDateString(); }
const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;

export function HistoryView() {
  const [projects, setProjects] = useState<ProjectRecord[] | null>(null);
  const [localProjects, setLocalProjects] = useState<ProjectRecord[]>([]);
  const [driveConnected, setDriveConnected] = useState(false);
  const [message, setMessage] = useState('');
  const refresh = useCallback(async () => {
    setLocalProjects(await listProjects());
    const token = readDriveToken();
    setDriveConnected(Boolean(token));
    if (!token) { setProjects([]); return; }
    try {
      const folders = await listWyCutProjectFolders(token);
      setProjects(folders.map(folder => ({
        id: folder.id, title: folder.name.replace(/^WyCut_/, '').replace(/_10Min_Kit$/, '').replace(/_/g, ' ') || 'WyCut project',
        mode: 'file', status: 'exported', createdAt: Date.parse(folder.modifiedTime || '') || Date.now(), updatedAt: Date.parse(folder.modifiedTime || '') || Date.now(),
        drive: { folderId: folder.id, folderUrl: folder.webViewLink || `https://drive.google.com/drive/folders/${folder.id}`, exportedAt: Date.parse(folder.modifiedTime || '') || Date.now(), fileCount: 0 },
      } as ProjectRecord)));
      setMessage('');
    } catch (error) { setProjects([]); setMessage(error instanceof Error ? error.message : 'Could not read project history from Google Drive.'); }
  }, []);
  useEffect(() => { void refresh(); const onFocus = () => void refresh(); window.addEventListener('focus', onFocus); window.addEventListener(DRIVE_TOKEN_EVENT, onFocus); const timer = window.setInterval(() => void refresh(), 30000); return () => { window.removeEventListener('focus', onFocus); window.removeEventListener(DRIVE_TOKEN_EVENT, onFocus); window.clearInterval(timer); }; }, [refresh]);
  return <main className="min-h-screen bg-[#080a10] px-4 pb-28 pt-8 text-white sm:px-8"><div className="mx-auto max-w-3xl">
    <header className="mb-6"><div className="flex items-center justify-between gap-3"><div><h1 className="text-2xl font-black sm:text-4xl">Your projects</h1><p className="mt-2 text-sm text-slate-400">Recent editing projects are saved on this device immediately. Exported projects are also available in Google Drive.</p></div><Link href="/dashboard" aria-label="Create new project" className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-violet-500 text-white shadow-lg"><Plus size={24}/></Link></div><button onClick={() => requestDriveConnect()} className="mt-3 rounded-xl border border-white/10 px-3 py-2 text-xs font-bold text-violet-200">{driveConnected ? 'Reconnect Google Drive' : 'Connect Google Drive'}</button></header>
    {message && <p role="alert" className="mb-4 rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-100">{message}</p>}
    {projects === null && <p className="flex items-center gap-2 text-sm text-slate-400"><LoaderCircle size={16} className="animate-spin" /> Reading your Google Drive…</p>}
    {projects !== null && !driveConnected && localProjects.length === 0 && <div className="rounded-2xl border border-dashed border-white/15 p-8 text-center"><Cloud className="mx-auto mb-3 text-violet-300" size={28}/><h2 className="font-bold">Connect Google Drive</h2><p className="mt-2 text-sm leading-6 text-slate-400">Connect Drive to see projects saved to your account. Local editing history is available below; connect Drive to browse exported project files.</p><button onClick={() => requestDriveConnect()} className="mt-4 rounded-xl bg-violet-500 px-4 py-3 text-sm font-bold">Connect Google Drive</button></div>}
    {projects !== null && driveConnected && projects.length === 0 && !message && <div className="rounded-2xl border border-dashed border-white/15 p-8 text-center text-sm leading-6 text-slate-400">No WyCut project folders found in the connected Drive. Finish an export to save a project here.<div className="mt-4"><Link href="/dashboard" className="rounded-xl bg-violet-500 px-4 py-2.5 text-sm font-bold">New project</Link></div></div>}
    {localProjects.length > 0 && <section className="mb-6"><h2 className="mb-3 text-sm font-black uppercase tracking-wider text-slate-400">On this device · recent edits</h2><div className="space-y-2">{localProjects.map(p => <button key={p.id} type="button" onClick={() => requestOpenProject(p.id)} className="flex w-full items-center justify-between gap-3 rounded-2xl border border-white/10 bg-[#111521] p-4 text-left"><span className="min-w-0"><strong className="block truncate text-sm">{p.title || p.sourceName || 'Untitled project'}</strong><span className="mt-1 block text-xs text-slate-400">{p.sourceName || 'Source selected'} · {p.status === 'running' ? 'In progress' : p.status === 'failed' ? 'Needs attention' : 'Saved locally'} · {ago(p.updatedAt)}</span></span><span className="shrink-0 rounded-lg bg-violet-500/20 px-3 py-2 text-xs font-bold text-violet-100">Open</span></button>)}</div></section>}
    <div className="space-y-4">{(projects || []).filter(p => p.drive).map(p => <CompletedCard key={p.id} p={p} onDelete={() => void refresh()} />)}</div>
  </div></main>;
}

function CompletedCard({ p, onDelete }: { p: ProjectRecord; onDelete: () => void }) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [token, setToken] = useState('');
  const [kit, setKit] = useState<DriveKit | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'auth' | 'missing' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [media, setMedia] = useState<Record<string, { url: string; type: 'video' | 'audio' }>>({});
  const [busyId, setBusyId] = useState('');
  const [scriptText, setScriptText] = useState('');
  const [deleting, setDeleting] = useState(false);
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
  async function removeProject() {
    if (!p.drive || !token || !window.confirm(`Permanently move “${p.title}” and its exported files to Google Drive trash?`)) return;
    setDeleting(true); setMessage('');
    try { await deleteDriveFile(token, p.drive.folderId); onDelete(); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Could not remove this project from Drive.'); }
    finally { setDeleting(false); }
  }
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
  const projectManifest = kit?.master.find(f => /^Project\.json$/i.test(f.name));
  const Row = ({ item, kind }: { item: DriveItem; kind: 'video' | 'audio' }) => <li className="rounded-xl border border-white/10 bg-black/20 p-3">
    <div className="flex items-center gap-2"><span className="min-w-0 flex-1 truncate text-xs text-slate-200">{item.name}{item.size ? ` · ${mb(item.size)}` : ''}</span>
      <button onClick={() => void play(item, kind)} disabled={busyId === item.id} className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-bold disabled:opacity-50">{busyId === item.id ? 'Loading…' : media[item.id] ? 'Close' : kind === 'video' ? 'Watch' : 'Listen'}</button>
      <button onClick={() => void save(item)} disabled={busyId === item.id} aria-label={`Save ${item.name}`} className="grid h-8 w-8 place-items-center rounded-lg bg-white/10 disabled:opacity-50"><Download size={14} /></button>
      {item.webViewLink && <a href={item.webViewLink} target="_blank" rel="noopener noreferrer" aria-label={`Open ${item.name} in Drive`} className="grid h-8 w-8 place-items-center rounded-lg bg-white/10"><ExternalLink size={14} /></a>}</div>
    {media[item.id] && (media[item.id].type === 'video' ? <video src={media[item.id].url} controls playsInline className="mt-3 w-full rounded-lg bg-black" /> : <audio src={media[item.id].url} controls className="mt-3 w-full" />)}
  </li>;
  return <article className="rounded-2xl border border-emerald-400/20 bg-[#111521]">
    <button onClick={() => setExpanded(v => !v)} aria-expanded={expanded} className="flex w-full items-center gap-3 p-4 text-left"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-400/10 text-emerald-300"><CheckCircle2 size={20} /></span><span className="min-w-0 flex-1"><span className="block truncate font-bold">{p.title}</span><span className="block text-xs text-slate-400">Saved in Google Drive · {ago(p.drive!.exportedAt)}</span></span><ChevronDown size={18} className={`shrink-0 text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`} /></button>
    {expanded && <div className="space-y-4 border-t border-white/10 p-4">
      {state === 'loading' && <p className="flex items-center gap-2 text-sm text-slate-400"><LoaderCircle size={16} className="animate-spin" /> Reading from Google Drive…</p>}
      {message && <p role="alert" className={`rounded-xl border px-3 py-2 text-xs leading-5 ${state === 'idle' ? 'border-amber-400/30 bg-amber-400/10 text-amber-100' : 'border-red-400/30 bg-red-500/10 text-red-200'}`}>{message}</p>}
      {state === 'auth' && <button onClick={() => requestDriveConnect()} className="flex w-full items-center justify-center gap-2 rounded-xl bg-violet-500 px-4 py-3 text-sm font-bold"><Cloud size={16} /> {token ? 'Reconnect Google Drive' : 'Connect Google Drive'}</button>}
      {(state === 'error') && <button onClick={() => void load()} className="flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2 text-sm font-semibold"><RefreshCw size={15} /> Try again</button>}
      {state === 'missing' && <button onClick={onDelete} className="flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2 text-sm font-semibold"><Trash2 size={15} /> Remove from history</button>}
      {kit && <>
        {projectManifest && <button onClick={() => { requestOpenDriveProject(p.drive!.folderId); router.push('/dashboard'); }} className="flex w-full items-center justify-center gap-2 rounded-xl bg-violet-500 px-4 py-3 text-sm font-bold"><PlayCircle size={16}/> Continue editing</button>}
        {roughCut && <section><h3 className="mb-2 flex items-center gap-2 text-sm font-bold"><Film size={15} className="text-violet-300" /> Rough cut</h3><ul><Row item={roughCut} kind="video" /></ul></section>}
        <section><h3 className="mb-2 flex items-center gap-2 text-sm font-bold"><Film size={15} className="text-violet-300" /> Video clips ({kit.videos.length})</h3>{kit.videos.length ? <ul className="space-y-2">{kit.videos.map(v => <Row key={v.id} item={v} kind="video" />)}</ul> : <p className="text-xs text-slate-500">No video clips were exported for this project.</p>}</section>
        <section><h3 className="mb-2 flex items-center gap-2 text-sm font-bold"><Mic2 size={15} className="text-violet-300" /> Voice files ({kit.voices.length + (fullVoice ? 1 : 0)})</h3>{(fullVoice || kit.voices.length) ? <ul className="space-y-2">{fullVoice && <Row item={fullVoice} kind="audio" />}{kit.voices.map(v => <Row key={v.id} item={v} kind="audio" />)}</ul> : <p className="text-xs text-slate-500">No voiceover was exported for this project.</p>}</section>
        <section><h3 className="mb-2 flex items-center gap-2 text-sm font-bold"><FileText size={15} className="text-violet-300" /> Script & project</h3><div className="flex flex-wrap gap-2">{projectManifest && <button onClick={() => void save(projectManifest)} className="rounded-lg bg-violet-500/20 px-3 py-2 text-xs font-bold text-violet-200">Download editable project</button>}{scriptFile && <button onClick={() => void showScript(scriptFile)} disabled={busyId === scriptFile.id} className="rounded-lg bg-white/10 px-3 py-2 text-xs font-bold disabled:opacity-50">{scriptText ? 'Hide script' : busyId === scriptFile.id ? 'Loading…' : 'Read script'}</button>}{scriptFile && <button onClick={() => void save(scriptFile)} className="rounded-lg bg-white/10 px-3 py-2 text-xs font-bold">Save script</button>}{captions && <button onClick={() => void save(captions)} className="rounded-lg bg-white/10 px-3 py-2 text-xs font-bold">Save captions</button>}</div>{scriptText && <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap rounded-xl border border-white/10 bg-black/30 p-3 text-xs leading-5 text-slate-300">{scriptText}</pre>}</section>
      </>}
      <div className="flex flex-wrap items-center gap-3 border-t border-white/10 pt-3 text-xs"><a href={p.drive!.folderUrl} target="_blank" rel="noopener noreferrer" className="font-bold text-emerald-300 underline">Open folder in Drive ↗</a><button onClick={() => void removeProject()} disabled={deleting} className="ml-auto flex items-center gap-1.5 text-slate-400 disabled:opacity-50"><Trash2 size={13} /> {deleting ? 'Removing…' : 'Delete project'}</button></div>
    </div>}
  </article>;
}
