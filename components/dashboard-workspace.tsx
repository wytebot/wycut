'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { Cloud, UploadCloud, Scissors, Download, Music2, CheckCircle2, ArrowLeft, Image as ImageIcon, Film, X, Type, Captions } from 'lucide-react';
import { sliceVideoLocally, concatenateClipsLocally, mixAudioTracksLocally, abortFFmpeg, warmFFmpeg, releaseFFmpegMemory, MAX_SOURCE_BYTES, MAX_SOURCE_LABEL, type SlicedClip } from '@/lib/ffmpeg/client-slicer';
import { renderEditPlan, cancelEditExport } from '@/lib/ffmpeg/edit-export';
import { normalizeEditPlan, previewFilterForPlan, previewEffectForPlan, previewAdjustForPlan, NO_ADJUST, type Adjust } from '@/lib/editor/edit-plan';
import { splitAt, trimEdge, gapsOf, playbackJump, segmentAt, snapToFrame, normalizeFps, editedLength, sourceToEdited, DEFAULT_FPS, type Segment } from '@/lib/editor/manual-cuts';
import { ANIMATION_CSS } from '@/lib/editor/asset-catalog';
import { EditorTopBar, PreviewStage, PlaybackBar, TrackRail, Timeline, ToolBar, ToolSheet, AIQuickSheet, useVideoThumbs, type EditorToolName } from '@/components/editor-v42-layout';
import { SoundLibrary, readDeviceAudioTrack, MAX_AUDIO_LAYERS, type WyCutAudioTrack } from '@/components/sound-library';
import AdvancedEditorTools from '@/components/advanced-editor-tools';
import { exportProductionKit, type DriveExportFile } from '@/lib/drive/export';
import { fetchDriveBlob, fetchDriveText, loadProductionKit } from '@/lib/drive/read';
import { Capacitor } from '@capacitor/core';
import { signInWithGoogleNative } from '@/lib/auth/google-native';
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { firebaseAuth } from '@/lib/firebase/client';
import { getAuthToken } from '@/lib/auth/get-auth-token';
import { apiUrl } from '@/lib/api-client';
import type { RecapScript } from '@/lib/ai/script-generator';
import { transcribeVideoToSrt, forgetTranscriptChunks } from '@/lib/transcribe/client';
import { backgroundStart, backgroundUpdate, backgroundStop } from '@/lib/native/background';
import { LOW_BALANCE_CREDITS, SCRIPT_CREDITS_MAX, SCRIPT_CREDITS_MIN, formatCredits, scriptCredits, transcribeCreditsForVideo } from '@/lib/billing/pricing';
import { TopUpError } from '@/lib/billing/client-errors';
import { saveProject, getProject, deleteNarrationParts, deleteNarrationKeys, newProjectId, liveProjects } from '@/lib/projects/store';
import { OPEN_PROJECT_EVENT, OPEN_DRIVE_PROJECT_EVENT, CONNECT_DRIVE_EVENT, CANCEL_GENERATION_EVENT, DRIVE_TOKEN_EVENT, takePendingProject, takePendingDriveProject } from '@/lib/projects/bus';

type GoogleTokenResponse = { access_token?: string; expires_in?: number; error?: string };
type GoogleIdentity = { accounts: { oauth2: { initTokenClient: (config: { client_id: string; scope: string; callback: (response: GoogleTokenResponse) => void }) => { requestAccessToken: (options?: { prompt?: string }) => void } } } };
declare global { interface Window { google?: GoogleIdentity } }
type SourceMode = 'url' | 'file' | 'subtitles';
const READ_WORDS_PER_SECOND = 2.4;
/** How well a clip's script fits the clip when read aloud (movie-audio moments make a little slack normal). */
function clipFit(beat: { startSeconds: number; endSeconds: number; narration: string }): string {
  const clip = Math.max(1, beat.endSeconds - beat.startSeconds);
  const words = beat.narration.split(/\s+/).filter(Boolean).length;
  const read = words / READ_WORDS_PER_SECOND; const diff = read - clip;
  const tag = diff > clip * 0.25 && diff > 3 ? 'too long for this clip' : diff < -clip * 0.6 && diff < -5 ? 'room to spare' : 'fits the clip';
  return `${words} words · ~${Math.round(read)}s read · ${tag}`;
}
const MAX_SUBTITLE_URL_BYTES = 5 * 1024 * 1024;
const DRIVE_TOKEN_KEY = 'wycut_drive_access_token';
const DRIVE_TOKEN_EXPIRY_KEY = 'wycut_drive_access_token_expiry';
function persistDriveToken(token: string, expiresIn = 3600) { try { localStorage.setItem(DRIVE_TOKEN_KEY, token); localStorage.setItem(DRIVE_TOKEN_EXPIRY_KEY, String(Date.now() + Math.max(60, expiresIn - 120) * 1000)); window.dispatchEvent(new Event(DRIVE_TOKEN_EVENT)); } catch { /* storage may be disabled */ } }
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
    // Write in chunks so large local video exports don't require one giant base64 string in Android WebView memory.
    const [{ Filesystem, Directory }, { Share }] = await Promise.all([
      import('@capacitor/filesystem'), import('@capacitor/share'),
    ]);
    const chunkBytes = 4 * 1024 * 1024;
    let result: { uri: string } | null = null;
    for (let offset = 0; offset < blob.size || (blob.size === 0 && offset === 0); offset += chunkBytes) {
      const part = blob.slice(offset, Math.min(blob.size, offset + chunkBytes));
      const buffer = await part.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = '';
      for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      const encoded = btoa(binary);
      if (offset === 0) result = await Filesystem.writeFile({ path: name, data: encoded, directory: Directory.Cache, recursive: true });
      else await Filesystem.appendFile({ path: name, data: encoded, directory: Directory.Cache });
      if (blob.size === 0) break;
    }
    if (!result) throw new Error('Could not prepare the export file.');
    await Share.share({ title: name, text: `WyCut export: ${name}`, url: result.uri, dialogTitle: 'Save or share WyCut file' });
    return;
  }
  const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = name; a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 30_000);
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

