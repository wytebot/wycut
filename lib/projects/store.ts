/**
 * Local project history (IndexedDB). Holds only what is needed to resume work after the app is closed:
 * progress, the transcript, the script and narration parts. Finished kits live in the user's Google Drive and are read
 * from there for display, so once a project is exported its heavy local data is dropped.
 */
import type { RecapScript } from '@/lib/ai/script-generator';

export type ProjectStatus = 'running' | 'idle' | 'failed' | 'exported';
export type DriveKitRef = { folderId: string; folderUrl: string; exportedAt: number; fileCount: number };
export type ProjectRecord = {
  id: string; title: string; mode: 'url' | 'file' | 'subtitles'; status: ProjectStatus;
  createdAt: number; updatedAt: number; stage?: string; progress?: number; error?: string;
  sourceName?: string; sourceSize?: number; videoUrl?: string; subtitleUrl?: string;
  transcript?: string; script?: RecapScript; recapId?: string; hasSourceTimecodes?: boolean;
  narrationReady?: boolean; narrationParts?: number; clipCount?: number; roughCut?: boolean;
  drive?: DriveKitRef;
};
export type NarrationPart = { id: string; text: string; audioBase64: string };
type Patch = { [K in keyof Omit<ProjectRecord, 'id'>]?: ProjectRecord[K] | null };

const DB_NAME = 'wycut-projects'; const DB_VERSION = 2;
/** Projects whose job is running in THIS session. A "running" record that is not in this set was interrupted (app closed/killed). */
export const liveProjects = new Set<string>();
export const PROJECTS_CHANGED = 'wycut:projects-changed';
export const PROJECT_STORAGE_ERROR = 'wycut:project-storage-error';
function storageError(operation: string, error: unknown) {
  try { window.dispatchEvent(new CustomEvent(PROJECT_STORAGE_ERROR, { detail: { operation, message: error instanceof Error ? error.message : 'Device storage failed.' } })); } catch { /* server rendering */ }
}

let dbPromise: Promise<IDBDatabase> | null = null;
function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('Local storage is unavailable.'));
  if (!dbPromise) dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('projects')) db.createObjectStore('projects', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('narration')) db.createObjectStore('narration', { keyPath: 'key' });
      if (!db.objectStoreNames.contains('chunks')) db.createObjectStore('chunks', { keyPath: 'key' });
      if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings', { keyPath: 'key' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => { dbPromise = null; reject(request.error || new Error('Could not open local storage.')); };
  });
  return dbPromise;
}
function tx<T>(storeName: string, mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  return openDb().then(db => new Promise<T | undefined>((resolve, reject) => {
    const transaction = db.transaction(storeName, mode); const request = run(transaction.objectStore(storeName));
    transaction.oncomplete = () => resolve(request ? request.result : undefined);
    transaction.onerror = () => reject(transaction.error); transaction.onabort = () => reject(transaction.error);
  }));
}
const notify = () => { try { window.dispatchEvent(new Event(PROJECTS_CHANGED)); } catch { /* not in a browser */ } };

// Saves are applied one after another so overlapping progress updates can never overwrite each other.
let queue: Promise<unknown> = Promise.resolve();
function enqueue<T>(job: () => Promise<T>): Promise<T> { const run = queue.then(job, job); queue = run.then(() => undefined, () => undefined); return run; }

export function newProjectId(): string { return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `p-${Date.now()}-${Math.random().toString(36).slice(2)}`; }

export function saveProject(id: string, patch: Patch): Promise<void> {
  return enqueue(async () => {
    try {
      const previous = await tx<ProjectRecord>('projects', 'readonly', s => s.get(id));
      const next: Record<string, unknown> = { title: 'Untitled project', mode: 'subtitles', status: 'idle', createdAt: Date.now(), ...(previous || {}) };
      for (const [key, value] of Object.entries(patch)) { if (value === null) delete next[key]; else if (value !== undefined) next[key] = value; }
      next.id = id; next.updatedAt = Date.now();
      await tx('projects', 'readwrite', s => s.put(next));
      notify();
    } catch (error) { storageError('save-project', error); /* do not break the generation pipeline, but surface the storage failure to the UI */ }
  });
}
export async function getProject(id: string): Promise<ProjectRecord | null> { try { return (await tx<ProjectRecord>('projects', 'readonly', s => s.get(id))) || null; } catch { return null; } }
export async function listProjects(): Promise<ProjectRecord[]> {
  try { const all = (await tx<ProjectRecord[]>('projects', 'readonly', s => s.getAll())) || []; return all.sort((a, b) => b.updatedAt - a.updatedAt); } catch { return []; }
}
export function deleteProject(id: string): Promise<void> {
  return enqueue(async () => {
    try {
      await tx('projects', 'readwrite', s => s.delete(id));
      await deleteNarrationParts(id);
      liveProjects.delete(id); notify();
    } catch { /* ignore */ }
  });
}

