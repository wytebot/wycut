'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { Cloud, FileText, Link2, UploadCloud, CheckCircle2, AlertCircle, Clapperboard, Mic2, Scissors, FolderUp, LoaderCircle, Download } from 'lucide-react';
import { sliceVideoLocally, concatenateClipsLocally, type SlicedClip } from '@/lib/ffmpeg/client-slicer';
import { exportProductionKit, type DriveExportFile } from '@/lib/drive/export';
import { Capacitor } from '@capacitor/core';
import { signInWithGoogleNative } from '@/lib/auth/google-native';
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { firebaseAuth } from '@/lib/firebase/client';
import { getAuthToken } from '@/lib/auth/get-auth-token';
import { apiUrl } from '@/lib/api-client';
import type { RecapScript } from '@/lib/ai/script-generator';
import { transcribeVideoToSrt } from '@/lib/transcribe/client';
import { LOW_BALANCE_CREDITS, SCRIPT_CREDITS_MAX, SCRIPT_CREDITS_MIN, formatCredits, narrationCredits, scriptCredits, transcribeCreditsForVideo } from '@/lib/billing/pricing';
import { TopUpError } from '@/lib/billing/client-errors';

type GoogleTokenResponse = { access_token?: string; expires_in?: number; error?: string };
type GoogleIdentity = { accounts: { oauth2: { initTokenClient: (config: { client_id: string; scope: string; callback: (response: GoogleTokenResponse) => void }) => { requestAccessToken: (options?: { prompt?: string }) => void } } } };
declare global { interface Window { google?: GoogleIdentity } }
type Narration = { provider: string; captionsSrt: string; fullVoiceover: Blob; segments: Array<{ index: number; id: string; filename: string; text: string; audio: Blob }> };
type SourceMode = 'url' | 'file' | 'subtitles';
const MAX_SUBTITLE_URL_BYTES = 5 * 1024 * 1024;
const DRIVE_TOKEN_KEY = 'wycut_drive_access_token';
const DRIVE_TOKEN_EXPIRY_KEY = 'wycut_drive_access_token_expiry';
function persistDriveToken(token: string, expiresIn = 3600) { try { localStorage.setItem(DRIVE_TOKEN_KEY, token); localStorage.setItem(DRIVE_TOKEN_EXPIRY_KEY, String(Date.now() + Math.max(60, expiresIn - 120) * 1000)); } catch { /* storage may be disabled */ } }
function clearPersistedDriveToken() { try { localStorage.removeItem(DRIVE_TOKEN_KEY); localStorage.removeItem(DRIVE_TOKEN_EXPIRY_KEY); } catch { /* ignore */ } }
function platformWatchUrl(value: string): 'YouTube' | 'TikTok' | null { try { const host = new URL(value).hostname.toLowerCase().replace(/^www\./, ''); if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtu.be' || host === 'youtube-nocookie.com') return 'YouTube'; if (host === 'tiktok.com' || host.endsWith('.tiktok.com')) return 'TikTok'; return null; } catch { return null; } }
function transcriptText(raw: string, name = ''): string { const isVtt = /^\s*WEBVTT/i.test(raw) || /\.vtt(?:$|[?#])/i.test(name); if (!isVtt) return raw.replace(/^\uFEFF/, '').trim(); return raw.replace(/^\uFEFF?WEBVTT[^\n]*\n/i, '').replace(/<[^>]+>/g, '').replace(/(\d{2}:\d{2}:\d{2}\.\d{3})\s+[^-\n]+(-->)/g, '$1 $2').trim(); }
function filenameFromUrl(value: string): string { try { const leaf = decodeURIComponent(new URL(value).pathname.split('/').filter(Boolean).pop() || 'source-video.mp4'); return leaf.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120) || 'source-video.mp4'; } catch { return 'source-video.mp4'; } }
async function readTextWithLimit(response: Response, maxBytes: number, label: string): Promise<string> {
  const declared = Number(response.headers.get('content-length') || 0);
  if (declared > maxBytes) throw new Error(`${label} exceeds the ${Math.round(maxBytes / 1024 / 1024)} MB safety limit.`);
  if (!response.body) { const text = await response.text(); if (new TextEncoder().encode(text).byteLength > maxBytes) throw new Error(`${label} exceeds the ${Math.round(maxBytes / 1024 / 1024)} MB safety limit.`); return text; }
  const reader = response.body.getReader(); const decoder = new TextDecoder(); let total = 0; let result = '';
  try { while (true) { const { done, value } = await reader.read(); if (done) break; if (!value) continue; total += value.byteLength; if (total > maxBytes) { await reader.cancel(); throw new Error(`${label} exceeds the ${Math.round(maxBytes / 1024 / 1024)} MB safety limit.`); } result += decoder.decode(value, { stream: true }); } result += decoder.decode(); return result; } finally { reader.releaseLock(); }
}
async function readBlobWithLimit(response: Response, maxBytes: number, label: string): Promise<Blob> { if (!response.body) { const buffer = await response.arrayBuffer(); if (buffer.byteLength > maxBytes) throw new Error(`${label} exceeds the ${Math.round(maxBytes / 1024 / 1024)} MB safety limit.`); return new Blob([buffer], { type: response.headers.get('content-type') || 'application/octet-stream' }); } const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let total = 0; try { while (true) { const { done, value } = await reader.read(); if (done) break; if (!value) continue; total += value.byteLength; if (total > maxBytes) { await reader.cancel(); throw new Error(`${label} exceeds the ${Math.round(maxBytes / 1024 / 1024)} MB safety limit.`); } chunks.push(value); } } finally { reader.releaseLock(); } const blobParts: BlobPart[] = chunks.map((chunk) => { const copy = new Uint8Array(chunk.byteLength); copy.set(chunk); return copy.buffer; }); return new Blob(blobParts, { type: response.headers.get('content-type') || 'application/octet-stream' }); }
const decodeAudio = (value: string) => { const raw = atob(value); const bytes = new Uint8Array(raw.length); for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i); return new Blob([bytes.buffer as ArrayBuffer], { type: 'audio/mpeg' }); };
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
function wrapCaptionText(value: string, maxChars = 78): string[] {
  const words = value.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  const lines: string[] = []; let current = '';
  for (const word of words) {
    if (!current) current = word;
    else if (`${current} ${word}`.length <= maxChars) current += ` ${word}`;
    else { lines.push(current); current = word; }
  }
  if (current) lines.push(current);
  const chunks: string[] = [];
  for (let i = 0; i < lines.length; i += 2) chunks.push([lines[i], lines[i + 1]].filter(Boolean).join('\n'));
  return chunks.length ? chunks : [''];
}
async function getAudioDuration(blob: Blob): Promise<number> {
  return new Promise(resolve => {
    const audio = document.createElement('audio'); const url = URL.createObjectURL(blob); let finished = false;
    const finish = (duration: number) => { if (finished) return; finished = true; URL.revokeObjectURL(url); audio.removeAttribute('src'); audio.load(); resolve(Number.isFinite(duration) && duration > 0 ? duration : 0); };
    const timer = window.setTimeout(() => finish(0), 5000);
    audio.preload = 'metadata'; audio.onloadedmetadata = () => { window.clearTimeout(timer); finish(audio.duration); }; audio.onerror = () => { window.clearTimeout(timer); finish(0); }; audio.src = url;
  });
}
async function buildTimedCaptionsSrt(segments: Narration['segments']): Promise<string> {
  let elapsed = 0; let counter = 1; const rows: string[] = [];
  for (const segment of segments) {
    const duration = await getAudioDuration(segment.audio) || Math.max(2.2, segment.text.trim().split(/\s+/).filter(Boolean).length / 2.45);
    const chunks = wrapCaptionText(segment.text); const weights = chunks.map(chunk => Math.max(1, chunk.replace(/\n/g, ' ').split(/\s+/).filter(Boolean).length)); const total = weights.reduce((sum, value) => sum + value, 0);
    let segmentElapsed = 0;
    chunks.forEach((chunk, index) => {
      const chunkDuration = index === chunks.length - 1 ? Math.max(0.25, duration - segmentElapsed) : Math.max(0.6, duration * weights[index] / total);
      const start = elapsed + segmentElapsed; const end = start + chunkDuration;
      rows.push(`${counter++}\n${formatSrtTime(start)} --> ${formatSrtTime(end)}\n${chunk}\n`); segmentElapsed += chunkDuration;
    });
    elapsed += duration + 0.08;
  }
  return rows.join('\n');
}

async function loadGoogleIdentityServices(): Promise<void> {
  if (window.google?.accounts?.oauth2) return;
  await new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error('Google Drive sign-in timed out while loading. Check your connection or disable content blockers for this site.')), 12000);
    const finish = (error?: Error) => { window.clearTimeout(timeout); error ? reject(error) : resolve(); };
    let script = document.querySelector<HTMLScriptElement>('script[data-wycut-google-identity]');
    if (!script) { script = document.createElement('script'); script.src = 'https://accounts.google.com/gsi/client'; script.async = true; script.defer = true; script.dataset.wycutGoogleIdentity = 'true'; document.head.appendChild(script); }
    script.addEventListener('load', () => finish(), { once: true });
    script.addEventListener('error', () => finish(new Error('Google Drive sign-in library could not load. Check your connection or try again.')), { once: true });
    if (window.google?.accounts?.oauth2) finish();
  });
  if (!window.google?.accounts?.oauth2) throw new Error('Google Drive sign-in loaded without its OAuth API. Try again.');
}