export function DashboardWorkspace({ initialFlow = 'file' }: { initialFlow?: SourceMode }) {
  const [mode, setMode] = useState<SourceMode>('file'); const [url, setUrl] = useState(''); const [subtitleUrl, setSubtitleUrl] = useState(''); const [file, setFile] = useState<File | null>(null); const [video, setVideo] = useState<File | null>(null); const [timelineAssets, setTimelineAssets] = useState<File[]>([]); const [exportChoiceOpen, setExportChoiceOpen] = useState(false); const [exportPage, setExportPage] = useState(false); const [exportDone, setExportDone] = useState(false); const [exportProgress, setExportProgress] = useState(0); const [exportStage, setExportStage] = useState(''); const [title, setTitle] = useState('My Movie');
  const [notice, setNotice] = useState(''); const [busy, setBusy] = useState(false); const [authEmail, setAuthEmail] = useState(''); const [credits, setCredits] = useState<number | null>(null); const [freeAccess, setFreeAccess] = useState(false); const [needsTopUp, setNeedsTopUp] = useState(false); const [videoSeconds, setVideoSeconds] = useState(0);
  const narrationCache = useRef(new Map<string, { id: string; text: string; audioBase64: string }>()); const [stage, setStage] = useState(''); const [progress, setProgress] = useState(0);
  useEffect(() => { setMode('file'); }, [initialFlow]);
  // ---- local project history: every stage is checkpointed so work can be resumed from the History page ----
  const projectIdRef = useRef(''); const keepOutputs = useRef(false); const exportedRef = useRef(false); const restoredTranscript = useRef<string | null>(null);
  const [fastCut, setFastCut] = useState(false); const lastCheckpoint = useRef(0);
  const [editorTab, setEditorTab] = useState<'Edit'|'Audio'|'Text'|'Effects'|'Overlay'|'Captions'|'Stickers'|'Filters'|'Adjust'|'Speed'|'Beat'|'Keyframe'|'In/Out'|'Combo'|'Canvas'|'Voice'>('Edit'); const [previewPlaying, setPreviewPlaying] = useState(false); const [aspectRatio, setAspectRatio] = useState<'9:16'|'16:9'|'1:1'|'4:5'>('9:16'); const [applyAspectRatio, setApplyAspectRatio] = useState(false); const [playbackRate, setPlaybackRate] = useState('1'); const [previewUrl, setPreviewUrl] = useState('');
  const checkpoint = (patch: Parameters<typeof saveProject>[1]) => { if (projectIdRef.current) void saveProject(projectIdRef.current, patch); };
  // ---- one "job" = one run of a paid/long step. Cancel aborts it, refunds its credits and discards what it produced. ----
  type JobKind = 'script' | 'narration' | 'slice' | 'export';
  type Job = { id: string; kind: JobKind; abort: AbortController; cancelled: boolean; paidChunkKeys: string[]; narrationKeys: string[] };
  const jobRef = useRef<Job | null>(null);
  const [activeKind, setActiveKind] = useState<'' | JobKind>(''); const [confirmCancel, setConfirmCancel] = useState(false); const [cancelling, setCancelling] = useState(false);
  function startJob(kind: JobKind): Job {
    const id = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `job-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const job: Job = { id, kind, abort: new AbortController(), cancelled: false, paidChunkKeys: [], narrationKeys: [] };
    jobRef.current = job; setActiveKind(kind); return job;
  }
  const noticeRef = useRef<HTMLParagraphElement | null>(null);
  // Remember the transcript made from the video so a retry never pays for transcription twice.
  const transcriptCache = useRef<{ key: string; text: string } | null>(null);
  // Bring new status/errors into view so a tap never looks like it did nothing.
  useEffect(() => { if (notice && !busy) noticeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, [notice, busy]);
  const [editorSearchOpen, setEditorSearchOpen] = useState(false); const [editorSearch, setEditorSearch] = useState(''); const [beatMarkers, setBeatMarkers] = useState<number[]>([]); const [keyframes, setKeyframes] = useState<{time:number;scale:number;rotation:number}[]>([]); const [targetMinutes, setTargetMinutes] = useState('5'); const [durationPromptOpen, setDurationPromptOpen] = useState(false); const [quality, setQuality] = useState<'720p'|'1080p'|'2K'>('720p'); const [aiSheetOpen, setAiSheetOpen] = useState(false); const [toolSheet, setToolSheet] = useState(''); const [closeConfirm, setCloseConfirm] = useState(false); const [playheadSeconds, setPlayheadSeconds] = useState(0); const [previewFullscreen, setPreviewFullscreen] = useState(false); const [editorMuted, setEditorMuted] = useState(false);
  const [script, setScript] = useState<RecapScript | null>(null); const [soundTracks, setSoundTracks] = useState<WyCutAudioTrack[]>([]); const [selectedClipIndex, setSelectedClipIndex] = useState(0); const [timelineZoom, setTimelineZoom] = useState(1); const [adjust, setAdjust] = useState<Adjust>(NO_ADJUST); const [clipVolume, setClipVolume] = useState(100); const [fadeIn, setFadeIn] = useState(0); const [fadeOut, setFadeOut] = useState(0); const [fps, setFps] = useState(DEFAULT_FPS); const [mirrorPreview, setMirrorPreview] = useState(false); const [cropMode, setCropMode] = useState('contain'); const [textOverlay, setTextOverlay] = useState(''); const [textPosition, setTextPosition] = useState<'top'|'center'|'bottom'>('center'); const [textX, setTextX] = useState(50); const [textY, setTextY] = useState(50); const [textScale, setTextScale] = useState(1); const [textRotation, setTextRotation] = useState(0); const [emojiOverlay, setEmojiOverlay] = useState(''); const [overlayFont, setOverlayFont] = useState('Inter'); const [showWatermark, setShowWatermark] = useState(true); const [effectPreset, setEffectPreset] = useState('Original'); const [visualEffect, setVisualEffect] = useState('None'); const [textAnimation, setTextAnimation] = useState('None'); const [transition, setTransition] = useState('Cut'); const [sticker, setSticker] = useState(''); const [recapId, setRecapId] = useState(''); const [idToken, setIdToken] = useState(''); const [clips, setClips] = useState<SlicedClip[]>([]); const [roughCut, setRoughCut] = useState<Blob | null>(null); const [driveToken, setDriveToken] = useState(''); const [driveFolder, setDriveFolder] = useState(''); const [googleReady, setGoogleReady] = useState(false); const [googleLoadError, setGoogleLoadError] = useState(''); const [hasSourceTimecodes, setHasSourceTimecodes] = useState(false); const [showClipDownloads, setShowClipDownloads] = useState(false);
  const exportAttemptIdRef = useRef('');
  const textPointersRef = useRef(new Map<number, { x: number; y: number }>());
  const textGestureRef = useRef<{ mode: 'drag' | 'pinch'; pointerId?: number; startX: number; startY: number; originX: number; originY: number; startDistance?: number; originScale?: number } | null>(null);
  function textPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (toolSheet !== 'Text') return;
    e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId);
    textPointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const points = [...textPointersRef.current.values()];
    if (points.length >= 2) { const a = points[0], b = points[1]; textGestureRef.current = { mode: 'pinch', startX: 0, startY: 0, originX: textX, originY: textY, startDistance: Math.max(1, Math.hypot(a.x-b.x, a.y-b.y)), originScale: textScale }; }
    else textGestureRef.current = { mode: 'drag', pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, originX: textX, originY: textY };
  }
  function textPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (toolSheet !== 'Text' || !textPointersRef.current.has(e.pointerId)) return;
    textPointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const gesture = textGestureRef.current; if (!gesture) return;
    if (gesture.mode === 'pinch') { const points = [...textPointersRef.current.values()]; if (points.length >= 2) { const distance = Math.max(1, Math.hypot(points[0].x-points[1].x, points[0].y-points[1].y)); setTextScale(Math.max(0.5, Math.min(2, (gesture.originScale || 1) * distance / (gesture.startDistance || distance)))); } return; }
    if (gesture.pointerId !== e.pointerId) return;
    const rect = e.currentTarget.parentElement?.getBoundingClientRect(); if (!rect || !rect.width || !rect.height) return;
    setTextX(Math.max(0, Math.min(100, gesture.originX + (e.clientX-gesture.startX)/rect.width*100)));
    setTextY(Math.max(0, Math.min(100, gesture.originY + (e.clientY-gesture.startY)/rect.height*100)));
  }
  function textPointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    textPointersRef.current.delete(e.pointerId); const remaining = [...textPointersRef.current.entries()];
    if (remaining.length) { const [pointerId, point] = remaining[0]; textGestureRef.current = { mode: 'drag', pointerId, startX: point.x, startY: point.y, originX: textX, originY: textY }; } else textGestureRef.current = null;
  }
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
    if (!video) { setPreviewUrl(''); return; }
    const url = URL.createObjectURL(video); setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [video]);
  const isStillImage = Boolean(video?.type.startsWith('image/'));
  useEffect(() => {
    if (!video) { setVideoSeconds(0); return; }
    if (video.type.startsWith('image/')) { setVideoSeconds(5); setPlayheadSeconds(0); return; }
    setVideoSeconds(0); let active = true; void getVideoDuration(video).then(seconds => { if (active) setVideoSeconds(seconds); }).catch(() => { if (active) setVideoSeconds(0); });
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
  const clearGeneratedOutputs = () => { projectIdRef.current = ''; keepOutputs.current = false; exportedRef.current = false; restoredTranscript.current = null; setScript(null); setRecapId(''); setHasSourceTimecodes(false); setClips([]); setRoughCut(null); setSoundTracks([]); };
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
    const isImage = candidate.type.startsWith('image/') || ['png','jpg','jpeg','webp','avif'].includes(extension || '');
    if (isImage && !['png','jpg','jpeg','webp'].includes(extension || '')) {
      setNotice('For still-image editing, choose PNG, JPG, JPEG or WebP.'); return;
    }
    if (!isImage && !['mp4', 'm4v', 'mov'].includes(extension || '')) {
      setVideo(null); clearGeneratedOutputs();
      setNotice('Choose an MP4, M4V, MOV video or a PNG/JPG/WebP image. Previous source outputs were cleared.');
      return;
    }
    // Images are treated as a five-second still-image project; video remains duration-driven.
    if (!isImage && candidate.size > MAX_SOURCE_BYTES) {
      setVideo(null); clearGeneratedOutputs();
      setNotice(`This video is larger than ${MAX_SOURCE_LABEL}. Use a lower-resolution copy or split it first. Previous video outputs were cleared.`);
      return;
    }
    if (isImage && candidate.size > 30 * 1024 * 1024) { setNotice('Still images must be under 30 MB to protect mobile memory.'); return; }
    setVideo(candidate);
    // Create a durable local history record as soon as the source enters the editor.
    // This deliberately does not wait for script generation, export, or Google Drive.
    if (!keepOutputs.current) {
      if (!projectIdRef.current) projectIdRef.current = newProjectId();
      const id = projectIdRef.current;
      void saveProject(id, {
        title: title.trim() || candidate.name.replace(/\.[^.]+$/, ''),
        mode: 'file', status: 'idle', stage: null, progress: null, error: null,
        sourceName: candidate.name, sourceSize: candidate.size,
      });
    }
    if (keepOutputs.current && projectIdRef.current) { setClips([]); setRoughCut(null); setNotice(isImage ? 'Image ready. Export it as an image or create a 5-second video from it.' : 'Video ready. Your saved project was restored, so you can slice clips now.'); checkpoint({ sourceName: candidate.name, sourceSize: candidate.size }); }
    else { clearGeneratedOutputs(); setNotice(isImage ? 'Image added to the editor. Choose Export to save an edited image or create a 5-second video.' : ''); }
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
        if (declaredSize > maxBytes) throw new Error(`A URL download has to be held in memory, so this device allows up to ${videoSourceLimitLabel()} from a link. For bigger videos, save the file to your device and choose it with the Video file page (up to ${MAX_SOURCE_LABEL}).`);
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
  async function getTranscript(job: Job): Promise<{ text: string; label: string }> {
    if (restoredTranscript.current && !file && !(mode === 'url' && subtitleUrl.trim())) return { text: restoredTranscript.current, label: title || 'Restored project' };
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
      const text = await transcribeVideoToSrt(video, () => getAuthToken(idToken), (nextStage, nextProgress) => { setStage(nextStage); setProgress(nextProgress); }, { cacheKey: key, jobId: job.id, signal: job.abort.signal, onPaid: paidKey => job.paidChunkKeys.push(paidKey), ensureCredits: needed => ensureCredits(needed + SCRIPT_CREDITS_MAX) });
      transcriptCache.current = { key, text };
      return { text, label: video.name };
    }
    throw new Error(mode === 'url' ? (platformWatchUrl(url) === 'YouTube' ? 'YouTube links alone cannot provide a downloadable video or transcript here. Upload a matching SRT/VTT/TXT subtitle file or paste a public subtitle URL. To cut clips, also provide an authorized source video file or direct downloadable video URL.' : 'Add a public SRT/VTT transcript URL, upload a subtitle file, or load a direct video file (WyCut will transcribe its audio).') : 'Upload an SRT, VTT or TXT subtitle/transcript file first. (On the Video file page you can skip subtitles: WyCut transcribes the video audio.)');
  }
  async function generateScript(minutes = Number(targetMinutes)) {
    if (busy) return;
    const safeMinutes = Math.min(60, Math.max(1, Math.floor(Number(minutes) || 5)));
    setTargetMinutes(String(safeMinutes));
    const job = startJob('script');
    if (exportedRef.current) { projectIdRef.current = ''; exportedRef.current = false; }
    if (!projectIdRef.current) projectIdRef.current = newProjectId();
    checkpoint({ title: title.trim() || 'My Movie', mode, status: 'running', stage: 'Starting…', progress: 0, error: null, sourceName: video?.name ?? file?.name, sourceSize: video?.size ?? file?.size, subtitleUrl: subtitleUrl.trim() || null, videoUrl: url.trim() || null });
    setBusy(true); setNeedsTopUp(false); setStage('Checking source and preparing transcript…'); setProgress(5); setNotice('');
    setScript(null); setRecapId(''); setClips([]); setRoughCut(null); setHasSourceTimecodes(false);
    try {
      const source = await getTranscript(job);
      if (job.cancelled) return;
      checkpoint({ transcript: source.text.slice(0, 400_000) });
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
        response = await fetch(apiUrl('/api/script'), { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Device-Id': deviceId }, body: JSON.stringify({ title: title.trim() || source.label.replace(/\.(srt|vtt|txt)$/i, ''), transcript: source.text, targetRuntimeSeconds: safeMinutes * 60, beatCount: Math.min(70, Math.max(10, Math.ceil(safeMinutes * 1.5))), idToken: freshIdToken, deviceId, jobId: job.id }), cache: 'no-store', signal: job.abort.signal });
      } catch (networkError) {
        const detail = networkError instanceof Error ? networkError.message : 'Network request failed';
        throw new Error(`Could not reach WyCut's script API (${detail}). Check your connection, deployed API route and Vercel function logs, then retry. Your generation was not confirmed.`);
      }
      if (job.cancelled) return;
      setStage('Checking AI response…'); setProgress(85);
      const data = await response.json().catch(() => null) as ({ error?: string; code?: string; script?: RecapScript; recapId?: string; provider?: string; hasSourceTimecodes?: boolean } | null);
      if (!data) throw new Error(`WyCut's script API returned a non-JSON response (HTTP ${response.status}). Check Vercel function logs for a crash or deployment error.`);
      if (response.status === 402 || data.code === 'INSUFFICIENT_CREDITS') throw new TopUpError(data.error || 'You need more credits to generate this script.');
      if (!response.ok) {
        const code = data.code ? ` [${data.code}]` : '';
        throw new Error(`${data.error || `Script generation failed (HTTP ${response.status}).`}${code}`);
      }
      if (!data.script || !Array.isArray(data.script.beats) || data.script.beats.length === 0) throw new Error('The AI request returned successfully but no usable script was included. Check the configured AI provider and server logs.');
      setScript(data.script); setRecapId(data.recapId || ''); setHasSourceTimecodes(data.hasSourceTimecodes === true); setClips([]); setRoughCut(null); setProgress(100); keepOutputs.current = true; checkpoint({ script: data.script, recapId: data.recapId || '', hasSourceTimecodes: data.hasSourceTimecodes === true, narrationReady: null, narrationParts: null, clipCount: null, roughCut: null });
      const plannedSeconds = data.script.beats.reduce((sum, beat) => sum + Math.max(0, beat.endSeconds - beat.startSeconds), 0); void loadBalance(freshIdToken); setNotice(`Script generated with ${data.provider || 'AI'}. ${data.script.beats.length} clips planned for a ${safeMinutes}-minute target; selected source ranges total about ${Math.round(plannedSeconds / 60 * 10) / 10} minutes. ${data.hasSourceTimecodes ? 'Timestamped subtitle timeline detected; review cut points, then tap Cut clips on this device.' : 'No source timestamps found; upload matching SRT/VTT before slicing.'}`);
    } catch (e) {
      if (job.cancelled) return;
      if (e instanceof TopUpError) setNeedsTopUp(true);
      let message = e instanceof Error ? e.message : 'Unknown error while generating the script.';
      if (/Failed to fetch|NetworkError|Load failed/i.test(message)) message = `A source URL could not be read by this browser. The host may block cross-origin (CORS) access, require sign-in, or be unavailable. Use a public HTTPS SRT/VTT/TXT transcript URL that permits browser access, or upload the transcript file. Details: ${message}`;
      if (/aborted|AbortError/i.test(message)) message = `The source request timed out. Try a smaller file or a faster public URL. Details: ${message}`;
      setNotice(`Generation failed: ${message}`);
    } finally { if (!job.cancelled) { setBusy(false); setStage(''); setProgress(0); setActiveKind(''); } }
  }

  // Progress checkpoints (throttled), live/interrupted tracking and a screen wake lock while a job runs.
  useEffect(() => {
    const id = projectIdRef.current; if (!id) return;
    if (busy) {
      liveProjects.add(id);
      const now = Date.now(); if (now - lastCheckpoint.current > 1500) { lastCheckpoint.current = now; void saveProject(id, { status: 'running', stage: stage || 'Working…', progress }); }
    }
  }, [busy, stage, progress]);
  useEffect(() => {
    if (busy) return; const id = projectIdRef.current; if (!id) return;
    liveProjects.delete(id);
    if (exportedRef.current) return;
    const failed = /fail|could not|error|expired|top up|not enough|\[[A-Z_]+\]/i.test(notice);
    void saveProject(id, { status: failed ? 'failed' : 'idle', stage: null, progress: null, error: failed ? notice.slice(0, 400) : null });
  }, [busy]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!busy || typeof navigator === 'undefined') return; type Lock = { release: () => Promise<void> }; let lock: Lock | null = null; let cancelled = false;
    const acquire = async () => { try { const wl = (navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<Lock> } }).wakeLock; if (wl && !cancelled && document.visibilityState === 'visible') lock = await wl.request('screen'); } catch { /* not allowed */ } };
    const onVisible = () => { if (document.visibilityState === 'visible') void acquire(); else if (projectIdRef.current) void saveProject(projectIdRef.current, { status: 'running', stage: stage || 'Working…', progress }); };
    void acquire(); document.addEventListener('visibilitychange', onVisible);
    return () => { cancelled = true; document.removeEventListener('visibilitychange', onVisible); void lock?.release().catch(() => undefined); };
  }, [busy]); // eslint-disable-line react-hooks/exhaustive-deps
  async function cancelGeneration() {
    const job = jobRef.current;
    setConfirmCancel(false);
    if (!busy || !job || job.cancelled || job.kind === 'export' || cancelling) return;
    setCancelling(true); job.cancelled = true; job.abort.abort(); abortFFmpeg();
    setBusy(false); setStage(''); setProgress(0); setActiveKind('');
    let refunded = 0; let refundProblem = '';
    if (job.kind === 'script' || job.kind === 'narration') {
      try {
        const response = await fetch(apiUrl('/api/billing/cancel'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken: await getAuthToken(idToken), jobId: job.id }), cache: 'no-store' });
        const data = await response.json().catch(() => null) as { ok?: boolean; refunded?: number; error?: string } | null;
        if (response.ok && data?.ok) refunded = Math.max(0, Number(data.refunded || 0)); else refundProblem = data?.error || `HTTP ${response.status}`;
      } catch (error) { refundProblem = error instanceof Error ? error.message : 'network error'; }
    }
    // Throw away what the cancelled run produced, so refunded work can't be reused for free.
    if (job.kind === 'script') {
      await forgetTranscriptChunks(job.paidChunkKeys); transcriptCache.current = null; restoredTranscript.current = null;
      setScript(null); setRecapId(''); setHasSourceTimecodes(false); setClips([]); setRoughCut(null);
      checkpoint({ transcript: null, script: null, recapId: null, hasSourceTimecodes: null, narrationReady: null, narrationParts: null, clipCount: null, roughCut: null, status: 'idle', stage: null, progress: null, error: null });
    } else if (job.kind === 'narration') {
      job.narrationKeys.forEach(key => narrationCache.current.delete(key)); if (projectIdRef.current) await deleteNarrationKeys(projectIdRef.current, job.narrationKeys);
      checkpoint({ narrationReady: null, narrationParts: null, status: 'idle', stage: null, progress: null, error: null });
    } else { setClips([]); setRoughCut(null); checkpoint({ clipCount: null, roughCut: null, status: 'idle', stage: null, progress: null, error: null }); }
    if (projectIdRef.current) liveProjects.delete(projectIdRef.current);
    setNeedsTopUp(false); setCancelling(false);
    setNotice(job.kind === 'slice' ? 'Cutting stopped. No credits are used by this step.' : refundProblem ? `Generation stopped, but your credits could not be returned automatically (${refundProblem}). Tap Cancel on a new run or contact support; nothing more will be charged.` : refunded > 0 ? `Generation cancelled. ${formatCredits(refunded)} credits were returned to your balance.` : 'Generation cancelled. No credits were charged for it.');
    void loadBalance(await getAuthToken(idToken).catch(() => idToken));
  }
  const cancelRef = useRef(cancelGeneration); cancelRef.current = cancelGeneration;
  useEffect(() => { const ask = () => { if (jobRef.current && !jobRef.current.cancelled && jobRef.current.kind !== 'export') setConfirmCancel(true); }; window.addEventListener(CANCEL_GENERATION_EVENT, ask); return () => window.removeEventListener(CANCEL_GENERATION_EVENT, ask); }, []);
  // Android: keep the process alive with a foreground service while a job runs (no-op on the web).
  useEffect(() => { if (!busy) return; void backgroundStart('WyCut is working', stage || 'Working…'); return () => { void backgroundStop(); }; }, [busy]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (busy) void backgroundUpdate(`${stage || 'Working…'}${progress > 0 ? ` · ${progress}%` : ''}`); }, [stage, Math.floor(progress / 5)]); // eslint-disable-line react-hooks/exhaustive-deps
  async function openDriveProject(folderId: string) {
    if (!folderId || busy) { if (busy) setNotice('Wait for the current task to finish before opening another project.'); return; }
    if (!driveToken) { setNotice('Reconnect Google Drive to restore this project.'); return; }
    setNotice('Loading project settings and script from Google Drive…');
    try {
      const kit = await loadProductionKit(driveToken, folderId);
      const manifestFile = kit.master.find(item => /^Project\.json$/i.test(item.name));
      if (!manifestFile) throw new Error('This Drive project has no editable Project.json manifest. Older exports can still be viewed and downloaded, but cannot restore their timeline automatically.');
      const manifest = JSON.parse(await fetchDriveText(driveToken, manifestFile.id)) as { title?: string; recapId?: string; script?: RecapScript; editPlan?: unknown; settings?: Record<string, unknown>; sourceFileName?: string; mediaAssets?: Array<{ fileName: string; name: string; kind: 'video'|'image' }>; sounds?: Array<{ name?: string; fileName?: string; category?: string; startSeconds?: number; durationSeconds?: number; volume?: number; source?: string }> };
      if (!manifest.script || !Array.isArray(manifest.script.beats) || manifest.script.beats.length < 1 || manifest.script.beats.length > 100) throw new Error('The saved project manifest is invalid or incomplete.');
      clearGeneratedOutputs(); setVideo(null); setFile(null); setTimelineAssets([]); setNeedsTopUp(false);
      const localId = newProjectId(); projectIdRef.current = localId; keepOutputs.current = true; exportedRef.current = false;
      setTitle(String(manifest.title || manifest.script.title || 'Restored project')); setMode('file'); setScript(manifest.script); setRecapId(String(manifest.recapId || '')); setHasSourceTimecodes(true);
      const legacySettings = manifest.settings || {};
      const migratedPlan = manifest.editPlan ? normalizeEditPlan(manifest.editPlan) : null;
      const settings: Record<string, unknown> = { ...legacySettings, ...(migratedPlan ? { exportQuality: migratedPlan.exportQuality, aspectRatio: migratedPlan.aspectRatio, effectPreset: migratedPlan.filter, visualEffect: migratedPlan.effect, transition: migratedPlan.transition, playbackRate: String(migratedPlan.speed), mirrorPreview: migratedPlan.mirror, cropMode: migratedPlan.crop, textOverlay: migratedPlan.text?.value || '', emojiOverlay: migratedPlan.emoji || '', overlayFont: migratedPlan.text?.font || 'Inter', textPosition: migratedPlan.text?.position || 'center', textX: migratedPlan.text?.x ?? 50, textY: migratedPlan.text?.y ?? (migratedPlan.text?.position === 'top' ? 15 : migratedPlan.text?.position === 'bottom' ? 85 : 50), textScale: migratedPlan.text?.scale || 1, textRotation: migratedPlan.text?.rotation || 0, textAnimation: migratedPlan.text?.animation || 'None', sticker: migratedPlan.sticker || '', showWatermark: migratedPlan.watermark } : {}) };
      if (typeof settings.aspectRatio === 'string' && ['9:16','16:9','1:1','4:5'].includes(settings.aspectRatio)) setAspectRatio(settings.aspectRatio as '9:16'|'16:9'|'1:1'|'4:5');
      if (typeof settings.applyAspectRatio === 'boolean') setApplyAspectRatio(settings.applyAspectRatio);
      if (typeof settings.playbackRate === 'string') setPlaybackRate(settings.playbackRate);
      if (Array.isArray(settings.beatMarkers)) setBeatMarkers(settings.beatMarkers.map(Number).filter((n:number)=>Number.isFinite(n)&&n>=0));
      if (Array.isArray(settings.keyframes)) setKeyframes(settings.keyframes.filter((k:any)=>k&&Number.isFinite(Number(k.time))&&Number.isFinite(Number(k.scale))&&Number.isFinite(Number(k.rotation))).map((k:any)=>({time:Number(k.time),scale:Number(k.scale),rotation:Number(k.rotation)})));
      if (migratedPlan) { setAdjust(migratedPlan.adjust); setClipVolume(Math.round(migratedPlan.volume * 100)); setFadeIn(migratedPlan.fadeInSeconds); setFadeOut(migratedPlan.fadeOutSeconds); }
      if (['720p','1080p','2K'].includes(String(settings.exportQuality))) setQuality(settings.exportQuality as '720p'|'1080p'|'2K');
      if (typeof settings.fastCut === 'boolean') setFastCut(settings.fastCut);
      if (typeof settings.mirrorPreview === 'boolean') setMirrorPreview(settings.mirrorPreview);
      if (typeof settings.cropMode === 'string') setCropMode(settings.cropMode);
      if (typeof settings.textOverlay === 'string') setTextOverlay(settings.textOverlay);
      if (['top','center','bottom'].includes(String(settings.textPosition))) setTextPosition(settings.textPosition as 'top'|'center'|'bottom');
      if (Number.isFinite(Number(settings.textX))) setTextX(Math.max(0, Math.min(100, Number(settings.textX))));
      if (Number.isFinite(Number(settings.textY))) setTextY(Math.max(0, Math.min(100, Number(settings.textY))));
      if (Number.isFinite(Number(settings.textScale))) setTextScale(Math.max(0.5, Math.min(2, Number(settings.textScale))));
      if (Number.isFinite(Number(settings.textRotation))) setTextRotation(Math.max(-180, Math.min(180, Number(settings.textRotation))));
      if (typeof settings.emojiOverlay === 'string') setEmojiOverlay(settings.emojiOverlay);
      if (typeof settings.overlayFont === 'string') setOverlayFont(settings.overlayFont);
      if (typeof settings.showWatermark === 'boolean') setShowWatermark(settings.showWatermark);
      if (typeof settings.effectPreset === 'string') setEffectPreset(settings.effectPreset === 'none' ? 'Original' : settings.effectPreset);
      if (typeof settings.visualEffect === 'string') setVisualEffect(settings.visualEffect);
      if (typeof settings.textAnimation === 'string') setTextAnimation(settings.textAnimation);
      if (typeof settings.transition === 'string') setTransition(settings.transition);
      if (typeof settings.sticker === 'string') setSticker(settings.sticker);
      const restoredSounds: WyCutAudioTrack[] = [];
      for (const sound of manifest.sounds || []) {
        if (!sound.fileName) continue; const item = kit.voices.find(v => v.name === sound.fileName); if (!item) continue;
        const blob = await fetchDriveBlob(driveToken, item.id);
        restoredSounds.push({ id: `drive-${item.id}`, name: sound.name || item.name, category: sound.category || 'Imported', blob, startSeconds: Math.max(0, Number(sound.startSeconds) || 0), durationSeconds: Math.max(0.1, Number(sound.durationSeconds) || 1), volume: Math.max(0, Math.min(1, Number(sound.volume) || 0)), source: sound.source === 'library' ? 'library' : 'device' });
      }
      setSoundTracks(restoredSounds);
      const sourceItem = manifest.sourceFileName ? kit.videos.find(v => v.name === manifest.sourceFileName) : kit.videos.find(v => /^SOURCE_ORIGINAL_/i.test(v.name));
      if (sourceItem) { const sourceBlob = await fetchDriveBlob(driveToken, sourceItem.id); const sourceFile = new File([sourceBlob], sourceItem.name.replace(/^SOURCE_ORIGINAL_/, ''), { type: sourceBlob.type || 'video/mp4', lastModified: Date.now() }); setVideo(sourceFile); setNotice('Project and original source restored from Google Drive.'); }
      const restoredAssets: File[] = [];
      for (const asset of manifest.mediaAssets || []) { const item = kit.videos.find(v => v.name === asset.fileName); if (item) { const blob = await fetchDriveBlob(driveToken, item.id); restoredAssets.push(new File([blob], asset.name || item.name, { type: blob.type || (asset.kind === 'image' ? 'image/jpeg' : 'video/mp4'), lastModified: Date.now() })); } }
      setTimelineAssets(restoredAssets);
      void saveProject(localId, { title: String(manifest.title || manifest.script.title || 'Restored project'), mode: 'file', status: 'idle', script: manifest.script, recapId: String(manifest.recapId || ''), hasSourceTimecodes: true, drive: { folderId, folderUrl: `https://drive.google.com/drive/folders/${folderId}`, exportedAt: Date.now(), fileCount: kit.master.length + kit.videos.length + kit.voices.length } });
      setNotice(sourceItem ? 'Project, original source video, media assets, sound tracks and settings restored from Google Drive.' : 'Project settings restored. This older export does not contain its original source; select it once and export again to save it to Drive.');
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not restore this project from Google Drive.'); }
  }
  const openDriveProjectRef = useRef(openDriveProject); openDriveProjectRef.current = openDriveProject;

  async function openProject(id: string) {
    if (!id || projectIdRef.current === id) return;
    if (busy) { setNotice('Wait for the current generation to finish before opening another project.'); return; }
    const record = await getProject(id);
    if (!record) { setNotice('That project is no longer stored on this device.'); return; }
    clearGeneratedOutputs(); setVideo(null); setFile(null); setTimelineAssets([]); setNeedsTopUp(false);
    projectIdRef.current = record.id; keepOutputs.current = true; exportedRef.current = record.status === 'exported';
    setTitle(record.title); setMode(record.mode); setSubtitleUrl(record.subtitleUrl || ''); setUrl(record.videoUrl || '');
    restoredTranscript.current = record.transcript || null;
    if (record.script) {
      
      setScript(record.script); setRecapId(record.recapId || ''); setHasSourceTimecodes(record.hasSourceTimecodes === true);
      setNotice(`Project restored: your script is back. ${record.sourceName ? `To slice clips, choose the source video again (${record.sourceName}).` : 'Choose the source video again to slice clips.'}`);
    } else if (record.transcript) setNotice('Project restored. Your transcript is saved, so tap Generate to continue without paying for transcription again.');
    else setNotice(`Project restored. ${record.sourceName ? `Choose ${record.sourceName} again and tap Generate to continue; transcription parts already paid for are reused.` : 'Add your source and tap Generate to continue.'}`);
  }
  const openProjectRef = useRef(openProject); openProjectRef.current = openProject;
  const connectDriveRef = useRef(connectDrive); connectDriveRef.current = connectDrive;
  useEffect(() => {
    const check = () => { const id = takePendingProject(); if (id) void openProjectRef.current(id); };
    const checkDrive = () => { const id = takePendingDriveProject(); if (id) void openDriveProjectRef.current(id); };
    const connect = () => void connectDriveRef.current();
    check(); checkDrive(); window.addEventListener(OPEN_PROJECT_EVENT, check); window.addEventListener(OPEN_DRIVE_PROJECT_EVENT, checkDrive); window.addEventListener(CONNECT_DRIVE_EVENT, connect);
    return () => { window.removeEventListener(OPEN_PROJECT_EVENT, check); window.removeEventListener(OPEN_DRIVE_PROJECT_EVENT, checkDrive); window.removeEventListener(CONNECT_DRIVE_EVENT, connect); };
  }, []);
  // The Drive connection may be renewed from the History page while the studio stays mounted.
  useEffect(() => { const sync = () => { try { const t = localStorage.getItem(DRIVE_TOKEN_KEY) || ''; const e = Number(localStorage.getItem(DRIVE_TOKEN_EXPIRY_KEY) || 0); setDriveToken(t && e > Date.now() ? t : ''); } catch { /* ignore */ } }; window.addEventListener(DRIVE_TOKEN_EVENT, sync); return () => window.removeEventListener(DRIVE_TOKEN_EVENT, sync); }, []);
  async function sliceVideo() { if (!hasSourceTimecodes && !script?.manual) { setNotice('Accurate cuts require a timestamped SRT/VTT transcript. Plain text has no source timecodes, so any AI timing would be a guess. Upload the matching SRT/VTT before slicing.'); return; } if (!script || !video) { setNotice('Generate a script and choose the source movie file you are authorized to edit.'); return; } const job = startJob('slice'); setBusy(true); setStage('Loading local FFmpeg…'); setProgress(0); setNotice(''); setClips([]); setRoughCut(null); try { const duration = await getVideoDuration(video); const lastTimestamp = Math.max(...script.beats.map(beat => beat.endSeconds)); if (lastTimestamp > duration + 2) throw new Error(`The script references ${Math.round(lastTimestamp)} seconds, but this source video is only ${Math.round(duration)} seconds long. Upload matching subtitles/source video.`); const output = await sliceVideoLocally(video, script.beats.map(b => ({ index: b.index, id: b.id, startSeconds: b.startSeconds, endSeconds: b.endSeconds })), (p, current, total) => { setProgress(Math.round(p * 100)); setStage(current > 0 ? `Slicing clip ${current} of ${total} locally…` : 'Processing video locally…'); }, { fast: fastCut && !applyAspectRatio, aspectRatio: applyAspectRatio ? aspectRatio : undefined, resolution: (Capacitor.isNativePlatform() || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) ? '720p' : '1080p' }); if (job.cancelled) return; setClips(output); cutSigRef.current = cutSignature(); checkpoint({ clipCount: output.length }); const clipBytes = output.reduce((sum, clip) => sum + clip.size, 0); const roughCutLimit = (Capacitor.isNativePlatform() || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ? 60 : 180) * 1024 * 1024; if (clipBytes > roughCutLimit) { setNotice(`${output.length} clips created (${Math.round(clipBytes / 1024 / 1024)} MB). The combined rough cut was skipped because it needs more memory than this device can safely use — save the clips and join them in your editor, or use a desktop browser.`); } else { setStage('Creating rough cut locally…'); const rough = await concatenateClipsLocally(output, p => setProgress(Math.round(p * 100))); if (job.cancelled) return; setRoughCut(rough); checkpoint({ clipCount: output.length, roughCut: true }); setNotice(`${output.length} clips and a rough cut created on this device for the ${Math.round((script?.targetRuntimeSeconds || 0) / 60)}-minute target${fastCut ? ' with fast cut (a clip can start a second or two before its start time).' : ' with frame-accurate cuts.'}`); } } catch (e) { if (job.cancelled) return; setNotice(e instanceof Error ? e.message : 'Local video slicing failed.'); } finally { if (!job.cancelled) { setBusy(false); setStage(''); setActiveKind(''); if (Capacitor.isNativePlatform() || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) void releaseFFmpegMemory().catch(() => undefined); } } }
  async function mixSoundsIntoRoughCut() {
    if (!roughCut || !soundTracks.length || busy) return;
    const mobile = Capacitor.isNativePlatform() || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    const safeBytes = (mobile ? 90 : 300) * 1024 * 1024;
    const soundBytes = soundTracks.reduce((sum, track) => sum + track.blob.size, 0);
    if (roughCut.size + soundBytes > safeBytes) {
      setNotice(`Sound mixing needs a temporary in-memory copy. This export is too large for a safe local mix on this device. Your video and sound tracks are still available separately; use a smaller resolution or shorter recap to mix them together.`);
      return;
    }
    const job = startJob('slice'); setBusy(true); setStage('Mixing sound layers locally…'); setProgress(2); setNotice('');
    try {
      const mixed = await mixAudioTracksLocally(roughCut, soundTracks.map(track => ({ ...track, loop: track.category === 'Background Music' || track.category === 'Ambience' })), p => { if (!job.cancelled) setProgress(Math.round(p * 100)); });
      if (job.cancelled) return;
      setRoughCut(mixed); setProgress(100); setNotice('Sound layers mixed into the recap locally. No AI credits were used.');
    } catch (error) {
      if (!job.cancelled) setNotice(error instanceof Error ? error.message : 'Could not mix sound layers into this video.');
    } finally { if (!job.cancelled) { setBusy(false); setStage(''); setActiveKind(''); } }
  }

  async function exportDrive(finalVideo?: Blob) {
    if (!driveToken) { setNotice('Connect Google Drive first.'); return; }
    if (!script) { setNotice('Generate a clip script before exporting.'); return; }
    startJob('export'); setBusy(true); setStage('Uploading clips and scripts directly to your Google Drive…'); setNotice(''); setDriveFolder('');
    try {
      const files: DriveExportFile[] = [];
      const beatText = (b: RecapScript['beats'][number]) => `${String(b.index).padStart(3, '0')} ${b.title}\nSource: ${b.startSeconds.toFixed(2)}s–${b.endSeconds.toFixed(2)}s | Act ${b.act} | ${clipFit(b)}\n${b.narration}\n${b.dialogueCues.map(c => `[LET MOVIE AUDIO PLAY: ${c.startSeconds}s - ${c.quote || c.instruction}]`).join('\n')}\n`;
      for (const c of clips) {
        files.push({ name: c.filename, mimeType: 'video/mp4', body: c.blob, folder: 'video' });
        // Each clip gets a text file with the same name holding the script written for it.
        const beat = script.beats.find(b => c.filename.startsWith(`${String(b.index).padStart(3, '0')}_`));
        if (beat) files.push({ name: c.filename.replace(/\.mp4$/i, '.txt'), mimeType: 'text/plain', body: beatText(beat), folder: 'video' });
      }
      files.push({ name: 'Timeline_Script.txt', mimeType: 'text/plain', body: script.beats.map(beatText).join('\n'), folder: 'master' });
      const sourceFileName = video ? `SOURCE_ORIGINAL_${safeName(video.name)}` : '';
      if (video) files.push({ name: sourceFileName, mimeType: video.type || 'video/mp4', body: video, folder: 'video' });
      const mediaAssets = timelineAssets.map((asset, index) => { const kind = asset.type.startsWith('image/') ? 'image' as const : 'video' as const; const fileName = `TIMELINE_ASSET_${String(index + 1).padStart(2, '0')}_${safeName(asset.name)}`; files.push({ name: fileName, mimeType: asset.type || (kind === 'image' ? 'image/jpeg' : 'video/mp4'), body: asset, folder: 'video' }); return { fileName, name: asset.name, kind }; });
      files.push({ name: 'Project.json', mimeType: 'application/json', body: JSON.stringify({ schemaVersion: 3, editPlan: normalizeEditPlan(buildPlan()), title: title || script.title, recapId, exportedAt: new Date().toISOString(), sourceFileName, mediaAssets, script, settings: { aspectRatio, applyAspectRatio, playbackRate, fastCut, mirrorPreview, cropMode, textOverlay, textPosition, textX, textY, textScale, textRotation, emojiOverlay, overlayFont, showWatermark, effectPreset, visualEffect, textAnimation, transition, sticker, beatMarkers, keyframes }, sounds: soundTracks.map((track, index) => { const ext = /wav/i.test(track.blob.type) ? 'wav' : /ogg/i.test(track.blob.type) ? 'ogg' : /aac/i.test(track.blob.type) ? 'aac' : /m4a/i.test(track.blob.type) ? 'm4a' : /flac/i.test(track.blob.type) ? 'flac' : 'mp3'; return { index, name: track.name, fileName: `${String(index + 1).padStart(2, '0')}_${safeName(track.name.replace(/\.[^.]+$/, ''))}.${ext}`, category: track.category, startSeconds: track.startSeconds, durationSeconds: track.durationSeconds, volume: track.volume, source: track.source }; }) }, null, 2), folder: 'master' });
      if (soundTracks.length) {
        soundTracks.forEach((track, index) => {
          const extension = /wav/i.test(track.blob.type) ? 'wav' : /ogg/i.test(track.blob.type) ? 'ogg' : /aac/i.test(track.blob.type) ? 'aac' : /m4a/i.test(track.blob.type) ? 'm4a' : /flac/i.test(track.blob.type) ? 'flac' : 'mp3';
          const audioName = `${String(index + 1).padStart(2, '0')}_${safeName(track.name.replace(/\.[^.]+$/, ''))}.${extension}`;
          files.push({ name: audioName, mimeType: track.blob.type || (extension === 'mp3' ? 'audio/mpeg' : `audio/${extension}`), body: track.blob, folder: 'voiceover' });
        });
        files.push({ name: 'Sound_Timeline.json', mimeType: 'application/json', body: JSON.stringify(soundTracks.map((track, index) => ({ index: index + 1, name: track.name, category: track.category, file: `${String(index + 1).padStart(2, '0')}_${safeName(track.name.replace(/\.[^.]+$/, ''))}.${(/wav/i.test(track.blob.type) ? 'wav' : /ogg/i.test(track.blob.type) ? 'ogg' : /aac/i.test(track.blob.type) ? 'aac' : /m4a/i.test(track.blob.type) ? 'm4a' : /flac/i.test(track.blob.type) ? 'flac' : 'mp3')}`, startSeconds: track.startSeconds, volume: track.volume, source: track.source })), null, 2), folder: 'master' });
      }
      if (finalVideo || roughCut) files.push({ name: isStillImage ? 'Final_Image.png' : 'Full_RoughCut.mp4', mimeType: isStillImage ? 'image/png' : 'video/mp4', body: finalVideo || roughCut!, folder: 'master' });
      const result = await exportProductionKit(driveToken, title || script.title, files, p => { setExportProgress(p.percent); setProgress(p.percent); setExportStage(p.completedFiles >= p.totalFiles ? 'Verifying saved project…' : `Saving ${p.currentFile} to Google Drive…`); });
      setDriveFolder(result.folderUrl); setExportProgress(100); setExportStage('Saved successfully'); setExportDone(true);
      if (projectIdRef.current) { exportedRef.current = true; const pid = projectIdRef.current; void saveProject(pid, { status: 'exported', stage: null, progress: null, error: null, drive: { folderId: result.folderId, folderUrl: result.folderUrl, exportedAt: Date.now(), fileCount: result.uploaded.length }, transcript: null, script: null, narrationReady: null, narrationParts: null, sourceSize: null, videoUrl: null, subtitleUrl: null }); void deleteNarrationParts(pid); }
      setNotice(`Export complete: ${result.uploaded.length} files saved to Google Drive${clips.length ? `, including ${clips.length} clips with their scripts` : ''}.`);
    } catch (e) {
      if (e instanceof Error && 'folderUrl' in e && typeof (e as Error & { folderUrl?: unknown }).folderUrl === 'string') setDriveFolder((e as Error & { folderUrl: string }).folderUrl);
      setExportDone(false); setExportStage(e instanceof Error ? e.message : 'Drive export failed.'); setNotice(e instanceof Error ? e.message : 'Drive export failed.');
    } finally { setBusy(false); setStage(''); setActiveKind(''); }
  }
  function addTimelineMedia(files?: FileList | null) {
    if (!files?.length) return;
    const additions = Array.from(files).filter(f => f.type.startsWith('video/') || f.type.startsWith('image/'));
    if (!additions.length) { setNotice('Choose a video or image file.'); return; }
    if (timelineAssets.length + additions.length > 20) { setNotice('A project can hold up to 20 extra video/image timeline assets.'); return; }
    const tooLarge = additions.find(f => f.size > 100 * 1024 * 1024);
    if (tooLarge) { setNotice(`${tooLarge.name} is over the 100 MB per-extra-asset limit. Add a smaller file.`); return; }
    setTimelineAssets(current => [...current, ...additions]);
    setNotice(`${additions.length} media asset${additions.length === 1 ? '' : 's'} added to the project timeline. Assets are saved to Drive on export; this build does not yet composite extra images/videos into the final MP4.`);
  }
  async function downloadRecapScript(format: 'txt'|'json' = 'txt') {
    if (!script) return;
    const text = format === 'json'
      ? JSON.stringify(script, null, 2)
      : `${script.title}\n\n${script.beats.map((b) => `[${formatTime(b.startSeconds)}–${formatTime(b.endSeconds)}] ${b.title}\n${b.narration}`).join('\n\n')}\n`;
    await downloadFile(new Blob([text], { type: format === 'json' ? 'application/json' : 'text/plain;charset=utf-8' }), `${safeName(title || script.title)}_recap.${format}`);
  }
  function formatTime(seconds: number) { const m = Math.floor(seconds / 60); const sec = Math.floor(seconds % 60); return `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`; }
  function safeName(value: string) { return value.replace(/[^a-z0-9_-]+/gi, '_').replace(/^_+|_+$/g, '').slice(0,80) || 'WyCut'; }
  function captionStamp(seconds: number) { const ms = Math.max(0, Math.round(seconds * 1000)); const h = Math.floor(ms / 3600000); const m = Math.floor((ms % 3600000) / 60000); const sec = Math.floor((ms % 60000) / 1000); const milli = ms % 1000; return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')},${String(milli).padStart(3,'0')}`; }
  async function downloadCaptions() { if (!script?.beats?.length) { setNotice('Generate or prepare a script before exporting captions.'); return; } let cursor = 0; const blocks = script.beats.filter(b => b.endSeconds > b.startSeconds).map((b,i) => { const start = cursor; cursor += b.endSeconds - b.startSeconds; return `${i+1}\n${captionStamp(start)} --> ${captionStamp(cursor)}\n${[b.title, b.narration].filter(Boolean).join(' ').replace(/\r?\n/g,' ')}`; }); if (!blocks.length) { setNotice('There are no valid timestamped clips to export as captions.'); return; } await downloadFile(new Blob([blocks.join('\n\n')+'\n'], { type: 'application/x-subrip;charset=utf-8' }), `${safeName(title || script.title)}_captions.srt`); setNotice('Timestamped SRT captions downloaded. You can import this file into your publishing platform or another editor.'); }
  const cutSigRef = useRef('');
  function cutSignature() { return script ? JSON.stringify([script.beats.map(b => [b.startSeconds, b.endSeconds]), fastCut && !applyAspectRatio, applyAspectRatio ? aspectRatio : '']) : ''; }
  function buildPlan(exportKeyframes = keyframes, transitionCuts: number[] = []) { return normalizeEditPlan({ exportQuality: quality, keyframes: exportKeyframes, transitionCuts, aspectRatio, filter: effectPreset, effect: visualEffect, transition, speed: playbackRate, volume: editorMuted ? 0 : clipVolume / 100, fadeInSeconds: fadeIn, fadeOutSeconds: fadeOut, adjust, mirror: mirrorPreview, crop: cropMode === 'cover' ? 'cover' : 'contain', text: (textOverlay || emojiOverlay || sticker) ? { value: textOverlay, animation: textAnimation, font: overlayFont, position: textPosition, x: textX, y: textY, scale: textScale, rotation: textRotation } : undefined, emoji: emojiOverlay, sticker, watermark: showWatermark }); }
  async function renderStillImage(asVideo: boolean): Promise<Blob> {
    if (!video || !video.type.startsWith('image/')) throw new Error('Choose an image first.');
    const plan = normalizeEditPlan(buildPlan());
    const image = await new Promise<HTMLImageElement>((resolve, reject) => { const img = new Image(); const url = URL.createObjectURL(video); img.onload = () => { URL.revokeObjectURL(url); resolve(img); }; img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not decode the selected image.')); }; img.src = url; });
    const dims: Record<string, Record<'720p'|'1080p'|'2K',[number,number]>> = {'9:16':{'720p':[720,1280],'1080p':[1080,1920],'2K':[1440,2560]},'1:1':{'720p':[720,720],'1080p':[1080,1080],'2K':[2048,2048]},'16:9':{'720p':[1280,720],'1080p':[1920,1080],'2K':[2560,1440]},'4:5':{'720p':[720,900],'1080p':[1080,1350],'2K':[2048,2560]}};
    const [w,h] = dims[plan.aspectRatio]?.[plan.exportQuality] || dims['9:16']['720p']; const canvas = document.createElement('canvas'); canvas.width=w; canvas.height=h; const ctx=canvas.getContext('2d'); if(!ctx) throw new Error('Image renderer is unavailable on this device.');
    const filter = [previewFilterForPlan({filter: plan.filter}), previewEffectForPlan({effect: plan.effect}), previewAdjustForPlan(plan.adjust)].filter(v=>v&&v!=='none').join(' '); ctx.filter=filter||'none';
    const scale = plan.crop==='cover' ? Math.max(w/image.width,h/image.height) : Math.min(w/image.width,h/image.height); const dw=image.width*scale, dh=image.height*scale; const points=[...plan.keyframes].sort((a,b)=>a.time-b.time); let frameScale=1, frameRotation=0; const before=[...points].reverse().find(k=>k.time<=playheadSeconds); const after=points.find(k=>k.time>playheadSeconds); if(before){frameScale=before.scale;frameRotation=before.rotation;if(after&&after.time>before.time){const t=Math.max(0,Math.min(1,(playheadSeconds-before.time)/(after.time-before.time)));frameScale=before.scale+(after.scale-before.scale)*t;frameRotation=before.rotation+(after.rotation-before.rotation)*t;}} ctx.save(); ctx.translate(w/2,h/2); ctx.rotate(frameRotation*Math.PI/180); ctx.scale(frameScale*(plan.mirror?-1:1),frameScale); ctx.translate(-w/2,-h/2); ctx.drawImage(image,(w-dw)/2,(h-dh)/2,dw,dh); ctx.restore(); ctx.filter='none';
    const overlayText=[plan.text?.value,plan.emoji,plan.sticker].filter(Boolean).join(' '); if(overlayText){ctx.save();ctx.translate(w*(Number(plan.text?.x??50)/100),h*(Number(plan.text?.y??50)/100));ctx.rotate(Number(plan.text?.rotation||0)*Math.PI/180);ctx.scale(Number(plan.text?.scale||1),Number(plan.text?.scale||1));ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=`900 ${Math.round(w*.06)}px ${/^[\w ,'-]{1,50}$/.test(plan.text?.font||'')?plan.text?.font:'sans-serif'}`;ctx.lineWidth=Math.max(3,w*.006);ctx.strokeStyle='#000';ctx.fillStyle='#fff';ctx.strokeText(overlayText,0,0,w*.9);ctx.fillText(overlayText,0,0,w*.9);ctx.restore();}
    if(plan.watermark){ctx.font=`bold ${Math.round(w*.026)}px sans-serif`;ctx.textAlign='right';ctx.fillStyle='rgba(255,255,255,.88)';ctx.fillText('WyCut',w-18,h-24);}
    const imageBlob = await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('Could not encode the edited image.')),'image/png'));
    if(!asVideo) return imageBlob;
    setExportStage('Creating 5-second video from the edited image…'); return await renderEditPlan(imageBlob, {...plan, filter:'Original', effect:'None', adjust:NO_ADJUST, mirror:false, text:undefined, emoji:'', sticker:'', watermark:false, keyframes:[], transitionCuts:[], transition:'Cut', speed:1, volume:0, fadeInSeconds:plan.fadeInSeconds, fadeOutSeconds:plan.fadeOutSeconds}, p=>setExportProgress(Math.min(95,50+Math.round(p*.45))));
  }
  async function exportToDeviceAndDrive(outputKind?: 'image'|'video') {
    if (!script || !video) { setNotice('Open a video or image to export.'); return; }
    const kind = isStillImage ? outputKind : 'video';
    if (isStillImage && !kind) { setExportChoiceOpen(true); return; }
    if (busy) return;
    setExportPage(true); setExportDone(false); setExportProgress(0); setExportStage('Preparing export…');
    setBusy(true); setStage('Preparing files for export…');
    try {
      // Cut the clips now if the edit changed since the last cut, so the export always matches the timeline.
      let renderSource: Blob;
      if (isStillImage) { renderSource = video; }
      else if (roughCut && cutSigRef.current === cutSignature()) renderSource = roughCut;
      else if (clips.length && cutSigRef.current === cutSignature()) renderSource = await concatenateClipsLocally(clips, percent => { setExportProgress(Math.round(percent * 10)); setExportStage(`Joining clips… ${Math.round(percent * 100)}%`); });
      else {
        const mobile = Capacitor.isNativePlatform() || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
        const cut = await sliceVideoLocally(video, script.beats.map(b => ({ index: b.index, id: b.id, startSeconds: b.startSeconds, endSeconds: b.endSeconds })), (p, current, total) => { setExportProgress(Math.round(p * 45)); setExportStage(`Cutting clip ${current} of ${total}…`); }, { fast: fastCut && !applyAspectRatio, aspectRatio: applyAspectRatio ? aspectRatio : undefined, resolution: quality === '2K' ? '2K' : mobile ? '720p' : '1080p' });
        setClips(cut);
        renderSource = await concatenateClipsLocally(cut, percent => { setExportProgress(45 + Math.round(percent * 5)); setExportStage(`Joining clips… ${Math.round(percent * 100)}%`); });
        setRoughCut(renderSource); cutSigRef.current = cutSignature();
      }
      // Keyframes are placed against the source timeline. Map them into the assembled cut timeline so deleted/trimmed ranges do not shift animations incorrectly.
      const mappedKeyframes = (isStillImage ? [] : keyframes).map(k => { let mapped: number | null = null; let cursor = 0; for (const b of (script?.beats || [])) { const length = Math.max(0, b.endSeconds - b.startSeconds); if (k.time >= b.startSeconds && k.time <= b.endSeconds) { mapped = cursor + Math.max(0, Math.min(length, k.time - b.startSeconds)); break; } cursor += length; } return mapped === null ? null : { ...k, time: mapped }; }).filter((k): k is { time: number; scale: number; rotation: number } => Boolean(k)).sort((a,b)=>a.time-b.time);
      const transitionCuts: number[] = []; let cutElapsed = 0; (isStillImage ? [] : (script?.beats || [])).forEach((b, i, all) => { cutElapsed += Math.max(0, b.endSeconds - b.startSeconds); if (i < all.length - 1) transitionCuts.push(cutElapsed); });
      const plan = buildPlan(mappedKeyframes, transitionCuts);
      setExportStage(isStillImage && kind === 'image' ? 'Rendering edited still image…' : 'Rendering filters, overlays, keyframes and audio settings…'); setExportProgress(50);
      const finalVideo = isStillImage ? (kind === 'video' ? await renderEditPlan(video, {...plan, speed:1, volume:0}, percent => { setExportProgress(Math.min(95, 50 + Math.round(percent * .45))); setExportStage(`Rendering 5-second image video… ${percent}%`); }) : await renderStillImage(false)) : await renderEditPlan(renderSource, plan, percent => { setExportProgress(Math.min(95, 50 + Math.round(percent * .45))); setExportStage(`Rendering edited MP4… ${percent}%`); });
      if (quality === '2K') {
        setExportStage('Charging 2K export credits…');
        const fallback = localStorage.getItem('wycut_google_id_token') || sessionStorage.getItem('wycut_google_id_token') || '';
        const idToken = await getAuthToken(fallback);
        if (!exportAttemptIdRef.current) exportAttemptIdRef.current = `2k-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
        const exportId = exportAttemptIdRef.current;
        const chargeResponse = await fetch('/api/editor/export/charge', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken, exportId, quality }), cache: 'no-store' });
        const chargeData = await chargeResponse.json().catch(() => ({})) as { error?: string; credits?: number; cost?: number };
        if (!chargeResponse.ok) throw new Error(chargeData.error || 'Could not authorize the 2K export. Your video has not been downloaded.');
        if (typeof chargeData.credits === 'number') setCredits(chargeData.credits);
        setNotice(`2K export completed. ${chargeData.cost || 0} export credits charged.`);
      }
      await downloadFile(finalVideo, `${safeName(title || script.title)}_${quality}_edit.${isStillImage && kind === 'image' ? 'png' : 'mp4'}`);
      if (quality === '2K') exportAttemptIdRef.current = '';
      if (!isStillImage && !script.manual) await downloadRecapScript('txt');
      if (driveToken) await exportDrive(finalVideo);
      else { setExportProgress(100); setExportStage('Saved to this device'); setExportDone(true); }
    } catch (error) { setExportStage(error instanceof Error ? error.message : 'Export failed.'); setExportDone(false); }
    finally { setBusy(false); setStage(''); }
  }
  const previewRef = useRef<HTMLVideoElement>(null);
  const mediaInputRef = useRef<HTMLInputElement>(null);
  const [selectedAudioId, setSelectedAudioId] = useState(''); const [audioMessage, setAudioMessage] = useState(''); const [audioBusy, setAudioBusy] = useState(false);
  // ---- Manual cutting: the video opens as one clip you can split, trim and delete right away (no AI script needed). ----
  const segments = useMemo<Segment[]>(() => script?.beats.map(b => ({ start: b.startSeconds, end: b.endSeconds })) || [], [script]);
  useEffect(() => {
    if (!video || !(videoSeconds > 0) || script) return;
    setScript({ title: 'Manual edit', targetRuntimeSeconds: Math.round(videoSeconds), manual: true, beats: [{ index: 1, id: 'clip_1', title: 'Clip 1', startSeconds: 0, endSeconds: Math.round(videoSeconds * 1000) / 1000, narration: '', dialogueCues: [], act: 1 }] });
    setSelectedClipIndex(0);
  }, [video, videoSeconds, script]);
  function reindexBeats(beats: RecapScript['beats'], manual?: boolean) { return beats.map((b, i) => ({ ...b, index: i + 1, title: manual ? `Clip ${i + 1}` : b.title })); }
  function frameStep(frames: number) { const v = previewRef.current; if (!v) return; const t = snapToFrame(v.currentTime + frames / fps, fps); seekPreview(Math.min(t, Math.max(0, videoSeconds - 1 / fps))); }
  function splitAtPlayhead() {
    if (!script || busy) return;
    const v = previewRef.current; const t = snapToFrame(v ? v.currentTime : playheadSeconds, fps);
    const i = segmentAt(segments, t); const result = splitAt(segments, t, fps);
    if (!result || i < 0) { setNotice('Move the playhead onto a clip, at least one frame away from its edges, then tap Split.'); return; }
    const beat = script.beats[i]; const cut = result.segments[i].end;
    const words = beat.narration.split(/\s+/).filter(Boolean); const pivot = Math.max(1, Math.round(words.length * (cut - beat.startSeconds) / Math.max(0.001, beat.endSeconds - beat.startSeconds)));
    const first = { ...beat, id: `${beat.id}_a`, title: script.manual ? beat.title : `${beat.title} (Part 1)`, endSeconds: cut, narration: words.slice(0, pivot).join(' '), dialogueCues: beat.dialogueCues.filter(c => c.endSeconds <= cut) };
    const second = { ...beat, id: `${beat.id}_b${Date.now() % 10000}`, title: script.manual ? beat.title : `${beat.title} (Part 2)`, startSeconds: cut, narration: words.slice(pivot).join(' '), dialogueCues: beat.dialogueCues.filter(c => c.startSeconds >= cut) };
    const beats = [...script.beats]; beats.splice(i, 1, first, second);
    setScript({ ...script, beats: reindexBeats(beats, script.manual) }); setSelectedClipIndex(i + 1); setNotice('');
  }
  function deleteSelectedClip() {
    if (!script || busy) return;
    if (script.beats.length <= 1) { setNotice('Keep at least one clip. To remove the whole video, close the editor.'); return; }
    const beats = script.beats.filter((_, i) => i !== selectedClipIndex);
    setScript({ ...script, beats: reindexBeats(beats, script.manual) }); setSelectedClipIndex(Math.min(selectedClipIndex, beats.length - 1)); setNotice('');
  }
  function trimClip(index: number, edge: 'start' | 'end', time: number) {
    if (!script || busy) return;
    const next = trimEdge(segments, index, edge, time, videoSeconds, fps); if (next === segments) return;
    setScript({ ...script, beats: script.beats.map((b, j) => (j === index ? { ...b, startSeconds: next[index].start, endSeconds: next[index].end } : b)) });
    const v = previewRef.current; if (v) { if (!v.paused) v.pause(); v.currentTime = edge === 'start' ? next[index].start : Math.max(next[index].start, next[index].end - 1 / fps); setPlayheadSeconds(v.currentTime); }
  }
  // While playing, skip the removed parts so the preview matches the exported video.
  useEffect(() => {
    if (!previewPlaying || !segments.length) return;
    let raf = 0;
    const tick = () => {
      const v = previewRef.current;
      if (v) { const jump = playbackJump(segments, v.currentTime); if (jump !== null) { if (jump === Infinity) { v.pause(); v.currentTime = Math.max(...segments.map(x => x.end)); } else v.currentTime = jump; } }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [previewPlaying, segments]);
  // Measure the real frame rate while the video plays, so frame stepping and cut points land on exact frames.
  useEffect(() => {
    type FrameVideo = HTMLVideoElement & { requestVideoFrameCallback?: (cb: (now: number, meta: { mediaTime: number }) => void) => number; cancelVideoFrameCallback?: (id: number) => void };
    const v = previewRef.current as FrameVideo | null;
    if (!v?.requestVideoFrameCallback || !previewPlaying) return;
    let id = 0; let last = -1; const gaps: number[] = [];
    const cb = (_now: number, meta: { mediaTime: number }) => {
      if (last >= 0 && meta.mediaTime > last) gaps.push(meta.mediaTime - last);
      last = meta.mediaTime;
      if (gaps.length >= 12) { setFps(normalizeFps(1 / Math.min(...gaps))); return; }
      id = v.requestVideoFrameCallback!(cb);
    };
    id = v.requestVideoFrameCallback(cb);
    return () => v.cancelVideoFrameCallback?.(id);
  }, [previewPlaying, previewUrl]);
  const videoThumbs = useVideoThumbs(previewUrl, videoSeconds, 10, !isStillImage && !busy && Boolean(video) && (video?.size || 0) < 600 * 1024 * 1024);
  // Load the video engine while the user is still looking at the editor, so the first cut starts immediately.
  useEffect(() => { if (!video) return; const t = window.setTimeout(warmFFmpeg, 1200); return () => window.clearTimeout(t); }, [video]);

  // Undo / redo over every edit setting (script, audio layers, text, looks, canvas).
  type EditSnap = { script: RecapScript | null; soundTracks: WyCutAudioTrack[]; textOverlay: string; textPosition: 'top'|'center'|'bottom'; textX: number; textY: number; textScale: number; textRotation: number; emojiOverlay: string; overlayFont: string; effectPreset: string; visualEffect: string; textAnimation: string; transition: string; sticker: string; aspectRatio: '9:16'|'16:9'|'1:1'|'4:5'; cropMode: string; mirrorPreview: boolean; playbackRate: string; adjust: Adjust; clipVolume: number; fadeIn: number; fadeOut: number };
  const editSnap = useMemo<EditSnap>(() => ({ script, soundTracks, textOverlay, textPosition, textX, textY, textScale, textRotation, emojiOverlay, overlayFont, effectPreset, visualEffect, textAnimation, transition, sticker, aspectRatio, cropMode, mirrorPreview, playbackRate, adjust, clipVolume, fadeIn, fadeOut }), [script, soundTracks, textOverlay, textPosition, textX, textY, textScale, textRotation, emojiOverlay, overlayFont, effectPreset, visualEffect, textAnimation, transition, sticker, aspectRatio, cropMode, mirrorPreview, playbackRate, adjust, clipVolume, fadeIn, fadeOut]);
  const histRef = useRef<{ stack: EditSnap[]; index: number }>({ stack: [], index: -1 });
  const [histState, setHistState] = useState({ canUndo: false, canRedo: false });
  useEffect(() => {
    const h = histRef.current;
    if (!video) { h.stack = []; h.index = -1; setHistState(s => (s.canUndo || s.canRedo ? { canUndo: false, canRedo: false } : s)); return; }
    const timer = window.setTimeout(() => {
      const cur = h.stack[h.index];
      if (cur && (Object.keys(editSnap) as (keyof EditSnap)[]).every(k => cur[k] === editSnap[k])) return;
      h.stack = h.stack.slice(0, h.index + 1); h.stack.push(editSnap); if (h.stack.length > 60) h.stack.shift(); h.index = h.stack.length - 1;
      setHistState({ canUndo: h.index > 0, canRedo: false });
    }, 350);
    return () => window.clearTimeout(timer);
  }, [editSnap, video]);
  function applySnap(s: EditSnap) { setScript(s.script); setSoundTracks(s.soundTracks); setTextOverlay(s.textOverlay); setTextPosition(s.textPosition); setTextX(s.textX); setTextY(s.textY); setTextScale(s.textScale); setTextRotation(s.textRotation); setEmojiOverlay(s.emojiOverlay); setOverlayFont(s.overlayFont); setEffectPreset(s.effectPreset); setVisualEffect(s.visualEffect); setTextAnimation(s.textAnimation); setTransition(s.transition); setSticker(s.sticker); setAspectRatio(s.aspectRatio); setCropMode(s.cropMode); setMirrorPreview(s.mirrorPreview); setPlaybackRate(s.playbackRate); setAdjust(s.adjust); setClipVolume(s.clipVolume); setFadeIn(s.fadeIn); setFadeOut(s.fadeOut); }
  function undoEdit() { const h = histRef.current; if (h.index <= 0) return; h.index -= 1; applySnap(h.stack[h.index]); setHistState({ canUndo: h.index > 0, canRedo: true }); }
  function redoEdit() { const h = histRef.current; if (h.index >= h.stack.length - 1) return; h.index += 1; applySnap(h.stack[h.index]); setHistState({ canUndo: true, canRedo: h.index < h.stack.length - 1 }); }

  useEffect(() => { const v = previewRef.current; if (v) v.playbackRate = Number(playbackRate) || 1; }, [playbackRate, previewUrl]);
  useEffect(() => { const v = previewRef.current; if (v) v.muted = editorMuted; }, [editorMuted, previewUrl]);
  useEffect(() => { if (!video) return; document.body.classList.add('wycut-editor-open'); return () => document.body.classList.remove('wycut-editor-open'); }, [video]);
  function seekPreview(t: number) { const v = previewRef.current; if (!v || !Number.isFinite(t)) return; if (!v.paused) v.pause(); const max = Number.isFinite(v.duration) ? v.duration : t; v.currentTime = Math.max(0, Math.min(t, max)); setPlayheadSeconds(v.currentTime); }
  function togglePreviewPlay() { const v = previewRef.current; if (!v) return; if (v.paused) { if (v.ended || (Number.isFinite(v.duration) && v.currentTime >= v.duration - 0.05)) v.currentTime = 0; void v.play().catch(() => undefined); } else v.pause(); }
  async function addAudioFromDevice(file?: File) {
    if (!file) return;
    if (soundTracks.length >= MAX_AUDIO_LAYERS) { setAudioMessage(`You can add up to ${MAX_AUDIO_LAYERS} audio layers. Remove one first.`); setToolSheet('Audio'); return; }
    setAudioBusy(true); setAudioMessage('Reading audio…');
    try { const track = await readDeviceAudioTrack(file, playheadSeconds); setSoundTracks(current => [...current, track]); setSelectedAudioId(track.id); setAudioMessage(`${track.name} added at ${playheadSeconds.toFixed(1)}s.`); }
    catch (error) { setAudioMessage(error instanceof Error ? error.message : 'Could not read this audio file.'); }
    finally { setAudioBusy(false); setToolSheet('Audio'); }
  }
  return exportPage ? <main className="min-h-screen bg-[#080a10] px-4 py-8 text-white sm:px-6"><div className="mx-auto max-w-2xl space-y-6 rounded-3xl border border-white/10 bg-[#111521] p-5 sm:p-8"><button type="button" onClick={() => setExportPage(false)} className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-sm font-bold"><ArrowLeft size={16}/> Back to editor</button><div className="text-center">{exportDone ? <CheckCircle2 size={58} className="mx-auto text-emerald-300"/> : <Download size={48} className="mx-auto text-violet-300"/>}<h1 className="mt-4 text-2xl font-black">{exportDone ? 'Export successful' : 'Export project'}</h1><p className="mt-2 text-sm text-slate-400">{exportDone ? 'Your project, original source, timeline assets, script and generated media have been saved to Google Drive.' : exportStage}</p></div><div className="h-3 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-emerald-400 transition-all duration-300" style={{width:`${exportProgress}%`}}/></div><div className="flex justify-between text-xs text-slate-400"><span>{exportDone ? '✓ Saved to Drive' : exportStage}</span><strong>{exportProgress}%</strong></div>{exportDone && <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-sm text-emerald-100">✓ Saved successfully. You can return to History and reopen this project without choosing the source again.</div>}{!driveToken && <div className="space-y-3"><p className="text-sm text-amber-100">Connect Google Drive so WyCut can store the source video and every timeline asset. Without Drive, the project cannot be restored on another session.</p><button type="button" onClick={() => void connectDrive()} className="w-full rounded-xl bg-violet-500 px-4 py-3 font-bold">Connect Google Drive</button></div>}{busy && exportStage.startsWith('Rendering edited MP4') && <button type="button" onClick={() => { cancelEditExport(); setExportStage('Cancelling render and cleaning temporary files…'); }} className="w-full rounded-xl border border-red-400/40 px-4 py-3 font-bold text-red-200">Cancel render</button>}{driveToken && !exportDone && !busy && <button type="button" onClick={() => void exportToDeviceAndDrive()} className="w-full rounded-xl bg-emerald-400 px-4 py-3 font-black text-black">Continue export</button>}{exportDone && driveFolder && <a href={driveFolder} target="_blank" rel="noopener noreferrer" className="block rounded-xl bg-emerald-400 px-4 py-3 text-center font-black text-black">Open saved project in Google Drive</a>}</div></main> : <main className="min-h-screen bg-[#080a10] px-0 pb-28 pt-0 text-white sm:px-6 sm:pt-4">
  {!video && busy && activeKind && activeKind !== 'export' && !confirmCancel && <button type="button" onClick={() => setConfirmCancel(true)} disabled={cancelling} className="fixed left-4 z-40 flex items-center gap-2 rounded-full border border-red-400/40 bg-[#1a0f14] px-4 py-3 text-sm font-bold text-red-200 shadow-lg" style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 1rem)' }}>✕ Cancel</button>}
  {confirmCancel && <div role="dialog" aria-modal="true" aria-labelledby="cancel-title" className="fixed inset-0 z-[60] grid place-items-center bg-black/75 p-5"><div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#111521] p-6 shadow-2xl"><h2 id="cancel-title" className="text-lg font-black">Stop generation?</h2><p className="mt-2 text-sm leading-6 text-slate-300">Stop this task now?</p><p className="mt-2 text-xs leading-5 text-slate-400">{activeKind === 'slice' ? 'Local cutting uses no AI credits.' : 'Eligible generation credits are returned when cancellation is confirmed.'}</p><div className="mt-5 grid grid-cols-2 gap-3"><button type="button" autoFocus onClick={() => setConfirmCancel(false)} className="rounded-xl border border-white/15 px-4 py-3 text-sm font-bold">Keep working</button><button type="button" onClick={() => void cancelRef.current()} className="rounded-xl bg-red-500 px-4 py-3 text-sm font-bold">Stop</button></div></div></div>}
  <div className="mx-auto max-w-7xl">
    <header className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
      <div className="flex items-center gap-3"><Link href="/history" aria-label="Back to projects" className="grid h-10 w-10 place-items-center rounded-xl bg-violet-500/15 text-lg font-black text-violet-300">W</Link><div><h1 className="text-xl font-black sm:text-2xl">WyCut Studio</h1><p className="text-xs text-slate-400">Movie recap editor</p></div></div>
      <div className="flex flex-wrap items-center gap-2">
        <Link href="/login?next=/dashboard" className="max-w-[42vw] truncate rounded-lg border border-violet-400/30 bg-violet-500/10 px-3 py-2 text-xs font-bold text-violet-200">{authEmail || 'Sign in'}</Link>
        <Link href="/billing" className="rounded-lg border border-white/10 px-3 py-2 text-xs font-bold">{freeAccess ? 'Premium access' : `${formatCredits(credits ?? 0)} credits`}</Link>
        <Link href="/history" className="rounded-lg border border-white/10 px-3 py-2 text-xs font-bold">Projects</Link>
      </div>
    </header>

    <div className="mb-4 hidden flex-wrap items-center justify-between gap-3 sm:flex">
      <div><h2 className="text-lg font-bold">Create a recap</h2><p className="text-sm text-slate-400">Upload a video. WyCut transcribes the audio, writes an original recap, and builds a clip timeline.</p></div>
      <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-[#111521] px-3 py-2">
        <Cloud size={17} className={driveToken ? 'text-emerald-300' : 'text-slate-400'}/><span className="text-xs">{driveToken ? 'Drive connected' : 'Drive not connected'}</span>
        <button type="button" onClick={() => void connectDrive()} className="rounded-lg bg-white/10 px-3 py-2 text-xs font-bold text-violet-200">{driveToken ? 'Reconnect' : 'Connect'}</button>
      </div>
    </div>

    {!video && <label onDragOver={e=>{if(!busy)e.preventDefault();}} onDrop={e=>{e.preventDefault(); if(!busy) selectVideo(e.dataTransfer.files?.[0]);}} className="mb-4 flex min-h-44 cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-violet-400/50 bg-[#111521] p-6 text-center hover:bg-violet-500/[.06]">
      <UploadCloud size={34} className="mb-3 text-violet-300"/><span className="text-lg font-bold">Choose a video or image to start editing</span><span className="mt-2 text-sm text-slate-400">MP4, M4V, MOV, PNG, JPG or WebP · processed on this device</span>
      <input disabled={busy} type="file" accept="video/mp4,video/quicktime,.mp4,.m4v,.mov,image/png,image/jpeg,image/webp" onChange={e=>{selectVideo(e.target.files?.[0]); e.currentTarget.value='';}} className="sr-only"/>
    </label>}

    {video && <div className="wycut-editor-workspace fixed inset-0 z-30 flex flex-col bg-[#080a10] text-white" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
      <div className="mx-auto flex h-full min-h-0 w-full max-w-xl flex-col">
        <EditorTopBar onClose={()=>setCloseConfirm(true)} credits={credits} quality={quality} onQuality={setQuality} exportDisabled={busy||(!script&&!roughCut&&!clips.length)} onExport={()=>void exportToDeviceAndDrive()} />
        <PreviewStage ratio={aspectRatio}>
          {isStillImage ? <img src={previewUrl} alt="Image being edited" className="h-full w-full" style={{ objectFit: cropMode==='cover'?'cover':'contain', transform: `${mirrorPreview?'scaleX(-1) ':''}scale(${keyframes.length ? ([...keyframes].sort((a,b)=>a.time-b.time).filter(k=>k.time<=playheadSeconds).slice(-1)[0]?.scale||1) : 1}) rotate(${keyframes.length ? ([...keyframes].sort((a,b)=>a.time-b.time).filter(k=>k.time<=playheadSeconds).slice(-1)[0]?.rotation||0) : 0}deg)`, filter: [previewFilterForPlan({filter:effectPreset}),previewEffectForPlan({effect:visualEffect}),previewAdjustForPlan(adjust)].filter(v=>v&&v!=='none').join(' ')||'none' }} /> : <video ref={previewRef} src={previewUrl} controls={false} playsInline className="h-full w-full" style={{ objectFit: cropMode==='cover'?'cover':'contain', transform: (() => { const sorted = [...keyframes].sort((a,b)=>a.time-b.time); let scale = 1, rotation = 0; if (sorted.length) { const before = [...sorted].reverse().find(k=>k.time<=playheadSeconds) || {time:0,scale:1,rotation:0}; const after = sorted.find(k=>k.time>playheadSeconds); if (after && after.time>before.time) { const f=Math.max(0,Math.min(1,(playheadSeconds-before.time)/(after.time-before.time))); scale=before.scale+(after.scale-before.scale)*f; rotation=before.rotation+(after.rotation-before.rotation)*f; } else { scale=before.scale; rotation=before.rotation; } } return `${mirrorPreview?'scaleX(-1) ':''}scale(${scale}) rotate(${rotation}deg)`; })(), filter: [previewFilterForPlan({filter:effectPreset}),previewEffectForPlan({effect:visualEffect}),previewAdjustForPlan(adjust)].filter(v=>v&&v!=='none').join(' ')||'none' }} onPlay={()=>setPreviewPlaying(true)} onPause={()=>setPreviewPlaying(false)} onEnded={()=>setPreviewPlaying(false)} onTimeUpdate={e=>{setPlayheadSeconds(e.currentTarget.currentTime);}} onLoadedMetadata={e=>{e.currentTarget.playbackRate=Number(playbackRate);e.currentTarget.muted=editorMuted;}} />}
          {adjust.vignette>0 && <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: `radial-gradient(ellipse at center, transparent ${Math.round(75-adjust.vignette*0.45)}%, rgba(0,0,0,${(adjust.vignette/100*0.85).toFixed(2)}) 100%)` }} />}
          {(textOverlay||emojiOverlay||sticker||showWatermark) && <div className={`absolute inset-0 flex flex-col items-center justify-center gap-2 p-3 text-center ${toolSheet === 'Text' ? 'pointer-events-auto touch-none' : 'pointer-events-none'}`} onPointerDown={textPointerDown} onPointerMove={textPointerMove} onPointerUp={textPointerUp} onPointerCancel={textPointerUp} style={{ fontFamily: overlayFont }}>
            <div className="absolute flex max-w-full cursor-move flex-col items-center justify-center gap-2" style={{ left: `${textX}%`, top: `${textY}%`, transform: `translate(-50%, -50%) scale(${textScale}) rotate(${textRotation}deg)` }}>
              {textOverlay && <span className="max-w-full break-words px-2 py-1 text-lg font-black text-white" style={{ textShadow: '0 2px 6px #000', animation: ANIMATION_CSS[textAnimation] ? `${ANIMATION_CSS[textAnimation]} 1.8s ease-in-out infinite` : undefined }}>{textOverlay}</span>}
              {emojiOverlay && <span className="text-5xl">{emojiOverlay}</span>}
              {sticker && <span className="rounded-xl border-2 border-white/80 bg-black/45 px-3 py-1 text-xl font-black text-white shadow-xl">{sticker}</span>}
            </div>
            {showWatermark && <span className="absolute bottom-2 right-3 text-[10px] font-bold text-white/80">WyCut</span>}
          </div>}
        </PreviewStage>
        <PlaybackBar playing={previewPlaying} onPlay={togglePreviewPlay} onFullscreen={()=>{const el=previewRef.current?.parentElement; if(el?.requestFullscreen) void el.requestFullscreen().catch(()=>undefined);}} current={script?sourceToEdited(segments,playheadSeconds):playheadSeconds} duration={script?editedLength(segments):videoSeconds} canUndo={histState.canUndo} canRedo={histState.canRedo} onUndo={undoEdit} onRedo={redoEdit} />
        <Timeline compact={Boolean(toolSheet)} videoRef={previewRef} playing={previewPlaying} duration={videoSeconds} current={playheadSeconds} zoom={timelineZoom} onZoom={setTimelineZoom} onSeek={seekPreview} thumbs={videoThumbs} fps={fps} gaps={gapsOf(segments,videoSeconds)} canCut={Boolean(script)&&!busy&&videoSeconds>0} onTrim={trimClip} onSplit={splitAtPlayhead} onDelete={deleteSelectedClip} onStep={frameStep}
          clips={script?.beats.map(b=>({start:b.startSeconds,end:b.endSeconds,label:b.title}))||[]} selectedClip={selectedClipIndex} onSelectClip={i=>{setSelectedClipIndex(i);}}
          audio={soundTracks.map(t=>({id:t.id,name:t.name,start:t.startSeconds,duration:t.durationSeconds}))} selectedAudio={selectedAudioId} onSelectAudio={id=>{setSelectedAudioId(id);setToolSheet('Audio');}} onAddAudio={f=>void addAudioFromDevice(f)} audioBusy={audioBusy}
          text={textOverlay} onText={()=>setToolSheet('Text')} sticker={sticker||emojiOverlay} onSticker={()=>setToolSheet('Stickers')} onAddMedia={()=>mediaInputRef.current?.click()}
          rail={<TrackRail muted={editorMuted} onMute={()=>setEditorMuted(v=>!v)} onAI={()=>setAiSheetOpen(true)} busy={busy} />} />
        <input ref={mediaInputRef} type="file" accept="video/*,image/*" multiple disabled={busy} onChange={e=>{addTimelineMedia(e.target.files);e.currentTarget.value='';}} className="sr-only" />
        {(busy||notice) && <div className="shrink-0 space-y-1.5 border-t border-white/10 bg-[#111521] px-3 py-2">
          {busy && <div role="status" aria-live="polite"><div className="mb-1 flex items-center justify-between gap-2 text-xs"><span className="min-w-0 truncate">{stage||'Processing…'}</span><span className="flex shrink-0 items-center gap-2"><strong>{progress}%</strong>{activeKind && activeKind!=='export' && !confirmCancel && <button type="button" onClick={()=>setConfirmCancel(true)} disabled={cancelling} className="min-h-8 rounded-lg bg-red-500/20 px-3 font-bold text-red-200">Cancel</button>}</span></div><div className="h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-violet-400 transition-all" style={{width:`${Math.max(5,progress)}%`}}/></div></div>}
          {notice && <p ref={noticeRef} role="alert" className={`flex items-start gap-2 text-xs leading-5 ${/fail|could not|error|expired|sign in|top up|not enough|limit|invalid/i.test(notice)?'text-red-200':'text-emerald-200'}`}><span className="min-w-0 flex-1">{notice}{needsTopUp&&<Link href="/billing" className="ml-2 inline-block rounded-lg bg-white px-2 py-0.5 text-[11px] font-bold text-black">Top up</Link>}</span><button type="button" aria-label="Dismiss message" onClick={()=>setNotice('')} className="grid h-6 w-6 shrink-0 place-items-center text-slate-400">✕</button></p>}
        </div>}
        {toolSheet ? <ToolSheet title={toolSheet} onClose={()=>setToolSheet('')}>
          {toolSheet==='Audio'
            ? <SoundLibrary tracks={soundTracks} onChange={setSoundTracks} onAdd={f=>void addAudioFromDevice(f)} selectedId={selectedAudioId} onSelect={setSelectedAudioId} maxStart={Math.max(1,videoSeconds)} disabled={busy||audioBusy} message={audioMessage} />
            : <AdvancedEditorTools section={toolSheet==='Text'?'text':toolSheet==='Stickers'?'stickers':toolSheet==='Effects'?'effects':toolSheet==='Filters'?'filters':toolSheet==='Canvas'?'canvas':toolSheet==='Adjust'?'adjust':toolSheet==='Beat'?'beat':toolSheet==='Keyframe'?'keyframe':toolSheet==='Speed'?'speed':toolSheet==='In/Out'?'inout':toolSheet==='Combo'?'combo':toolSheet==='Overlay'?'overlay':toolSheet==='Captions'?'captions':toolSheet==='Voice'?'voice':'edit'} onSplitAtPlayhead={splitAtPlayhead} onFrameStep={frameStep} fps={fps} videoDuration={videoSeconds} adjust={adjust} onAdjustChange={setAdjust} clipVolume={clipVolume} onClipVolumeChange={setClipVolume} fadeIn={fadeIn} onFadeInChange={setFadeIn} fadeOut={fadeOut} onFadeOutChange={setFadeOut} script={script} onScriptChange={setScript} selected={selectedClipIndex} onSelect={setSelectedClipIndex} watermark={showWatermark} onWatermarkChange={setShowWatermark} mirror={mirrorPreview} onMirrorChange={setMirrorPreview} crop={cropMode} onCropChange={setCropMode} textOverlay={textOverlay} onTextOverlayChange={setTextOverlay} textPosition={textPosition} onTextPositionChange={v=>{setTextPosition(v);setTextY(v==='top'?15:v==='bottom'?85:50);}} textX={textX} onTextXChange={setTextX} textY={textY} onTextYChange={setTextY} textScale={textScale} onTextScaleChange={setTextScale} textRotation={textRotation} onTextRotationChange={setTextRotation} emoji={emojiOverlay} onEmojiChange={setEmojiOverlay} font={overlayFont} onFontChange={setOverlayFont} aspectRatio={aspectRatio} onAspectRatioChange={setAspectRatio} applyAspectRatio={applyAspectRatio} onApplyAspectRatioChange={setApplyAspectRatio} playbackRate={playbackRate} onPlaybackRateChange={setPlaybackRate} thumb={videoThumbs[0]} effectPreset={effectPreset} onEffectPresetChange={setEffectPreset} visualEffect={visualEffect} onVisualEffectChange={setVisualEffect} animation={textAnimation} onAnimationChange={setTextAnimation} transition={transition} onTransitionChange={setTransition} sticker={sticker} onStickerChange={setSticker} playheadSeconds={playheadSeconds} beatMarkers={beatMarkers} onBeatMarkersChange={setBeatMarkers} keyframes={keyframes} onKeyframesChange={setKeyframes} onDownloadCaptions={downloadCaptions} disabled={busy} />}
        </ToolSheet> : <ToolBar active={toolSheet as import('@/components/editor-v42-layout').EditorToolName || ''} onSelect={t=>{setEditorTab(t as typeof editorTab);setToolSheet(t);}} />}
      </div>
    </div>}
    {durationPromptOpen && <div role="dialog" aria-modal="true" aria-labelledby="target-duration-title" className="fixed inset-0 z-[80] grid place-items-center bg-black/80 p-4"><section className="w-full max-w-md rounded-3xl border border-violet-400/30 bg-[#111521] p-5 shadow-2xl sm:p-6"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-widest text-violet-300">AI recap cut</p><h2 id="target-duration-title" className="mt-1 text-xl font-black">How long should the finished recap be?</h2></div><button type="button" aria-label="Close duration prompt" onClick={()=>setDurationPromptOpen(false)} className="grid h-9 w-9 place-items-center rounded-xl bg-white/5"><X size={18}/></button></div><p className="mt-2 text-sm leading-6 text-slate-300">Choose the target runtime. WyCut will ask AI to select timestamped scenes whose combined duration is as close as possible to your target, then you can cut them locally.</p><label className="mt-4 block text-sm font-semibold">Desired duration (minutes)<input autoFocus type="number" inputMode="numeric" min={1} max={60} step={1} value={targetMinutes} onChange={e=>setTargetMinutes(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){const n=Number(targetMinutes);if(n>=1&&n<=60){setDurationPromptOpen(false);void generateScript(n);}}}} className="mt-2 h-14 w-full rounded-xl border border-white/15 bg-black/30 px-4 text-lg font-bold text-white outline-none focus:border-violet-400"/><span className="mt-1 block text-xs text-slate-400">1–60 minutes. Scene boundaries follow source subtitles when timestamps are available; exact duration cannot be guaranteed to the second.</span></label><div className="mt-5 grid grid-cols-2 gap-2"><button type="button" onClick={()=>setDurationPromptOpen(false)} className="min-h-12 rounded-xl border border-white/15 px-4 text-sm font-bold">Cancel</button><button type="button" onClick={()=>{const n=Number(targetMinutes);if(!Number.isFinite(n)||n<1||n>60){setNotice('Enter a target duration from 1 to 60 whole minutes.');return;}setDurationPromptOpen(false);void generateScript(n);}} className="min-h-12 rounded-xl bg-violet-500 px-4 text-sm font-black">Generate for {Math.max(1,Math.min(60,Math.floor(Number(targetMinutes)||5)))} min</button></div></section></div>}
    <AIQuickSheet open={Boolean(video)&&aiSheetOpen} onClose={()=>setAiSheetOpen(false)}>
      <div className="space-y-4">
        <div className="grid gap-2">
          <button type="button" disabled={busy} onClick={()=>{setAiSheetOpen(false);setDurationPromptOpen(true);}} className="min-h-14 rounded-xl bg-violet-500 px-4 text-left text-sm font-black text-white disabled:opacity-40">{script&&!script.manual?'Regenerate recap clips':'Cutting AI · choose duration'}<span className="block text-[11px] font-normal text-violet-100">First choose the desired finished recap length (1–60 minutes). AI plans the scenes and timestamps for that target.</span></button>
          <button type="button" disabled={busy||!script} onClick={()=>{setAiSheetOpen(false);void sliceVideoLocallyAction();}} className="min-h-14 rounded-xl border border-violet-400/30 bg-violet-500/10 px-4 text-left text-sm font-bold disabled:opacity-40"><Scissors size={15} className="mr-2 inline"/>{clips.length?'Re-cut clips on this device':'Cut clips on this device (free)'}</button>
          {roughCut && <button type="button" onClick={()=>void downloadFile(roughCut,`${safeName(title)}_recap.mp4`)} className="min-h-14 rounded-xl bg-emerald-400 px-4 text-left text-sm font-black text-black"><Download size={15} className="mr-2 inline"/>Save rough-cut MP4</button>}
          {roughCut && soundTracks.length>0 && <button type="button" disabled={busy} onClick={()=>{setAiSheetOpen(false);void mixSoundsIntoRoughCut();}} className="min-h-14 rounded-xl border border-violet-400/30 bg-violet-500/10 px-4 text-left text-sm font-bold disabled:opacity-40"><Music2 size={15} className="mr-2 inline"/>Mix {soundTracks.length} audio layer{soundTracks.length===1?'':'s'} into the video</button>}
          <div className="grid grid-cols-2 gap-2"><button type="button" disabled={busy||!script} onClick={()=>void downloadRecapScript('txt')} className="min-h-12 rounded-xl border border-white/10 px-3 text-sm font-bold disabled:opacity-40"><Download size={14} className="mr-1 inline"/>Script .txt</button><button type="button" disabled={busy||!script} onClick={()=>void downloadRecapScript('json')} className="min-h-12 rounded-xl border border-white/10 px-3 text-sm font-bold disabled:opacity-40"><Download size={14} className="mr-1 inline"/>Timeline JSON</button></div>
        </div>
        <div className="space-y-2 border-t border-white/10 pt-3">
          <label className="block text-xs font-semibold text-slate-400">Project name<input value={title} onChange={e=>setTitle(e.target.value)} maxLength={120} placeholder="Enter movie or project title" className="mt-1.5 h-12 w-full rounded-xl border border-white/10 bg-black/20 px-3 text-sm text-white outline-none focus:border-violet-400"/></label>
          <label className="flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-white/20 px-4 text-sm font-bold"><UploadCloud size={17}/>Replace video<input type="file" accept="video/mp4,video/quicktime,.mp4,.m4v,.mov" disabled={busy} onChange={e=>{selectVideo(e.target.files?.[0]);e.currentTarget.value='';setAiSheetOpen(false);}} className="sr-only"/></label>
          <label className="flex items-start gap-2 text-xs leading-5 text-slate-300"><input type="checkbox" checked={fastCut} disabled={busy} onChange={e=>setFastCut(e.target.checked)} className="mt-1 accent-violet-400"/><span><strong>Fast cut</strong> <span className="text-slate-500">Copies the video without re-encoding. Quicker, but a clip can start up to a couple of seconds early. Leave off for exact, frame-accurate cuts.</span></span></label>
          <div className="grid grid-cols-2 gap-2"><button type="button" onClick={()=>void connectDrive()} className="min-h-12 rounded-xl border border-white/10 px-3 text-sm font-bold"><Cloud size={14} className={`mr-1 inline ${driveToken?'text-emerald-300':''}`}/>{driveToken?'Reconnect Drive':'Connect Drive'}</button>{driveFolder?<button type="button" onClick={()=>void openDriveFolder()} className="min-h-12 rounded-xl border border-white/10 px-3 text-sm font-bold text-emerald-300">Open Drive folder</button>:<span/>}</div>
        </div>
        {timelineAssets.length>0 && <div className="space-y-1.5 border-t border-white/10 pt-3"><p className="text-xs font-semibold text-slate-400">Added media</p>{timelineAssets.map((asset,i)=><div key={`${asset.name}-${i}`} className="flex items-center gap-2 rounded-xl bg-black/20 p-2"><span className="grid h-8 w-8 place-items-center rounded-lg bg-violet-500/15 text-violet-200">{asset.type.startsWith('image/')?<ImageIcon size={16}/>:<Film size={16}/>}</span><span className="min-w-0 flex-1 truncate text-xs">{asset.name}</span><button type="button" disabled={busy} onClick={()=>setTimelineAssets(current=>current.filter((_,j)=>j!==i))} aria-label={`Remove ${asset.name}`} className="grid h-9 w-9 place-items-center text-red-300">×</button></div>)}</div>}
        {clips.length>0 && <div className="space-y-1.5 border-t border-white/10 pt-3"><p className="text-xs font-semibold text-slate-400">Cut clips</p>{clips.map((clip,i)=><div key={clip.filename} className="flex items-center justify-between gap-2 rounded-xl bg-black/20 p-2"><span className="min-w-0 truncate text-xs text-slate-300">{i+1}. {(clip.size/1024/1024).toFixed(1)} MB</span><button type="button" onClick={()=>void downloadFile(clip.blob,clip.filename)} className="min-h-9 rounded-lg bg-white/10 px-3 text-xs">Save clip</button></div>)}</div>}
      </div>
    </AIQuickSheet>
    {exportChoiceOpen && isStillImage && <div className="fixed inset-0 z-[95] grid place-items-center bg-black/75 p-5"><section role="dialog" aria-modal="true" aria-label="Choose image export format" className="w-full max-w-sm space-y-3 rounded-2xl border border-white/10 bg-[#111521] p-5"><h3 className="text-lg font-black">Export your image</h3><p className="text-sm text-slate-400">Choose the output type. Export as image saves one edited PNG; export as video creates a 5-second MP4 using your selected canvas, filter and text settings.</p><button type="button" disabled={busy} onClick={()=>{setExportChoiceOpen(false);void exportToDeviceAndDrive('image');}} className="w-full rounded-xl bg-violet-500 px-4 py-3 font-black">Export as image (PNG)</button><button type="button" disabled={busy} onClick={()=>{setExportChoiceOpen(false);void exportToDeviceAndDrive('video');}} className="w-full rounded-xl bg-emerald-400 px-4 py-3 font-black text-black">Export as video (5-second MP4)</button><button type="button" onClick={()=>setExportChoiceOpen(false)} className="w-full rounded-xl border border-white/10 px-4 py-3 font-bold">Cancel</button></section></div>}
    {closeConfirm && <div className="fixed inset-0 z-[70] grid place-items-center bg-black/70 p-5"><section className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#111521] p-5"><h3 className="text-lg font-bold">Close editor?</h3><p className="mt-2 text-sm text-slate-400">Your project checkpoints are retained. You can stay here or close the current source.</p><div className="mt-4 flex gap-2"><button onClick={()=>setCloseConfirm(false)} className="min-h-11 flex-1 rounded-xl border border-white/10">Keep editing</button><button onClick={()=>{setCloseConfirm(false);setVideo(null);setFile(null);clearGeneratedOutputs();setNotice('');}} className="min-h-11 flex-1 rounded-xl bg-violet-500 font-bold">Close editor</button></div></section></div>}
  </div>
</main>;
  async function sliceVideoLocallyAction() { await sliceVideo(); }
}

