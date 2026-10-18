'use client';

import Script from 'next/script';
import Link from 'next/link';
import { useEffect, useState, type ChangeEvent, type DragEvent } from 'react';
import { Cloud, FileText, Link2, UploadCloud, CheckCircle2, AlertCircle, Clapperboard, Mic2, Scissors, FolderUp, LoaderCircle, Download } from 'lucide-react';
import { sliceVideoLocally, concatenateClipsLocally, type SlicedClip } from '@/lib/ffmpeg/client-slicer';
import { exportProductionKit, type DriveExportFile } from '@/lib/drive/export';
import { Capacitor } from '@capacitor/core';
import { signInWithGoogleNative } from '@/lib/auth/google-native';
import { apiUrl } from '@/lib/api-client';
import type { RecapScript } from '@/lib/ai/script-generator';

type GoogleTokenResponse = { access_token?: string; error?: string };
type GoogleIdentity = { accounts: { oauth2: { initTokenClient: (config: { client_id: string; scope: string; callback: (response: GoogleTokenResponse) => void }) => { requestAccessToken: () => void } } } };
declare global { interface Window { google?: GoogleIdentity } }
type Narration = { provider: string; captionsSrt: string; fullVoiceover: Blob; segments: Array<{ index: number; id: string; filename: string; text: string; audio: Blob }> };
type SourceMode = 'url' | 'srt';
const MAX_SUBTITLE_URL_BYTES = 5 * 1024 * 1024;
function platformWatchUrl(value: string): 'YouTube' | 'TikTok' | null { try { const host = new URL(value).hostname.toLowerCase().replace(/^www\./, ''); if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtu.be' || host === 'youtube-nocookie.com') return 'YouTube'; if (host === 'tiktok.com' || host.endsWith('.tiktok.com')) return 'TikTok'; return null; } catch { return null; } }
function transcriptText(raw: string, name = ''): string { const isVtt = /^\s*WEBVTT/i.test(raw) || /\.vtt(?:$|[?#])/i.test(name); if (!isVtt) return raw.replace(/^\uFEFF/, '').trim(); return raw.replace(/^\uFEFF?WEBVTT[^\n]*\n/i, '').replace(/<[^>]+>/g, '').replace(/(\d{2}:\d{2}:\d{2}\.\d{3})\s+[^-\n]+(-->)/g, '$1 $2').trim(); }
function filenameFromUrl(value: string): string { try { const leaf = decodeURIComponent(new URL(value).pathname.split('/').filter(Boolean).pop() || 'source-video.mp4'); return leaf.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120) || 'source-video.mp4'; } catch { return 'source-video.mp4'; } }
async function readBlobWithLimit(response: Response, maxBytes: number, label: string): Promise<Blob> { if (!response.body) { const buffer = await response.arrayBuffer(); if (buffer.byteLength > maxBytes) throw new Error(`${label} exceeds the ${Math.round(maxBytes / 1024 / 1024)} MB safety limit.`); return new Blob([buffer], { type: response.headers.get('content-type') || 'application/octet-stream' }); } const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let total = 0; try { while (true) { const { done, value } = await reader.read(); if (done) break; if (!value) continue; total += value.byteLength; if (total > maxBytes) { await reader.cancel(); throw new Error(`${label} exceeds the ${Math.round(maxBytes / 1024 / 1024)} MB safety limit.`); } chunks.push(value); } } finally { reader.releaseLock(); } return new Blob(chunks, { type: response.headers.get('content-type') || 'application/octet-stream' }); }
const decodeAudio = (value: string) => { const raw = atob(value); const bytes = new Uint8Array(raw.length); for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i); return new Blob([bytes], { type: 'audio/mpeg' }); };
async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length)));
  }
  return btoa(binary);
}
async function download(blob: Blob, name: string) {
  if (Capacitor.isNativePlatform()) {
    // Large base64 conversions can exhaust Android WebView memory. Use Drive for video kits.
    if (blob.size > 25 * 1024 * 1024) throw new Error('This file is too large for safe in-app saving on Android. Connect Google Drive and export the production kit instead.');
    const [{ Filesystem, Directory }, { Share }] = await Promise.all([
      import('@capacitor/filesystem'), import('@capacitor/share'),
    ]);
    const result = await Filesystem.writeFile({ path: name, data: await blobToBase64(blob), directory: Directory.Cache, recursive: true });
    await Share.share({ title: name, text: `WyCut export: ${name}`, url: result.uri, dialogTitle: 'Save or share WyCut file' });
    return;
  }
  const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = name; a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
function formatSrtTime(seconds: number): string {
  const ms = Math.max(0, Math.round(seconds * 1000));
  const h = Math.floor(ms / 3600000), m = Math.floor(ms % 3600000 / 60000), sec = Math.floor(ms % 60000 / 1000), milli = ms % 1000;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')},${String(milli).padStart(3, '0')}`;
}
function getVideoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    const url = URL.createObjectURL(file);
    const cleanup = () => { video.onloadedmetadata = null; video.onerror = null; URL.revokeObjectURL(url); video.removeAttribute('src'); video.load(); };
    video.preload = 'metadata';
    video.onloadedmetadata = () => { const duration = video.duration; cleanup(); if (Number.isFinite(duration) && duration > 0) resolve(duration); else reject(new Error('Could not read the source video duration.')); };
    video.onerror = () => { cleanup(); reject(new Error('The selected video could not be opened by this device.')); };
    video.src = url;
  });
}
function buildCaptionsSrt(beats: RecapScript['beats']): string {
  let elapsed = 0;
  return beats.map((beat, index) => {
    const words = beat.narration.replace(/\s+/g, ' ').trim().split(' ').length;
    const duration = Math.max(2.2, words / 2.45);
    const start = elapsed; const end = elapsed + duration; elapsed = end + 0.18;
    return `${index + 1}\n${formatSrtTime(start)} --> ${formatSrtTime(end)}\n${beat.narration.replace(/\s+/g, ' ').trim()}\n`;
  }).join('\n');
}
export default function DashboardPage() {
  const [mode, setMode] = useState<SourceMode>('url'); const [url, setUrl] = useState(''); const [subtitleUrl, setSubtitleUrl] = useState(''); const [file, setFile] = useState<File | null>(null); const [video, setVideo] = useState<File | null>(null); const [title, setTitle] = useState('My Movie');
  const [notice, setNotice] = useState(''); const [busy, setBusy] = useState(false); const [stage, setStage] = useState(''); const [progress, setProgress] = useState(0);
  const [script, setScript] = useState<RecapScript | null>(null); const [recapId, setRecapId] = useState(''); const [idToken, setIdToken] = useState(''); const [narration, setNarration] = useState<Narration | null>(null); const [clips, setClips] = useState<SlicedClip[]>([]); const [roughCut, setRoughCut] = useState<Blob | null>(null); const [driveToken, setDriveToken] = useState(''); const [driveFolder, setDriveFolder] = useState(''); const [googleReady, setGoogleReady] = useState(false); const [isNativeApp, setIsNativeApp] = useState(false); const [platformResolved, setPlatformResolved] = useState(false); const [showClipDownloads, setShowClipDownloads] = useState(false);
  useEffect(() => { const native = Capacitor.isNativePlatform(); setIsNativeApp(native); setPlatformResolved(true); if (native) setGoogleReady(true); try { setIdToken(sessionStorage.getItem('wycut_google_id_token') || ''); } catch { setIdToken(''); } }, []);
  const selectFile = (candidate?: File) => {
    if (!candidate) return;
    if (!/\.(srt|vtt|txt)$/i.test(candidate.name) && !['text/plain','text/vtt','application/x-subrip'].includes(candidate.type)) {
      setFile(null); setScript(null); setNarration(null); setClips([]); setRoughCut(null);
      setNotice('Choose a valid .SRT, .VTT or plain-text transcript file. Previous generated outputs were cleared.'); return;
    }
    if (candidate.size > 5 * 1024 * 1024) {
      setFile(null); setScript(null); setNarration(null); setClips([]); setRoughCut(null);
      setNotice('Subtitle files must be smaller than 5 MB. Previous generated outputs were cleared.'); return;
    }
    setFile(candidate); setScript(null); setNarration(null); setClips([]); setRoughCut(null); setNotice('');
  };
  const onInput = (e: ChangeEvent<HTMLInputElement>) => selectFile(e.target.files?.[0]); const onDrop = (e: DragEvent<HTMLLabelElement>) => { e.preventDefault(); selectFile(e.dataTransfer.files?.[0]); };
  function selectVideo(candidate?: File) {
    if (!candidate) return;
    const extension = candidate.name.split('.').pop()?.toLowerCase();
    if (!['mp4', 'm4v', 'mov'].includes(extension || '')) {
      setVideo(null); setClips([]); setRoughCut(null);
      setNotice('Choose an MP4, M4V or MOV video. Other containers are not supported by the lossless slicer. Previous video outputs were cleared.');
      return;
    }
    const maxBytes = Capacitor.isNativePlatform() ? 100 * 1024 * 1024 : 700 * 1024 * 1024;
    if (candidate.size > maxBytes) {
      setVideo(null); setClips([]); setRoughCut(null);
      setNotice(`This ${Capacitor.isNativePlatform() ? 'Android' : 'browser'} build limits source videos to ${Capacitor.isNativePlatform() ? '100' : '700'} MB to reduce out-of-memory crashes. Previous video outputs were cleared.`);
      return;
    }
    setVideo(candidate); setClips([]); setRoughCut(null); setNotice('');
  }
  async function downloadFile(blob: Blob, name: string) {
    try { await download(blob, name); }
    catch (error) { setNotice(error instanceof Error ? error.message : `Could not save ${name}.`); }
  }
  async function openDriveFolder() {
    if (!driveFolder) return;
    try {
      if (Capacitor.isNativePlatform()) {
        const { Browser } = await import('@capacitor/browser');
        await Browser.open({ url: driveFolder });
      } else window.open(driveFolder, '_blank', 'noopener,noreferrer');
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not open the Google Drive folder.'); }
  }
  async function connectDrive() { if (Capacitor.isNativePlatform()) { try { const user = await signInWithGoogleNative(); if (!user.authentication.accessToken) { setNotice('Native Google sign-in succeeded but no Drive access token was returned. Verify Android OAuth scopes/configuration.'); return; } setDriveToken(user.authentication.accessToken); setDriveFolder(''); setNotice(`Connected as ${user.email}. Access token is held in memory only.`); } catch (e) { setNotice(e instanceof Error ? e.message : 'Native Google sign-in failed.'); } return; } const clientId = process.env.NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID; if (!clientId) { setNotice('Set NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID in your deployment settings first.'); return; } if (!window.google?.accounts?.oauth2) { setNotice('Google sign-in library is still loading. Try again in a moment.'); return; } const client = window.google.accounts.oauth2.initTokenClient({ client_id: clientId, scope: 'https://www.googleapis.com/auth/drive.file', callback: (response) => { if (response.error || !response.access_token) { setNotice(`Google Drive connection failed: ${response.error || 'No access token returned.'}`); return; } setDriveToken(response.access_token); setDriveFolder(''); setNotice('Google Drive connected for this browser session. Access token is held in memory only.'); } }); client.requestAccessToken(); }
  async function loadVideoFromUrl() {
    if (!url.trim()) { setNotice('Paste a direct downloadable video URL first.'); return; }
    let parsed: URL; try { parsed = new URL(url.trim()); } catch { setNotice('Enter a valid HTTPS video URL.'); return; }
    if (parsed.protocol !== 'https:') { setNotice('For safety, source URLs must use HTTPS.'); return; }
    const platform = platformWatchUrl(parsed.toString());
    if (platform) { setNotice(`${platform} watch-page links are not direct video files. Official public APIs do not provide WyCut a generic full-video download URL. For videos you own or have permission to edit, use the platform's authorized export/download and select that file below, or paste a direct HTTPS MP4/M4V/MOV file URL from a host that permits browser downloads. You can still paste a subtitle URL below.`); return; }
    setBusy(true); setStage('Downloading source video into this device…'); setProgress(0); setNotice('');
    try {
      const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 120_000);
      let response: Response; try { response = await fetch(parsed.toString(), { method: 'GET', mode: 'cors', credentials: 'omit', cache: 'no-store', signal: controller.signal }); } finally { clearTimeout(timer); }
      if (!response.ok) throw new Error(`Source host returned HTTP ${response.status}.`);
      const declaredSize = Number(response.headers.get('content-length') || 0); const maxBytes = Capacitor.isNativePlatform() ? 100 * 1024 * 1024 : 700 * 1024 * 1024;
      if (declaredSize > maxBytes) throw new Error(`Source is larger than this ${Capacitor.isNativePlatform() ? 'Android' : 'browser'} build's ${Capacitor.isNativePlatform() ? '100 MB' : '700 MB'} safety limit.`);
      const blob = await readBlobWithLimit(response, maxBytes, 'Downloaded source'); if (!blob.size) throw new Error('The URL returned an empty file.');
      const type = (response.headers.get('content-type') || blob.type || '').split(';')[0].toLowerCase();
      if (type && !type.startsWith('video/') && type !== 'application/octet-stream') throw new Error(`The URL returned ${type}, not a video file. Paste a direct MP4/M4V/MOV URL, not a webpage.`);
      const name = filenameFromUrl(parsed.toString()); const ext = name.split('.').pop()?.toLowerCase();
      if (!['mp4','m4v','mov'].includes(ext || '') && !['video/mp4','video/quicktime','application/octet-stream'].includes(type)) throw new Error('Only MP4, M4V and MOV direct video files are supported by the current fast slicer.');
      const finalName = ['mp4','m4v','mov'].includes(ext || '') ? name : `${name.replace(/\.[^.]+$/, '') || 'source-video'}.mp4`;
      const downloaded = new File([blob], finalName, { type: type || 'video/mp4', lastModified: Date.now() });
      selectVideo(downloaded); setNotice(`Source downloaded to this device (${(downloaded.size / 1024 / 1024).toFixed(1)} MB). It will be cut locally; only the selected clips are uploaded to your Google Drive.`);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Could not download source URL.';
      setNotice(/Failed to fetch|CORS|NetworkError/i.test(message) ? 'The source host blocks browser downloads (CORS). Use a direct-download host that permits browser access, or select an authorized video file from your device. WyCut does not proxy large videos through its server.' : message.includes('aborted') ? 'Source download timed out. Try a faster direct link or a smaller file.' : message);
    } finally { setBusy(false); setStage(''); }
  }
  async function getTranscript(): Promise<{ text: string; label: string }> {
    if (mode === 'url' && subtitleUrl.trim()) {
      let parsed: URL; try { parsed = new URL(subtitleUrl.trim()); } catch { throw new Error('Enter a valid HTTPS subtitle/transcript URL.'); }
      if (parsed.protocol !== 'https:') throw new Error('Subtitle URLs must use HTTPS.');
      const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 30_000);
      let response: Response; try { response = await fetch(parsed.toString(), { mode: 'cors', credentials: 'omit', cache: 'no-store', signal: controller.signal }); } finally { clearTimeout(timer); }
      if (!response.ok) throw new Error(`Subtitle host returned HTTP ${response.status}.`);
      const declared = Number(response.headers.get('content-length') || 0); if (declared > MAX_SUBTITLE_URL_BYTES) throw new Error('Subtitle file exceeds 5 MB.');
      const raw = await response.text(); if (raw.length > MAX_SUBTITLE_URL_BYTES) throw new Error('Subtitle file exceeds 5 MB.');
      const text = transcriptText(raw, parsed.pathname); if (text.length < 40) throw new Error('No readable transcript text was found at that URL. Use a public SRT, VTT, or text transcript URL.');
      return { text, label: filenameFromUrl(parsed.toString()) };
    }
    if (file) { const raw = await file.text(); if (!/\d{2}:\d{2}:\d{2}[,.]\d{3}\s*-->/.test(raw) && !/^\s*WEBVTT/i.test(raw) && raw.trim().length < 40) throw new Error('This does not look like a valid SRT, VTT or text transcript file.'); return { text: transcriptText(raw, file.name), label: file.name }; }
    throw new Error(mode === 'url' ? 'Add a public SRT/VTT transcript URL, or upload a subtitle file below. A video URL alone does not guarantee that subtitles are available.' : 'Upload an SRT or VTT subtitle file first.');
  }
  async function generateScript() { if (!idToken) { setNotice('Sign in with Google and purchase recap credits first. Open Billing / Sign in at the top of this page.'); return; } setBusy(true); setStage('Preparing transcript…'); setNotice(''); setScript(null); setRecapId(''); setNarration(null); setClips([]); setRoughCut(null); try { const source = await getTranscript(); const text = source.text; setStage('Generating script…'); const result = await fetch(apiUrl('/api/script'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: title.trim() || source.label.replace(/\.(srt|vtt|txt)$/i, ''), transcript: text, targetRuntimeSeconds: 600, beatCount: 38, idToken }) }); const data = await result.json(); if (!result.ok) throw new Error(data.error || 'Script generation failed.'); setScript(data.script); setRecapId(data.recapId || ''); setNarration(null); setClips([]); setRoughCut(null); setNotice(`Script generated with ${data.provider}. ${data.script.beats.length} beats ready.`); } catch (e) { setNotice(e instanceof Error ? e.message : 'Could not generate script.'); } finally { setBusy(false); setStage(''); } }
  async function generateVoice() {
    if (!script) return;
    setBusy(true); setStage('Preparing narration…'); setNotice(''); setNarration(null);
    try {
      const batches: Array<RecapScript['beats']> = [];
      let currentBatch: RecapScript['beats'] = [];
      let currentCharacters = 0;
      for (const beat of script.beats) {
        const length = beat.narration.length;
        if (length > 3_500) throw new Error(`Scene ${beat.index} is too long to narrate safely. Regenerate the script with shorter beats.`);
        if (currentBatch.length >= 2 || (currentBatch.length > 0 && currentCharacters + length > 3_500)) {
          batches.push(currentBatch); currentBatch = []; currentCharacters = 0;
        }
        currentBatch.push(beat); currentCharacters += length;
      }
      if (currentBatch.length) batches.push(currentBatch);
      const segments: Narration['segments'] = [];
      const providers = new Set<string>();
      // Keep three API batches in flight: faster on stable connections while each server request still bounds TTS concurrency.
      for (let i = 0; i < batches.length; i += 3) {
        const pair = batches.slice(i, i + 3);
        const responses = await Promise.all(pair.map(async beats => {
          const response = await fetch(apiUrl('/api/narration'), {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ beats, voice: 'onyx', idToken, recapId }), cache: 'no-store',
          });
          const data = await response.json().catch(() => ({})) as { error?: string; provider?: string; segments?: Array<{ index: number; id: string; filename: string; text: string; audioBase64: string }> };
          if (!response.ok) throw new Error(data.error || `Narration batch failed (HTTP ${response.status}).`);
          if (!Array.isArray(data.segments) || !data.segments.length) throw new Error('Narration provider returned no audio segments.');
          if (data.provider) providers.add(data.provider);
          return data.segments;
        }));
        for (const group of responses) {
          for (const item of group) {
            const index = segments.length + 1;
            const audio = decodeAudio(item.audioBase64);
            segments.push({ index, id: item.id, filename: `${String(index).padStart(3, '0')}_${item.id}.mp3`, text: item.text, audio });
          }
        }
        setStage(`Generating narration… ${Math.min(i + pair.length, batches.length)} of ${batches.length} batches complete`);
      }
      if (!segments.length) throw new Error('No narration audio was generated.');
      const provider = providers.size > 1 ? 'mixed' : [...providers][0] || 'unknown';
      const fullVoiceover = new Blob(segments.map(segment => segment.audio), { type: 'audio/mpeg' });
      setNarration({ provider, captionsSrt: buildCaptionsSrt(script.beats), fullVoiceover, segments });
      setNotice(`Narration generated using ${provider}. ${segments.length} MP3 segments ready.`);
    } catch (e) { setNotice(e instanceof Error ? e.message : 'Could not generate narration.'); }
    finally { setBusy(false); setStage(''); }
  }
  async function sliceVideo() { if (!script || !video) { setNotice('Generate a script and choose the source movie file you are authorized to edit.'); return; } setBusy(true); setStage('Loading local FFmpeg…'); setProgress(0); setNotice(''); setClips([]); setRoughCut(null); try { const duration = await getVideoDuration(video); const lastTimestamp = Math.max(...script.beats.map(beat => beat.endSeconds)); if (lastTimestamp > duration + 2) throw new Error(`The script references ${Math.round(lastTimestamp)} seconds, but this source video is only ${Math.round(duration)} seconds long. Upload matching subtitles/source video.`); const output = await sliceVideoLocally(video, script.beats.map(b => ({ index: b.index, id: b.id, startSeconds: b.startSeconds, endSeconds: b.endSeconds })), (p, current, total) => { setProgress(Math.round(p * 100)); setStage(current > 0 ? `Slicing clip ${current} of ${total} locally…` : 'Processing video locally…'); }); setClips(output); setStage('Creating rough cut locally…'); const rough = await concatenateClipsLocally(output, p => setProgress(Math.round(p * 100))); setRoughCut(rough); setNotice(`${output.length} clips and a rough cut created in your browser. Stream-copy cuts may snap to keyframes.`); } catch (e) { setNotice(e instanceof Error ? e.message : 'Local video slicing failed.'); } finally { setBusy(false); setStage(''); } }
  async function exportDrive() { if (!driveToken) { setNotice('Connect Google Drive first.'); return; } if (!clips.length) { setNotice('Slice the source video first.'); return; } if (!script) { setNotice('Generate a recap script before exporting the cuts.'); return; } setBusy(true); setStage('Uploading cut sections directly to your Google Drive…'); setNotice(''); setDriveFolder(''); try { const files: DriveExportFile[] = []; for (const c of clips) files.push({ name: c.filename, mimeType: 'video/mp4', body: c.blob, folder: 'video' }); if (narration) { for (const segment of narration.segments) files.push({ name: segment.filename, mimeType: 'audio/mpeg', body: segment.audio, folder: 'voiceover' }); files.push({ name: 'Full_Voiceover.mp3', mimeType: 'audio/mpeg', body: narration.fullVoiceover, folder: 'master' }); files.push({ name: 'Captions.srt', mimeType: 'text/plain', body: narration.captionsSrt, folder: 'master' }); } files.push({ name: 'Timeline_Script.txt', mimeType: 'text/plain', body: script.beats.map(b => `${String(b.index).padStart(3, '0')} ${b.title}\nSource: ${b.startSeconds.toFixed(2)}s–${b.endSeconds.toFixed(2)}s | Act ${b.act}\n${b.narration}\n${b.dialogueCues.map(c => `[LET MOVIE AUDIO PLAY: ${c.startSeconds}s - ${c.quote || c.instruction}]`).join('\n')}\n`).join('\n'), folder: 'master' }); if (roughCut) files.push({ name: 'Full_RoughCut.mp4', mimeType: 'video/mp4', body: roughCut, folder: 'master' }); const result = await exportProductionKit(driveToken, title || script.title, files); setDriveFolder(result.folderUrl); setNotice(`Export complete: ${result.uploaded.length} files uploaded directly to Drive, including ${clips.length} cut video sections${narration ? ' and narration files' : ''}.`); } catch (e) { setNotice(e instanceof Error ? e.message : 'Drive export failed.'); } finally { setBusy(false); setStage(''); } }
  return <main className="min-h-screen bg-[#080a10] px-4 py-8 text-white sm:px-8">{platformResolved && !isNativeApp && <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" onLoad={() => setGoogleReady(true)} onError={() => setNotice('Google sign-in library could not load. Check your connection or try again.')} />}<div className="mx-auto max-w-6xl"><header className="mb-9 flex flex-wrap items-center justify-between gap-4"><div><div className="flex items-center gap-4"><Link href="/" className="text-sm text-violet-300">← WyCut</Link><Link href="/login?next=/dashboard" className="rounded-lg border border-violet-400/30 bg-violet-500/10 px-3 py-2 text-xs font-bold text-violet-200">Sign in / account</Link><Link href="/billing" className="rounded-lg border border-white/10 px-3 py-2 text-xs font-bold text-slate-300">Billing</Link></div><h1 className="mt-2 text-3xl font-black sm:text-4xl">Recap Studio</h1><p className="mt-2 text-slate-400">Create a script, narration and edit-ready files.</p></div><div className="rounded-xl border border-white/10 bg-white/[.03] px-4 py-3"><div className="flex items-center gap-2"><Cloud size={18} className={driveToken ? 'text-emerald-400' : 'text-slate-400'}/><span className="text-sm font-semibold">Google Drive</span></div><p className="mt-1 text-xs text-slate-400">{driveToken ? 'Connected in this session' : 'Not connected'} · drive.file scope</p><button disabled={!isNativeApp && !googleReady} onClick={connectDrive} className="mt-2 text-xs font-bold text-violet-300 disabled:opacity-40">{driveToken ? 'Reconnect Drive' : googleReady ? 'Connect Drive' : 'Loading Google…'}</button></div></header>
  <div className="grid gap-6 lg:grid-cols-[1fr_310px]"><section className="space-y-5"><div className="rounded-2xl border border-white/10 bg-[#111521] p-5 sm:p-7"><h2 className="mb-4 flex items-center gap-2 text-lg font-bold"><Clapperboard size={20} className="text-violet-300"/> 1. Source material</h2><label className="mb-2 block text-sm font-semibold">Movie / project title</label><input value={title} onChange={e=>setTitle(e.target.value)} maxLength={160} className="mb-5 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 outline-none focus:ring-2 focus:ring-violet-400"/><div className="mb-4 flex gap-2 rounded-xl bg-black/20 p-1"><button type="button" onClick={()=>setMode('url')} className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-3 text-sm font-semibold ${mode==='url'?'bg-violet-500 text-white':'text-slate-400'}`}><Link2 size={16}/> Video / transcript URLs</button><button onClick={()=>setMode('srt')} className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-3 text-sm font-semibold ${mode==='srt'?'bg-violet-500 text-white':'text-slate-400'}`}><FileText size={16}/> Subtitle file</button></div>{mode==='url'&&<div className="space-y-3"><label className="block text-sm font-semibold">Direct video file URL</label><input value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://your-host.example/movie.mp4" inputMode="url" className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 outline-none focus:ring-2 focus:ring-violet-400"/><button disabled={busy||!url.trim()} onClick={()=>void loadVideoFromUrl()} className="w-full rounded-xl border border-violet-400/30 bg-violet-500/10 px-4 py-3 text-sm font-bold text-violet-200 disabled:opacity-40">{busy&&stage.includes('Downloading')?'Downloading source…':video?'Replace source video from URL':'Download source video from URL'}</button><label className="mt-2 block text-sm font-semibold">Subtitle / transcript URL (optional if uploading a subtitle file)</label><input value={subtitleUrl} onChange={e=>setSubtitleUrl(e.target.value)} placeholder="https://your-host.example/captions.en.vtt" inputMode="url" className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 outline-none focus:ring-2 focus:ring-violet-400"/><p className="text-xs leading-5 text-slate-400">Direct HTTPS video files and public SRT/VTT/text transcript URLs work when the host allows browser access (CORS). YouTube/TikTok watch-page URLs are not downloadable media files; use a permitted download/export for videos you own or have rights to edit, then select the file below. WyCut does not bypass platform restrictions.</p></div>}{(mode==='srt'||mode==='url')&&<div className="mt-4"><label className="mb-2 block text-sm font-semibold">{mode==='url'?'Or upload subtitles / transcript':'Subtitle file'} (.SRT or .VTT)</label><label onDragOver={e=>e.preventDefault()} onDrop={onDrop} className="flex min-h-28 cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-violet-400/40 bg-violet-400/[.04] p-5 text-center"><UploadCloud size={26} className="mb-2 text-violet-300"/><span className="font-bold">{file?file.name:'Drop your subtitle file here'}</span><span className="mt-2 text-sm text-slate-400">or browse · Max 5 MB</span><input type="file" accept=".srt,.vtt,.txt,text/plain,text/vtt" onChange={onInput} className="sr-only"/></label>{file&&<button onClick={()=>{setFile(null);setScript(null);setNarration(null);setClips([]);setRoughCut(null);setNotice('Subtitle removed; generated outputs were cleared.');}} className="mt-2 text-xs text-slate-400 underline">Remove subtitle file</button>}</div>}<div className="mt-4"><label className="mb-2 block text-sm font-semibold">Source video file (MP4, M4V or MOV)</label><p className="mb-3 text-xs text-slate-500">Video downloads to this device and FFmpeg cuts it locally. Safety limits: 100 MB in Android APK, 700 MB in browser.</p><input type="file" accept=".mp4,.m4v,.mov,video/mp4,video/quicktime" onChange={e=>selectVideo(e.target.files?.[0])} className="block w-full text-sm text-slate-300 file:mr-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-4 file:py-2 file:text-white"/>{video&&<p className="mt-2 text-xs text-emerald-300">Source ready: {video.name} · {(video.size/1024/1024).toFixed(1)} MB</p>}</div><button disabled={busy} onClick={generateScript} className="mt-5 w-full rounded-xl bg-violet-500 px-5 py-3.5 font-bold hover:bg-violet-400 disabled:opacity-50">{busy&&stage.includes('script')?'Generating…':'Generate 10-minute script'}</button></div>
  {script&&<div className="rounded-2xl border border-white/10 bg-[#111521] p-5 sm:p-7"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="flex items-center gap-2 text-lg font-bold"><FileText size={20} className="text-violet-300"/> 2. Narrative script</h2><span className="text-xs text-slate-400">{script.beats.length} scenes · ~10 min</span></div><div className="mt-4 max-h-96 space-y-3 overflow-auto">{script.beats.map(b=><article key={`${b.index}-${b.id}`} className="rounded-xl border border-white/10 bg-black/20 p-4"><div className="flex flex-wrap justify-between gap-2 text-xs text-violet-300"><span>{String(b.index).padStart(3,'0')} · Act {b.act} · {b.title}</span><span>{b.startSeconds.toFixed(1)}s–{b.endSeconds.toFixed(1)}s</span></div><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-300">{b.narration}</p>{b.dialogueCues.map((c,i)=><p key={i} className="mt-2 text-xs text-amber-200">[LET MOVIE AUDIO PLAY: {c.startSeconds}s–{c.endSeconds}s{c.quote?` · “${c.quote}”`:''}]</p>)}</article>)}</div><button disabled={busy} onClick={()=>void downloadFile(new Blob([JSON.stringify(script,null,2)],{type:'application/json'}),'WyCut_Timeline_Script.json')} className="mt-4 inline-flex items-center gap-2 rounded-lg border border-white/10 px-4 py-2 text-sm"><Download size={15}/> Download script JSON</button><button disabled={busy||!script} onClick={generateVoice} className="ml-2 mt-4 inline-flex items-center gap-2 rounded-lg bg-violet-500 px-4 py-2 text-sm font-bold disabled:opacity-50"><Mic2 size={15}/> Generate narration</button></div>}
  {narration&&<div className="rounded-2xl border border-white/10 bg-[#111521] p-5 sm:p-7"><h2 className="flex items-center gap-2 text-lg font-bold"><Mic2 size={20} className="text-violet-300"/> 3. Voiceover & captions</h2><p className="mt-2 text-sm text-slate-400">Provider: {narration.provider} · {narration.segments.length} segments</p><div className="mt-4 flex flex-wrap gap-2"><button onClick={()=>void downloadFile(narration.fullVoiceover,'Full_10Min_Voiceover.mp3')} className="rounded-lg bg-white/10 px-4 py-2 text-sm font-semibold">Download full voiceover</button><button onClick={()=>void downloadFile(new Blob([narration.captionsSrt],{type:'text/plain'}),'Full_Captions.srt')} className="rounded-lg bg-white/10 px-4 py-2 text-sm font-semibold">Download captions SRT</button></div></div>}
  {script&&<div className="rounded-2xl border border-white/10 bg-[#111521] p-5 sm:p-7"><h2 className="flex items-center gap-2 text-lg font-bold"><Scissors size={20} className="text-violet-300"/> 4. Local video slicer</h2><p className="mt-2 text-sm leading-6 text-slate-400">FFmpeg WebAssembly processes your selected source in browser memory using stream copy. Cuts can snap to keyframes and clip ranges must match your source video timeline.</p><button disabled={busy||!video} onClick={sliceVideoLocallyAction} className="mt-4 w-full rounded-xl bg-violet-500 px-4 py-3 font-bold disabled:opacity-50">{clips.length?`Re-slice ${clips.length} clips`:'Slice clips + build rough cut'}</button>{(busy&&stage.toLowerCase().includes('slic'))&&<div className="mt-3 h-2 overflow-hidden rounded bg-white/10"><div className="h-full bg-violet-400" style={{width:`${progress}%`}}/></div>}{clips.length>0&&<div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm"><span className="text-emerald-300">{clips.length} local clips ready</span><button onClick={()=>setShowClipDownloads(value=>!value)} className="rounded-lg bg-white/10 px-3 py-2">{showClipDownloads?'Hide clip files':'Save individual clips'}</button>{roughCut&&<button onClick={()=>void downloadFile(roughCut,'Full_RoughCut.mp4')} className="rounded-lg bg-white/10 px-3 py-2">Save rough cut</button>}{showClipDownloads&&<div className="mt-3 grid w-full gap-2 sm:grid-cols-2">{clips.map(clip=><div key={clip.filename} className="flex items-center justify-between gap-2 rounded-lg border border-white/10 p-2"><span className="min-w-0 truncate text-xs text-slate-300">{clip.filename} · {(clip.size/1024/1024).toFixed(1)} MB</span><button onClick={()=>void downloadFile(clip.blob,clip.filename)} className="shrink-0 rounded bg-white/10 px-2 py-1 text-xs">Save</button></div>)}</div>}</div>}</div>}
  {script&&clips.length>0&&<div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/[.04] p-5 sm:p-7"><h2 className="flex items-center gap-2 text-lg font-bold"><FolderUp size={20} className="text-emerald-300"/> 5. Export production kit</h2><p className="mt-2 text-sm leading-6 text-slate-400">Files are uploaded from your browser directly to Google Drive using the limited drive.file scope. Keep this tab open until the upload finishes.</p><button disabled={busy||!driveToken||!clips.length} onClick={exportDrive} className="mt-4 w-full rounded-xl bg-emerald-500 px-4 py-3 font-bold text-black disabled:opacity-40">{driveToken?'Export to Google Drive':'Connect Google Drive to export'}</button>{driveFolder&&<button onClick={()=>void openDriveFolder()} className="mt-3 inline-block text-sm font-bold text-emerald-300 underline">Open exported Drive folder ↗</button>}</div>}</section>
  <aside className="space-y-4"><div className="rounded-2xl border border-white/10 bg-[#111521] p-5"><h2 className="font-bold">Production workflow</h2>{['Load source video + transcript URL/file','Generate multi-act script','Create narration + captions (optional)','Slice source video locally with FFmpeg','Upload cut sections directly to Drive'].map((t,i)=><div key={t} className="mt-4 flex gap-3 text-sm"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-white/10 text-xs">{i+1}</span><span className="text-slate-300">{t}</span></div>)}</div><div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/[.05] p-5"><CheckCircle2 size={21} className="text-emerald-300"/><h2 className="mt-3 font-bold">Local-first privacy</h2><p className="mt-2 text-sm leading-6 text-slate-400">Video processing stays on your device. Text sent for AI generation is processed by your configured providers.</p></div><div className="rounded-2xl border border-white/10 bg-[#111521] p-5"><h2 className="font-bold">Build status</h2><p className="mt-2 text-sm leading-6 text-slate-400">{busy?<span className="flex items-center gap-2"><LoaderCircle className="animate-spin" size={16}/>{stage||'Working…'}</span>:notice||'Ready. Load an authorized direct video URL or choose a local source file, then add subtitles.'}</p>{notice&&<div className="mt-3 flex gap-2 text-xs text-slate-500"><AlertCircle size={15} className="shrink-0"/>Errors and status are shown here.</div>}</div></aside></div><footer className="mt-10 border-t border-white/10 pt-5 text-xs text-slate-500"><nav aria-label="Legal" className="flex flex-wrap gap-x-5 gap-y-2 text-violet-300"><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link><Link href="/refunds">Refunds</Link><Link href="/acceptable-use">Acceptable use</Link></nav></footer></div></main>;
  async function sliceVideoLocallyAction() { await sliceVideo(); }
}