function videoSourceLimitBytes() {
  if (Capacitor.isNativePlatform()) return 80 * 1024 * 1024;
  const mobile = typeof navigator !== 'undefined' && (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || Number((navigator as Navigator & { deviceMemory?: number }).deviceMemory || 8) <= 4);
  return (mobile ? 100 : 300) * 1024 * 1024;
}
function videoSourceLimitLabel() {
  if (Capacitor.isNativePlatform()) return '80 MB Android';
  const mobile = typeof navigator !== 'undefined' && (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || Number((navigator as Navigator & { deviceMemory?: number }).deviceMemory || 8) <= 4);
  return mobile ? '100 MB mobile browser' : '300 MB desktop browser';
}

export function DashboardWorkspace({ initialFlow = 'url' }: { initialFlow?: SourceMode }) {
  const [mode, setMode] = useState<SourceMode>(initialFlow); const [url, setUrl] = useState(''); const [subtitleUrl, setSubtitleUrl] = useState(''); const [file, setFile] = useState<File | null>(null); const [video, setVideo] = useState<File | null>(null); const [title, setTitle] = useState('My Movie');
  const [notice, setNotice] = useState(''); const [busy, setBusy] = useState(false); const [authEmail, setAuthEmail] = useState(''); const [credits, setCredits] = useState<number | null>(null); const [freeAccess, setFreeAccess] = useState(false); const [needsTopUp, setNeedsTopUp] = useState(false); const [videoSeconds, setVideoSeconds] = useState(0);
  const narrationCache = useRef(new Map<string, { id: string; text: string; audioBase64: string }>()); const [stage, setStage] = useState(''); const [progress, setProgress] = useState(0);
  useEffect(() => { setMode(initialFlow); }, [initialFlow]);
  const noticeRef = useRef<HTMLParagraphElement | null>(null);
  // Remember the transcript made from the video so a retry never pays for transcription twice.
  const transcriptCache = useRef<{ key: string; text: string } | null>(null);
  // Bring new status/errors into view so a tap never looks like it did nothing.
  useEffect(() => { if (notice && !busy) noticeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, [notice, busy]);
  const [script, setScript] = useState<RecapScript | null>(null); const [recapId, setRecapId] = useState(''); const [idToken, setIdToken] = useState(''); const [narration, setNarration] = useState<Narration | null>(null); const [clips, setClips] = useState<SlicedClip[]>([]); const [roughCut, setRoughCut] = useState<Blob | null>(null); const [driveToken, setDriveToken] = useState(''); const [driveFolder, setDriveFolder] = useState(''); const [googleReady, setGoogleReady] = useState(false); const [googleLoadError, setGoogleLoadError] = useState(''); const [hasSourceTimecodes, setHasSourceTimecodes] = useState(false); const [showClipDownloads, setShowClipDownloads] = useState(false);
  useEffect(() => {
    const syncAccount = () => { try { const token = localStorage.getItem('wycut_google_id_token') || sessionStorage.getItem('wycut_google_id_token') || ''; const email = localStorage.getItem('wycut_auth_email') || sessionStorage.getItem('wycut_auth_email') || ''; setIdToken(token); setAuthEmail(email); const drive = localStorage.getItem(DRIVE_TOKEN_KEY) || ''; const expires = Number(localStorage.getItem(DRIVE_TOKEN_EXPIRY_KEY) || 0); if (drive && expires > Date.now()) setDriveToken(drive); else if (drive) setDriveToken(''); } catch { setIdToken(''); setAuthEmail(''); } void firebaseAuth.currentUser?.getIdToken().then(freshToken => { setIdToken(freshToken); try { localStorage.setItem('wycut_google_id_token', freshToken); localStorage.setItem('wycut_auth_email', firebaseAuth.currentUser?.email || ''); } catch { /* ignore */ } }).catch(() => undefined); };
    syncAccount(); window.addEventListener('focus', syncAccount); window.addEventListener('storage', syncAccount);
    return () => { window.removeEventListener('focus', syncAccount); window.removeEventListener('storage', syncAccount); };
  }, []);
  async function loadBalance(token: string): Promise<{ credits: number; freeAccess: boolean } | null> {
    if (!token) return null;
    try {
      let deviceId = localStorage.getItem('wycut_device_id') || '';
      if (!deviceId) { deviceId = crypto.randomUUID(); localStorage.setItem('wycut_device_id', deviceId); }
      const response = await fetch(apiUrl('/api/billing/entitlement'), { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Device-Id': deviceId }, body: JSON.stringify({ idToken: token, deviceId }), cache: 'no-store' });
      const data = await response.json() as { credits?: number; freeAccess?: boolean };
      if (!response.ok) return null;
      const next = { credits: Math.max(0, Number(data.credits || 0)), freeAccess: data.freeAccess === true };
      setCredits(next.credits); setFreeAccess(next.freeAccess);
      return next;
    } catch { return null; }
  }
  useEffect(() => { if (!idToken) { setCredits(null); setFreeAccess(false); return; } void loadBalance(idToken); }, [idToken]);
  useEffect(() => {
    if (!video) { setVideoSeconds(0); return; }
    let active = true; void getVideoDuration(video).then(seconds => { if (active) setVideoSeconds(seconds); }).catch(() => { if (active) setVideoSeconds(0); });
    return () => { active = false; };
  }, [video]);
  /** Stops before any paid work starts when the balance cannot cover the whole action. */
  async function ensureCredits(needed: number) {
    const fresh = await loadBalance(await getAuthToken(idToken));
    if (!fresh || fresh.freeAccess) return;
    if (fresh.credits < needed) throw new TopUpError(`This needs about ${formatCredits(needed)} credits and you have ${formatCredits(fresh.credits)}. Top up to continue — nothing was charged.`, needed, fresh.credits);
  }
  useEffect(() => { if (Capacitor.isNativePlatform()) return; let active = true; void loadGoogleIdentityServices().then(() => { if (active) { setGoogleReady(true); setGoogleLoadError(''); } }).catch(error => { if (active) setGoogleLoadError(error instanceof Error ? error.message : 'Google Drive sign-in could not load.'); }); return () => { active = false; }; }, []);
  useEffect(() => { if (!googleReady || Capacitor.isNativePlatform()) return; let connected = false; let expires = 0; try { connected = Boolean(localStorage.getItem(DRIVE_TOKEN_KEY)); expires = Number(localStorage.getItem(DRIVE_TOKEN_EXPIRY_KEY) || 0); } catch { return; } if (!connected || expires > Date.now() || !window.google?.accounts?.oauth2) return; const clientId = process.env.NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID; if (!clientId || !clientId.endsWith('.apps.googleusercontent.com')) return; const client = window.google.accounts.oauth2.initTokenClient({ client_id: clientId, scope: 'https://www.googleapis.com/auth/drive.file', callback: (response) => { if (response.access_token && !response.error) { persistDriveToken(response.access_token, response.expires_in || 3600); setDriveToken(response.access_token); setNotice('Google Drive connection refreshed automatically.'); } else { setNotice('Your Google Drive connection is saved, but Google requires you to reconnect to renew permission. Tap Reconnect Drive.'); } } }); try { client.requestAccessToken({ prompt: '' }); } catch { /* silent refresh can be blocked; keep saved connection and offer manual reconnect */ } }, [googleReady]);
  const clearGeneratedOutputs = () => { setScript(null); setRecapId(''); setHasSourceTimecodes(false); setNarration(null); setClips([]); setRoughCut(null); };
  const selectFile = (candidate?: File) => {
    if (!candidate) return;
    if (!/\.(srt|vtt|txt)$/i.test(candidate.name) && !['text/plain','text/vtt','application/x-subrip'].includes(candidate.type)) {
      setFile(null); clearGeneratedOutputs();
      setNotice('Choose a valid .SRT, .VTT or plain-text transcript file. Previous generated outputs were cleared.'); return;
    }
    if (candidate.size > 5 * 1024 * 1024) {
      setFile(null); clearGeneratedOutputs();
      setNotice('Subtitle files must be smaller than 5 MB. Previous generated outputs were cleared.'); return;
    }
    setFile(candidate); clearGeneratedOutputs(); setNotice('');
  };
  const onInput = (e: ChangeEvent<HTMLInputElement>) => selectFile(e.target.files?.[0]); const onDrop = (e: DragEvent<HTMLLabelElement>) => { e.preventDefault(); selectFile(e.dataTransfer.files?.[0]); };
  function selectVideo(candidate?: File) {
    if (!candidate) return;
    const extension = candidate.name.split('.').pop()?.toLowerCase();
    if (!['mp4', 'm4v', 'mov'].includes(extension || '')) {
      setVideo(null); clearGeneratedOutputs();
      setNotice('Choose an MP4, M4V or MOV video. Other containers are not supported by the local FFmpeg pipeline. Previous video outputs were cleared.');
      return;
    }
    const maxBytes = videoSourceLimitBytes();
    if (candidate.size > maxBytes) {
      setVideo(null); clearGeneratedOutputs();
      setNotice(`This device limits source videos to ${videoSourceLimitLabel()} to reduce out-of-memory crashes. Previous video outputs were cleared.`);
      return;
    }
    setVideo(candidate); clearGeneratedOutputs(); setNotice('');
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
  async function connectDrive() {
    if (Capacitor.isNativePlatform()) {
      try { const user = await signInWithGoogleNative(); if (!user.authentication.accessToken) throw new Error('Google sign-in worked but Google did not return Drive permission. Reconnect and approve the drive.file permission.'); setDriveToken(user.authentication.accessToken); persistDriveToken(user.authentication.accessToken, 3600); setDriveFolder(''); setNotice(`Google Drive connected as ${user.email}. This device will remember the connection; Google may require reauthorization when its access token expires.`); }
      catch (e) { setNotice(e instanceof Error ? e.message : 'Native Google Drive connection failed.'); }
      return;
    }
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID;
    // Firebase popup is a working fallback when the separate Google Identity Services client ID
    // is not configured. It requests only drive.file and returns a short-lived access token.
    const connectWithFirebase = async () => {
      const provider = new GoogleAuthProvider();
      provider.addScope('https://www.googleapis.com/auth/drive.file');
      provider.setCustomParameters({ prompt: 'consent select_account' });
      const result = await signInWithPopup(firebaseAuth, provider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (!credential?.accessToken) throw new Error('Google sign-in completed but Drive permission was not returned. Enable Google sign-in, enable the Google Drive API, and authorize the app in Google Cloud OAuth consent settings.');
      const token = await result.user.getIdToken(true);
      try { localStorage.setItem('wycut_google_id_token', token); localStorage.setItem('wycut_auth_email', result.user.email || ''); } catch { /* storage may be blocked */ }
      setIdToken(token); setAuthEmail(result.user.email || ''); setDriveToken(credential.accessToken); persistDriveToken(credential.accessToken, 3600); setDriveFolder('');
      setNotice(`Google Drive connected as ${result.user.email || 'your Google account'}. This device will remember the connection; Google may require reauthorization when its access token expires.`);
    };
    if (!clientId || !clientId.endsWith('.apps.googleusercontent.com')) {
      try { await connectWithFirebase(); } catch (e) { setNotice(e instanceof Error ? e.message : 'Google Drive connection failed. Check Firebase Google sign-in and Drive API configuration.'); }
      return;
    }
    if (!googleReady || !window.google?.accounts?.oauth2) {
      // Do not make the user wait and tap twice: immediately use the Firebase OAuth fallback.
      try { await connectWithFirebase(); } catch (e) { setNotice(e instanceof Error ? e.message : (googleLoadError || 'Google Drive connection failed.')); }
      return;
    }
    try {
      const oauth = window.google.accounts.oauth2;
      const client = oauth.initTokenClient({ client_id: clientId, scope: 'https://www.googleapis.com/auth/drive.file', callback: (response) => { if (response.error || !response.access_token) { setNotice(`Google Drive connection failed: ${response.error || 'No access token returned. Check OAuth consent screen, Drive API enablement, and authorized origins.'}`); return; } setDriveToken(response.access_token); persistDriveToken(response.access_token, response.expires_in || 3600); setDriveFolder(''); setNotice('Google Drive connection saved on this device. Google access tokens expire periodically and may require you to reconnect.'); } });
      client.requestAccessToken();
    } catch (e) { setNotice(e instanceof Error ? e.message : 'Google Drive connection failed.'); }
  }
  function disconnectDrive() { clearPersistedDriveToken(); setDriveToken(''); setDriveFolder(''); setNotice('Google Drive disconnected from this device.'); }
  async function loadVideoFromUrl() {
    if (!url.trim()) { setNotice('Paste a direct downloadable video URL first.'); return; }
    let parsed: URL; try { parsed = new URL(url.trim()); } catch { setNotice('Enter a valid HTTPS video URL.'); return; }
    if (parsed.protocol !== 'https:') { setNotice('For safety, source URLs must use HTTPS.'); return; }
    const platform = platformWatchUrl(parsed.toString());
    if (platform) { setNotice(`${platform} watch-page links are not direct video files. Official public APIs do not provide WyCut a generic full-video download URL. For videos you own or have permission to edit, use the platform's authorized export/download and select that file below, or paste a direct HTTPS MP4/M4V/MOV file URL from a host that permits browser downloads. You can still paste a subtitle URL below.`); return; }
    setBusy(true); setStage('Downloading source video into this device…'); setProgress(0); setNotice('');
    try {
      const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 120_000);
      let response: Response; let blob: Blob;
      try {
        response = await fetch(parsed.toString(), { method: 'GET', mode: 'cors', credentials: 'omit', cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new Error(`Source host returned HTTP ${response.status} (${response.statusText || 'request failed'}).`);
        const declaredSize = Number(response.headers.get('content-length') || 0); const maxBytes = videoSourceLimitBytes();
        if (declaredSize > maxBytes) throw new Error(`Source is larger than this device's ${videoSourceLimitLabel()} safety limit.`);
        blob = await readBlobWithLimit(response, maxBytes, 'Downloaded source');
      } finally { clearTimeout(timer); }
      if (!blob.size) throw new Error('The URL returned an empty file.');
      const type = (response.headers.get('content-type') || blob.type || '').split(';')[0].toLowerCase();
      if (type && !type.startsWith('video/') && type !== 'application/octet-stream') throw new Error(`The URL returned ${type}, not a video file. Paste a direct MP4/M4V/MOV URL, not a webpage.`);
      const name = filenameFromUrl(parsed.toString()); const ext = name.split('.').pop()?.toLowerCase();
      if (!['mp4','m4v','mov'].includes(ext || '') && !['video/mp4','video/quicktime','application/octet-stream'].includes(type)) throw new Error('Only MP4, M4V and MOV direct video files are supported by the current frame-accurate slicer.');
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
      let raw: string;
      try {
        const response = await fetch(parsed.toString(), { mode: 'cors', credentials: 'omit', cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new Error(`Subtitle host returned HTTP ${response.status} (${response.statusText || 'request failed'}).`);
        raw = await readTextWithLimit(response, MAX_SUBTITLE_URL_BYTES, 'Subtitle file');
      } finally { clearTimeout(timer); }
      const text = transcriptText(raw, parsed.pathname); if (text.length < 40) throw new Error('No readable transcript text was found at that URL. Use a public SRT, VTT, or text transcript URL.');
      return { text, label: filenameFromUrl(parsed.toString()) };
    }
    if (file) { const raw = await file.text(); if (!/\d{2}:\d{2}:\d{2}[,.]\d{3}\s*-->/.test(raw) && !/^\s*WEBVTT/i.test(raw) && raw.trim().length < 40) throw new Error('This does not look like a valid SRT, VTT or text transcript file.'); return { text: transcriptText(raw, file.name), label: file.name }; }
    if (video) {
      const key = `${video.name}:${video.size}:${video.lastModified}`;
      if (transcriptCache.current?.key === key) return { text: transcriptCache.current.text, label: video.name };
      setStage('Preparing audio transcription…'); setProgress(3);
      const text = await transcribeVideoToSrt(video, () => getAuthToken(idToken), (nextStage, nextProgress) => { setStage(nextStage); setProgress(nextProgress); }, { cacheKey: key, ensureCredits: needed => ensureCredits(needed + SCRIPT_CREDITS_MAX) });
      transcriptCache.current = { key, text };
      return { text, label: video.name };
    }
    throw new Error(mode === 'url' ? (platformWatchUrl(url) === 'YouTube' ? 'YouTube links alone cannot provide a downloadable video or transcript here. Upload a matching SRT/VTT/TXT subtitle file or paste a public subtitle URL. To cut clips, also provide an authorized source video file or direct downloadable video URL.' : 'Add a public SRT/VTT transcript URL, upload a subtitle file, or load a direct video file (WyCut will transcribe its audio).') : 'Upload an SRT, VTT or TXT subtitle/transcript file first. (On the Video file page you can skip subtitles: WyCut transcribes the video audio.)');
  }
  async function generateScript() {
    if (busy) return;
    setBusy(true); setNeedsTopUp(false); setStage('Checking source and preparing transcript…'); setProgress(5); setNotice('');
    setScript(null); setRecapId(''); setNarration(null); setClips([]); setRoughCut(null); setHasSourceTimecodes(false);
    try {
      const source = await getTranscript();
      if (!source.text.trim() || source.text.trim().length < 40) throw new Error('The selected transcript is empty or too short. Upload a readable SRT, VTT or TXT transcript, or enter a public subtitle URL.');
      setStage('Refreshing sign-in and checking generation access…'); setProgress(15);
      let freshIdToken: string;
      try { freshIdToken = await getAuthToken(idToken); }
      catch (authError) { throw new Error(`${authError instanceof Error ? authError.message : 'Sign in required.'} Open Sign in / account at the top of this page, sign in with Google, then come back and tap Generate again.`); }
      setIdToken(freshIdToken);
      let deviceId = '';
      try {
        deviceId = localStorage.getItem('wycut_device_id') || '';
        if (!deviceId) { deviceId = typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`; localStorage.setItem('wycut_device_id', deviceId); }
        document.cookie = `wycut_device_id=${encodeURIComponent(deviceId)}; Path=/; Max-Age=31536000; SameSite=Lax; Secure`;
      } catch { /* the API will explain if a device identifier is required for trial eligibility */ }
      setStage('Generating your recap script with AI…'); setProgress(25);
      let response: Response;
      try {
        response = await fetch(apiUrl('/api/script'), { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Device-Id': deviceId }, body: JSON.stringify({ title: title.trim() || source.label.replace(/\.(srt|vtt|txt)$/i, ''), transcript: source.text, targetRuntimeSeconds: 600, beatCount: 38, idToken: freshIdToken, deviceId }), cache: 'no-store' });
      } catch (networkError) {
        const detail = networkError instanceof Error ? networkError.message : 'Network request failed';
        throw new Error(`Could not reach WyCut's script API (${detail}). Check your connection, deployed API route and Vercel function logs, then retry. Your generation was not confirmed.`);
      }
      setStage('Checking AI response…'); setProgress(85);
      const data = await response.json().catch(() => null) as ({ error?: string; code?: string; script?: RecapScript; recapId?: string; provider?: string; hasSourceTimecodes?: boolean } | null);
      if (!data) throw new Error(`WyCut's script API returned a non-JSON response (HTTP ${response.status}). Check Vercel function logs for a crash or deployment error.`);
      if (response.status === 402 || data.code === 'INSUFFICIENT_CREDITS') throw new TopUpError(data.error || 'You need more credits to generate this script.');
      if (!response.ok) {
        const code = data.code ? ` [${data.code}]` : '';
        throw new Error(`${data.error || `Script generation failed (HTTP ${response.status}).`}${code}`);
      }
      if (!data.script || !Array.isArray(data.script.beats) || data.script.beats.length === 0) throw new Error('The AI request returned successfully but no usable script was included. Check the configured AI provider and server logs.');
      setScript(data.script); setRecapId(data.recapId || ''); setHasSourceTimecodes(data.hasSourceTimecodes === true); setNarration(null); setClips([]); setRoughCut(null); setProgress(100);
      void loadBalance(freshIdToken); setNotice(`Script generated with ${data.provider || 'AI'}. ${data.script.beats.length} beats ready. ${data.hasSourceTimecodes ? 'Timestamped subtitle timeline detected; review cut points.' : 'No source timestamps found; upload matching SRT/VTT before slicing.'}`);
    } catch (e) {
      if (e instanceof TopUpError) setNeedsTopUp(true);
      let message = e instanceof Error ? e.message : 'Unknown error while generating the script.';
      if (/Failed to fetch|NetworkError|Load failed/i.test(message)) message = `A source URL could not be read by this browser. The host may block cross-origin (CORS) access, require sign-in, or be unavailable. Use a public HTTPS SRT/VTT/TXT transcript URL that permits browser access, or upload the transcript file. Details: ${message}`;
      if (/aborted|AbortError/i.test(message)) message = `The source request timed out. Try a smaller file or a faster public URL. Details: ${message}`;
      setNotice(`Generation failed: ${message}`);
    } finally { setBusy(false); setStage(''); setProgress(0); }
  }

  const beatKey = (beat: { index: number; id: string }) => `${recapId}:${beat.index}:${beat.id}`;
  const pendingNarrationChars = script ? script.beats.filter(beat => !narrationCache.current.has(beatKey(beat))).reduce((sum, beat) => sum + beat.narration.length, 0) : 0;
  async function generateVoice() {
    if (!script || busy) return;
    setBusy(true); setNeedsTopUp(false); setStage('Preparing narration…'); setNotice(''); setNarration(null);
    try {
      // Beats already narrated for this script are reused, so a retry after a failure or top-up never pays twice.
      const todo = script.beats.filter(beat => !narrationCache.current.has(beatKey(beat)));
      if (todo.length) await ensureCredits(narrationCredits(todo.reduce((sum, beat) => sum + beat.narration.length, 0)));
      const batches: Array<RecapScript['beats']> = [];
      let currentBatch: RecapScript['beats'] = [];
      let currentCharacters = 0;
      for (const beat of todo) {
        const length = beat.narration.length;
        if (length > 3_500) throw new Error(`Scene ${beat.index} is too long to narrate safely. Regenerate the script with shorter beats.`);
        if (currentBatch.length >= 2 || (currentBatch.length > 0 && currentCharacters + length > 3_500)) {
          batches.push(currentBatch); currentBatch = []; currentCharacters = 0;
        }
        currentBatch.push(beat); currentCharacters += length;
      }
      if (currentBatch.length) batches.push(currentBatch);
      const providers = new Set<string>();
      const requestBatch = async (beats: RecapScript['beats']) => {
        let lastError = 'Narration batch failed.';
        for (let attempt = 0; attempt < 3; attempt++) {
          if (attempt > 0) await new Promise(resolve => setTimeout(resolve, 1500 * attempt));
          let response: Response;
          try { response = await fetch(apiUrl('/api/narration'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ beats, voice: 'onyx', idToken: await getAuthToken(idToken), recapId }), cache: 'no-store' }); }
          catch (networkError) { lastError = `Network error (${networkError instanceof Error ? networkError.message : 'request failed'}).`; continue; }
          const data = await response.json().catch(() => ({ error: `Narration API returned a non-JSON response (HTTP ${response.status}). Check Vercel function logs.` })) as { error?: string; code?: string; provider?: string; segments?: Array<{ index: number; id: string; filename: string; text: string; audioBase64: string }> };
          if (response.status === 402 || data.code === 'INSUFFICIENT_CREDITS') throw new TopUpError(data.error || 'You need more credits to finish the narration.');
          if (response.ok && Array.isArray(data.segments) && data.segments.length) {
            if (data.provider) providers.add(data.provider);
            data.segments.forEach(item => { const beat = beats.find(candidate => candidate.id === item.id); if (beat) narrationCache.current.set(beatKey(beat), { id: item.id, text: item.text, audioBase64: item.audioBase64 }); });
            return;
          }
          lastError = data.error || `Narration batch failed (HTTP ${response.status}).`;
          if ([400, 401, 403, 413].includes(response.status)) break; // retrying cannot fix these
        }
        throw new Error(`${lastError} Failed batches are not charged, and finished parts are kept — tap Generate narration again to continue.`);
      };
      // Keep two API batches in flight to balance speed with provider cost and quota limits.
      for (let i = 0; i < batches.length; i += 2) {
        const pair = batches.slice(i, i + 2);
        await Promise.all(pair.map(requestBatch));
        setStage(`Generating narration… ${Math.min(i + pair.length, batches.length)} of ${batches.length} batches complete`);
      }
      const segments: Narration['segments'] = [];
      for (const beat of script.beats) {
        const item = narrationCache.current.get(beatKey(beat));
        if (!item) throw new Error('Some narration parts are missing. Tap Generate narration again to finish them.');
        const index = segments.length + 1;
        segments.push({ index, id: item.id, filename: `${String(index).padStart(3, '0')}_${item.id}.mp3`, text: item.text, audio: decodeAudio(item.audioBase64) });
      }
      const provider = providers.size > 1 ? 'mixed' : [...providers][0] || 'openai';
      const fullVoiceover = new Blob(segments.map(segment => segment.audio), { type: 'audio/mpeg' });
      const captionsSrt = await buildTimedCaptionsSrt(segments);
      setNarration({ provider, captionsSrt, fullVoiceover, segments });
      void loadBalance(await getAuthToken(idToken).catch(() => idToken));
      setNotice(`Narration generated. ${segments.length} MP3 segments ready.`);
    } catch (e) {
      if (e instanceof TopUpError) setNeedsTopUp(true);
      setNotice(e instanceof Error ? e.message : 'Could not generate narration.');
      void loadBalance(idToken);
    }
    finally { setBusy(false); setStage(''); }
  }
  async function sliceVideo() { if (!hasSourceTimecodes) { setNotice('Accurate cuts require a timestamped SRT/VTT transcript. Plain text has no source timecodes, so any AI timing would be a guess. Upload the matching SRT/VTT before slicing.'); return; } if (!script || !video) { setNotice('Generate a script and choose the source movie file you are authorized to edit.'); return; } setBusy(true); setStage('Loading local FFmpeg…'); setProgress(0); setNotice(''); setClips([]); setRoughCut(null); try { const duration = await getVideoDuration(video); const lastTimestamp = Math.max(...script.beats.map(beat => beat.endSeconds)); if (lastTimestamp > duration + 2) throw new Error(`The script references ${Math.round(lastTimestamp)} seconds, but this source video is only ${Math.round(duration)} seconds long. Upload matching subtitles/source video.`); const output = await sliceVideoLocally(video, script.beats.map(b => ({ index: b.index, id: b.id, startSeconds: b.startSeconds, endSeconds: b.endSeconds })), (p, current, total) => { setProgress(Math.round(p * 100)); setStage(current > 0 ? `Slicing clip ${current} of ${total} locally…` : 'Processing video locally…'); }); setClips(output); setStage('Creating rough cut locally…'); const rough = await concatenateClipsLocally(output, p => setProgress(Math.round(p * 100))); setRoughCut(rough); setNotice(`${output.length} clips and a rough cut created locally with re-encoded frame-accurate boundaries. Processing may take longer on mobile devices.`); } catch (e) { setNotice(e instanceof Error ? e.message : 'Local video slicing failed.'); } finally { setBusy(false); setStage(''); } }
  async function exportDrive() { if (!driveToken) { setNotice('Connect Google Drive first.'); return; } if (!clips.length && !script && !narration) { setNotice('Generate a script or narration before exporting.'); return; } if (!script) { setNotice('Generate a recap script before exporting the cuts.'); return; } setBusy(true); setStage('Uploading cut sections directly to your Google Drive…'); setNotice(''); setDriveFolder(''); try { const files: DriveExportFile[] = []; for (const c of clips) files.push({ name: c.filename, mimeType: 'video/mp4', body: c.blob, folder: 'video' }); if (narration) { for (const segment of narration.segments) files.push({ name: segment.filename, mimeType: 'audio/mpeg', body: segment.audio, folder: 'voiceover' }); files.push({ name: 'Full_Voiceover.mp3', mimeType: 'audio/mpeg', body: narration.fullVoiceover, folder: 'master' }); files.push({ name: 'Captions.srt', mimeType: 'text/plain', body: narration.captionsSrt, folder: 'master' }); } files.push({ name: 'Timeline_Script.txt', mimeType: 'text/plain', body: script.beats.map(b => `${String(b.index).padStart(3, '0')} ${b.title}\nSource: ${b.startSeconds.toFixed(2)}s–${b.endSeconds.toFixed(2)}s | Act ${b.act}\n${b.narration}\n${b.dialogueCues.map(c => `[LET MOVIE AUDIO PLAY: ${c.startSeconds}s - ${c.quote || c.instruction}]`).join('\n')}\n`).join('\n'), folder: 'master' }); if (roughCut) files.push({ name: 'Full_RoughCut.mp4', mimeType: 'video/mp4', body: roughCut, folder: 'master' }); const result = await exportProductionKit(driveToken, title || script.title, files); setDriveFolder(result.folderUrl); setNotice(`Export complete: ${result.uploaded.length} files uploaded directly to Drive${clips.length ? `, including ${clips.length} cut video sections` : ''}${narration ? ' and narration files' : ''}.`); } catch (e) { if (e instanceof Error && 'folderUrl' in e && typeof (e as Error & { folderUrl?: unknown }).folderUrl === 'string') setDriveFolder((e as Error & { folderUrl: string }).folderUrl); setNotice(e instanceof Error ? e.message : 'Drive export failed.'); } finally { setBusy(false); setStage(''); } }
  return <main className="min-h-screen bg-[#080a10] px-4 py-8 text-white sm:px-8"><div className="mx-auto max-w-6xl"><header className="mb-9 flex flex-wrap items-center justify-between gap-4"><div><div className="flex items-center gap-4"><Link href="/" className="text-sm text-violet-300">← WyCut</Link><Link href="/login?next=/dashboard" aria-label={authEmail ? `Signed in as ${authEmail}; manage account` : "Sign in to WyCut"} className="max-w-[48vw] truncate rounded-lg border border-violet-400/30 bg-violet-500/10 px-3 py-2 text-xs font-bold text-violet-200">{authEmail ? `Signed in · ${authEmail}` : "Sign in / account"}</Link><Link href="/billing" className="rounded-lg border border-white/10 px-3 py-2 text-xs font-bold text-slate-300">Billing</Link>{(credits !== null || freeAccess) && <Link href="/billing" aria-live="polite" className={`rounded-lg border px-3 py-2 text-xs font-bold ${freeAccess ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200' : credits !== null && credits < LOW_BALANCE_CREDITS ? 'border-amber-400/40 bg-amber-400/10 text-amber-200' : 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200'}`}>{freeAccess ? 'Unlimited access' : credits !== null && credits < LOW_BALANCE_CREDITS ? `${formatCredits(credits)} credits · Top up` : `${formatCredits(credits ?? 0)} credits`}</Link>}</div><h1 className="mt-2 text-3xl font-black sm:text-4xl">Recap Studio</h1><p className="mt-2 text-slate-400">Create a script, narration and edit-ready files.</p></div><div className="rounded-xl border border-white/10 bg-white/[.03] px-4 py-3"><div className="flex items-center gap-2"><Cloud size={18} className={driveToken ? 'text-emerald-400' : 'text-slate-400'}/><span className="text-sm font-semibold">Google Drive</span></div><p className="mt-1 text-xs text-slate-400">{driveToken ? 'Connected on this device' : 'Not connected'} · drive.file scope</p><div className="mt-2 flex flex-wrap gap-3"><button type="button" onClick={() => void connectDrive()} className="text-xs font-bold text-violet-300">{driveToken ? 'Reconnect Drive' : 'Connect Google Drive'}</button>{driveToken && <button type="button" onClick={disconnectDrive} className="text-xs font-semibold text-slate-400 underline">Disconnect</button>}</div>{!Capacitor.isNativePlatform() && <p className="mt-1 text-[11px] text-slate-500">{googleReady ? 'Google sign-in ready' : googleLoadError || 'Preparing Google sign-in…'}</p>}</div><nav className="flex flex-wrap gap-2 rounded-xl border border-white/10 bg-[#111521] p-2" aria-label="Choose input workflow"><Link href="/dashboard/url" className={`rounded-lg px-3 py-2 text-xs font-bold ${mode === 'url' ? 'bg-violet-500 text-white' : 'text-slate-300 hover:bg-white/5'}`}><Link2 className="mr-1 inline" size={14}/>Video URL</Link><Link href="/dashboard/file" className={`rounded-lg px-3 py-2 text-xs font-bold ${mode === 'file' ? 'bg-violet-500 text-white' : 'text-slate-300 hover:bg-white/5'}`}><UploadCloud className="mr-1 inline" size={14}/>Video file</Link><Link href="/dashboard/subtitles" className={`rounded-lg px-3 py-2 text-xs font-bold ${mode === 'subtitles' ? 'bg-violet-500 text-white' : 'text-slate-300 hover:bg-white/5'}`}><FileText className="mr-1 inline" size={14}/>Subtitles</Link></nav></header>
  <div className="grid gap-6 lg:grid-cols-[1fr_310px]"><section className="space-y-5"><div className="rounded-2xl border border-white/10 bg-[#111521] p-5 sm:p-7">
    <h2 className="mb-4 flex items-center gap-2 text-lg font-bold"><Clapperboard size={20} className="text-violet-300"/> {mode === 'url' ? '1. Video URL workflow' : mode === 'file' ? '1. Choose a video file' : '1. Subtitle-to-recap workflow'}</h2>
    <label className="mb-2 block text-sm font-semibold">Movie / project title</label>
    <input disabled={busy} value={title} onChange={e=>setTitle(e.target.value)} maxLength={160} className="mb-5 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 outline-none focus:ring-2 focus:ring-violet-400"/>
    {mode === 'url' && <div className="space-y-3">
      <label className="block text-sm font-semibold">Video URL</label>
      <input disabled={busy} value={url} onChange={e=>setUrl(e.target.value)} placeholder="Direct HTTPS MP4/M4V/MOV URL or YouTube link" inputMode="url" className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 outline-none focus:ring-2 focus:ring-violet-400"/>
      <button type="button" disabled={busy||!url.trim()} onClick={()=>void loadVideoFromUrl()} className="w-full rounded-xl border border-violet-400/30 bg-violet-500/10 px-4 py-3 text-sm font-bold text-violet-200 disabled:opacity-40">{busy&&stage.includes('Downloading')?'Loading source…':video?'Replace source video':'Load direct video URL'}</button>
      <label className="mt-2 block text-sm font-semibold">Subtitle / transcript URL (required for script generation unless you upload a subtitle file)</label>
      <input disabled={busy} value={subtitleUrl} onChange={e=>{setSubtitleUrl(e.target.value);clearGeneratedOutputs();}} placeholder="https://host.example/captions.en.vtt" inputMode="url" className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 outline-none focus:ring-2 focus:ring-violet-400"/>
      <p className="text-xs leading-5 text-slate-400">A YouTube watch link is not a direct video file. WyCut will not bypass YouTube download restrictions. To recap a YouTube video, provide subtitles you have permission to use; to cut footage, also load an authorized local video file or a direct video URL from a host that permits downloads.</p>
    </div>}
    {mode === 'file' && <div className="space-y-3">
      <label className="block text-sm font-semibold">Source video file (MP4, M4V or MOV)</label>
      <p className="text-xs leading-5 text-slate-400">Choose a video already on your device. Processing and cutting happen locally; video size limits are {Capacitor.isNativePlatform()?'80 MB on Android APK':'100 MB on mobile browsers and 300 MB on desktop browsers'}.</p>
      <input disabled={busy} type="file" accept=".mp4,.m4v,.mov,video/mp4,video/quicktime" onChange={e=>selectVideo(e.target.files?.[0])} className="block w-full text-sm text-slate-300 file:mr-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-4 file:py-2 file:text-white"/>
      {video&&<p className="text-xs text-emerald-300">Video ready: {video.name} · {(video.size/1024/1024).toFixed(1)} MB</p>}
    </div>}
    {(mode === 'file' || mode === 'url') && <p className="mt-4 rounded-xl border border-emerald-400/20 bg-emerald-400/[.05] px-4 py-3 text-xs leading-5 text-emerald-200">No subtitles? Leave them empty. If a video is loaded, WyCut extracts its audio on your device, transcribes it with AI, then writes the recap. Uploaded subtitles are always used first and skip the transcription charge.</p>}
    {(mode === 'file' || mode === 'subtitles' || mode === 'url') && <div className="mt-4">
      <label className="mb-2 block text-sm font-semibold">{mode === 'url' ? 'Or upload subtitles / transcript' : 'Subtitle / transcript file'} (.SRT, .VTT or .TXT)</label>
      <label onDragOver={e=>{if(!busy)e.preventDefault();}} onDrop={e=>{if(!busy)onDrop(e);}} className="flex min-h-28 cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-violet-400/40 bg-violet-400/[.04] p-5 text-center"><UploadCloud size={26} className="mb-2 text-violet-300"/><span className="font-bold">{file?file.name:'Drop subtitle/transcript here or browse'}</span><span className="mt-2 text-sm text-slate-400">SRT, VTT or TXT · Max 5 MB</span><input disabled={busy} type="file" accept=".srt,.vtt,.txt,text/plain,text/vtt,application/x-subrip" onChange={onInput} className="sr-only"/></label>
      {file&&<button type="button" onClick={()=>{setFile(null);clearGeneratedOutputs();setNotice('Subtitle removed.');}} className="mt-2 text-xs text-slate-400 underline">Remove subtitle file</button>}
    </div>}
    {mode === 'subtitles' && <p className="mt-3 text-xs leading-5 text-slate-400">This flow generates the original recap script, narration and captions from your subtitle file. Video cuts are unavailable until you select a matching authorized video on the Choose video file page.</p>}
    <button type="button" disabled={busy} aria-live="polite" onClick={generateScript} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-violet-500 px-5 py-3.5 font-bold hover:bg-violet-400 disabled:cursor-wait disabled:opacity-70">{busy ? <><LoaderCircle size={18} className="animate-spin" aria-hidden="true"/> {stage || 'Generating…'}</> : mode === 'subtitles' ? 'Generate recap from subtitles' : 'Generate recap script'}</button>
    {!busy && (() => { const hasText = Boolean(file) || (mode === 'url' && subtitleUrl.trim().length > 0); const transcribe = !hasText && video && videoSeconds > 0 ? transcribeCreditsForVideo(videoSeconds) : 0; const low = SCRIPT_CREDITS_MIN + transcribe; const high = SCRIPT_CREDITS_MAX + transcribe; return !freeAccess && (hasText || mode === 'subtitles' || video) ? <p className="mt-3 text-xs leading-5 text-slate-400">This step uses about <strong className="text-slate-200">{low === high ? formatCredits(low) : `${formatCredits(low)}–${formatCredits(high)}`} credits</strong>{transcribe > 0 ? ` (${formatCredits(transcribe)} to transcribe the video audio + the script)` : ' for the script'}. Narration is charged separately, only if you create it. Failed steps are refunded automatically.</p> : null; })()}
    {!busy && notice && <p ref={noticeRef} role="alert" className={`mt-3 rounded-xl border px-4 py-3 text-sm leading-6 ${/fail|could not|error|expired|sign in|no recap credits|top up|too many|not configured|limit|invalid|\[[A-Z_]+\]/i.test(notice) ? 'border-red-400/30 bg-red-500/10 text-red-200' : 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200'}`}>{notice}{needsTopUp && <Link href="/billing" className="ml-2 inline-block rounded-lg bg-white px-3 py-1 text-xs font-bold text-black">Top up credits</Link>}</p>}
    {busy && <div className="mt-3" aria-live="polite" role="status"><div className="mb-1 flex justify-between text-xs text-slate-300"><span>{stage || 'Processing…'}</span><span>{progress}%</span></div><div className="h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-violet-400 transition-all" style={{width:`${Math.max(5,progress)}%`}}/></div></div>}
  </div>
  {script&&<div className="rounded-2xl border border-white/10 bg-[#111521] p-5 sm:p-7"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="flex items-center gap-2 text-lg font-bold"><FileText size={20} className="text-violet-300"/> 2. Narrative script</h2><span className="text-xs text-slate-400">{script.beats.length} scenes · ~10 min · {hasSourceTimecodes ? 'timestamped source' : 'estimated timing only'}</span></div><div className="mt-4 max-h-96 space-y-3 overflow-auto">{script.beats.map(b=><article key={`${b.index}-${b.id}`} className="rounded-xl border border-white/10 bg-black/20 p-4"><div className="flex flex-wrap justify-between gap-2 text-xs text-violet-300"><span>{String(b.index).padStart(3,'0')} · Act {b.act} · {b.title}</span><span>{b.startSeconds.toFixed(1)}s–{b.endSeconds.toFixed(1)}s</span></div><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-300">{b.narration}</p>{b.dialogueCues.map((c,i)=><p key={i} className="mt-2 text-xs text-amber-200">[LET MOVIE AUDIO PLAY: {c.startSeconds}s–{c.endSeconds}s{c.quote?` · “${c.quote}”`:''}]</p>)}</article>)}</div><button disabled={busy} onClick={()=>void downloadFile(new Blob([JSON.stringify(script,null,2)],{type:'application/json'}),'WyCut_Timeline_Script.json')} className="mt-4 inline-flex items-center gap-2 rounded-lg border border-white/10 px-4 py-2 text-sm"><Download size={15}/> Download script JSON</button><button disabled={busy||!script} onClick={generateVoice} className="ml-2 mt-4 inline-flex items-center gap-2 rounded-lg bg-violet-500 px-4 py-2 text-sm font-bold disabled:opacity-50"><Mic2 size={15}/> {pendingNarrationChars > 0 ? `Generate narration · ${formatCredits(narrationCredits(pendingNarrationChars))} credits` : 'Rebuild narration · free'}</button></div>}
  {narration&&<div className="rounded-2xl border border-white/10 bg-[#111521] p-5 sm:p-7"><h2 className="flex items-center gap-2 text-lg font-bold"><Mic2 size={20} className="text-violet-300"/> 3. Voiceover & captions</h2><p className="mt-2 text-sm text-slate-400">Provider: {narration.provider} · {narration.segments.length} segments · captions timed to audio segment durations (not word-level forced alignment)</p><div className="mt-4 flex flex-wrap gap-2"><button onClick={()=>void downloadFile(narration.fullVoiceover,'Full_10Min_Voiceover.mp3')} className="rounded-lg bg-white/10 px-4 py-2 text-sm font-semibold">Download full voiceover</button><button onClick={()=>void downloadFile(new Blob([narration.captionsSrt],{type:'text/plain'}),'Full_Captions.srt')} className="rounded-lg bg-white/10 px-4 py-2 text-sm font-semibold">Download captions SRT</button></div></div>}
  {script&&<div className="rounded-2xl border border-white/10 bg-[#111521] p-5 sm:p-7"><h2 className="flex items-center gap-2 text-lg font-bold"><Scissors size={20} className="text-violet-300"/> 4. Local video slicer</h2><p className="mt-2 text-sm leading-6 text-slate-400">FFmpeg WebAssembly processes your selected source in browser memory. Timestamped SRT/VTT is required for slicing; clips are re-encoded for frame-accurate boundaries, which is slower than stream copy and uses more device memory.</p><button disabled={busy||!video} onClick={sliceVideoLocallyAction} className="mt-4 w-full rounded-xl bg-violet-500 px-4 py-3 font-bold disabled:opacity-50">{clips.length?`Re-slice ${clips.length} clips`:'Slice clips + build rough cut'}</button>{(busy&&stage.toLowerCase().includes('slic'))&&<div className="mt-3 h-2 overflow-hidden rounded bg-white/10"><div className="h-full bg-violet-400" style={{width:`${progress}%`}}/></div>}{clips.length>0&&<div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm"><span className="text-emerald-300">{clips.length} local clips ready</span><button onClick={()=>setShowClipDownloads(value=>!value)} className="rounded-lg bg-white/10 px-3 py-2">{showClipDownloads?'Hide clip files':'Save individual clips'}</button>{roughCut&&<button onClick={()=>void downloadFile(roughCut,'Full_RoughCut.mp4')} className="rounded-lg bg-white/10 px-3 py-2">Save rough cut</button>}{showClipDownloads&&<div className="mt-3 grid w-full gap-2 sm:grid-cols-2">{clips.map(clip=><div key={clip.filename} className="flex items-center justify-between gap-2 rounded-lg border border-white/10 p-2"><span className="min-w-0 truncate text-xs text-slate-300">{clip.filename} · {(clip.size/1024/1024).toFixed(1)} MB</span><button onClick={()=>void downloadFile(clip.blob,clip.filename)} className="shrink-0 rounded bg-white/10 px-2 py-1 text-xs">Save</button></div>)}</div>}</div>}</div>}
  {script&&(clips.length>0||narration||mode==='subtitles')&&<div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/[.04] p-5 sm:p-7"><h2 className="flex items-center gap-2 text-lg font-bold"><FolderUp size={20} className="text-emerald-300"/> 5. Export production kit</h2><p className="mt-2 text-sm leading-6 text-slate-400">Uploads the generated script, narration, captions and any video clips directly to your Google Drive. Keep this tab open until the upload finishes.</p><button disabled={busy||!driveToken||(!script&&!narration&&!clips.length)} onClick={exportDrive} className="mt-4 w-full rounded-xl bg-emerald-500 px-4 py-3 font-bold text-black disabled:opacity-40">{driveToken?'Export generated files to Google Drive':'Connect Google Drive to export'}</button>{driveFolder&&<button onClick={()=>void openDriveFolder()} className="mt-3 inline-block text-sm font-bold text-emerald-300 underline">Open exported Drive folder ↗</button>}</div>}</section>
  <aside className="space-y-4"><div className="rounded-2xl border border-white/10 bg-[#111521] p-5"><h2 className="font-bold">Production workflow</h2>{['Load source video + transcript URL/file','Generate multi-act script','Create narration + captions (optional)','Slice source video locally with FFmpeg','Upload cut sections directly to Drive'].map((t,i)=><div key={t} className="mt-4 flex gap-3 text-sm"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-white/10 text-xs">{i+1}</span><span className="text-slate-300">{t}</span></div>)}</div><div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/[.05] p-5"><CheckCircle2 size={21} className="text-emerald-300"/><h2 className="mt-3 font-bold">Local-first privacy</h2><p className="mt-2 text-sm leading-6 text-slate-400">Video processing stays on your device. Text sent for AI generation is processed by your configured providers.</p></div><div className="rounded-2xl border border-white/10 bg-[#111521] p-5"><h2 className="font-bold">Build status</h2><p role="status" aria-live="polite" aria-atomic="true" className="mt-2 break-words text-sm leading-6 text-slate-300">{busy?<span className="flex items-center gap-2"><LoaderCircle className="animate-spin" size={16}/>{stage||'Working…'}</span>:notice||'Ready. Load an authorized direct video URL or choose a local source file, then add subtitles.'}</p>{notice&&<div className="mt-3 flex gap-2 text-xs text-slate-500"><AlertCircle size={15} className="shrink-0"/>Errors and status are shown here.</div>}</div></aside></div><footer className="mt-10 border-t border-white/10 pt-5 text-xs text-slate-500"><nav aria-label="Legal" className="flex flex-wrap gap-x-5 gap-y-2 text-violet-300"><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link><Link href="/refunds">Refunds</Link><Link href="/acceptable-use">Acceptable use</Link></nav></footer></div></main>;
  async function sliceVideoLocallyAction() { await sliceVideo(); }
}