// ---- narration parts (paid audio, kept so a restart never pays for the same narration twice) ----
export async function putNarrationPart(projectId: string, key: string, part: NarrationPart): Promise<void> {
  try { await tx('narration', 'readwrite', s => s.put({ key: `${projectId}|${key}`, projectId, originalKey: key, ...part })); } catch { /* best effort */ }
}
export async function getNarrationParts(projectId: string): Promise<Map<string, NarrationPart>> {
  const result = new Map<string, NarrationPart>();
  try {
    const all = (await tx<Array<{ key: string; originalKey: string; id: string; text: string; audioBase64: string }>>('narration', 'readonly', s => s.getAll())) || [];
    for (const row of all) if (row.key.startsWith(`${projectId}|`)) result.set(row.originalKey, { id: row.id, text: row.text, audioBase64: row.audioBase64 });
  } catch { /* ignore */ }
  return result;
}
export async function deleteNarrationParts(projectId: string): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve) => {
      const transaction = db.transaction('narration', 'readwrite'); const store = transaction.objectStore('narration');
      const cursorRequest = store.openCursor();
      cursorRequest.onsuccess = () => { const cursor = cursorRequest.result; if (!cursor) return; if (String((cursor.value as { key: string }).key).startsWith(`${projectId}|`)) cursor.delete(); cursor.continue(); };
      transaction.oncomplete = () => resolve(); transaction.onerror = () => resolve(); transaction.onabort = () => resolve();
    });
  } catch { /* ignore */ }
}

// ---- paid transcription chunks (keyed by video name/size/date + chunk index) ----
export async function getChunk<T>(key: string): Promise<T | null> { try { const row = await tx<{ key: string; value: T }>('chunks', 'readonly', s => s.get(key)); return row ? row.value : null; } catch { return null; } }
export async function putChunk<T>(key: string, value: T): Promise<void> {
  try {
    await tx('chunks', 'readwrite', s => s.put({ key, value, savedAt: Date.now() }));
    // Transcription cache is disposable: retain at most 500 entries and 14 days to prevent unbounded device-storage growth.
    const all = (await tx<Array<{ key: string; savedAt?: number }>>('chunks', 'readonly', s => s.getAll())) || [];
    const cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000;
    const stale = all.filter(row => !row.savedAt || row.savedAt < cutoff).map(row => row.key);
    const survivors = all.filter(row => row.savedAt && row.savedAt >= cutoff).sort((a, b) => Number(b.savedAt) - Number(a.savedAt));
    const excess = survivors.slice(500).map(row => row.key);
    await deleteChunkKeys([...new Set([...stale, ...excess])]);
  } catch (error) { storageError('save-transcription-cache', error); }
}

export async function deleteChunksByPrefix(prefix: string): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve) => {
      const transaction = db.transaction('chunks', 'readwrite'); const store = transaction.objectStore('chunks'); const request = store.openCursor();
      request.onsuccess = () => { const cursor = request.result; if (!cursor) return; if (String((cursor.value as { key: string }).key).startsWith(prefix)) cursor.delete(); cursor.continue(); };
      transaction.oncomplete = () => resolve(); transaction.onerror = () => resolve(); transaction.onabort = () => resolve();
    });
  } catch { /* ignore */ }
}
export async function deleteNarrationKeys(projectId: string, keys: string[]): Promise<void> {
  for (const key of keys) { try { await tx('narration', 'readwrite', s => s.delete(`${projectId}|${key}`)); } catch { /* ignore */ } }
}
export async function deleteChunkKeys(keys: string[]): Promise<void> { for (const key of keys) { try { await tx('chunks', 'readwrite', s => s.delete(key)); } catch { /* ignore */ } } }


// General app settings and locally owned asset entitlements live in IndexedDB, not localStorage.
export async function getLocalSetting<T>(key: string): Promise<T | null> {
  try { const row = await tx<{ key: string; value: T }>('settings', 'readonly', s => s.get(key)); return row ? row.value : null; } catch { return null; }
}
export async function setLocalSetting<T>(key: string, value: T): Promise<void> {
  try { await tx('settings', 'readwrite', s => s.put({ key, value, updatedAt: Date.now() })); } catch { /* optional local setting */ }
}
