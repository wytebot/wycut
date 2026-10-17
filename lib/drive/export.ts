export type DriveExportFile = { name: string; mimeType?: string; body: Blob | Uint8Array | string; folder: 'video' | 'voiceover' | 'master' };
export type DriveExportResult = { folderId: string; folderUrl: string; uploaded: Array<{ name: string; id: string; webViewLink?: string }> };
const DRIVE_API = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3/files';
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const MAX_FILE_COUNT = 250;
const MAX_SINGLE_FILE_BYTES = 5 * 1024 * 1024 * 1024;

async function fetchWithTimeout(url: string, init: RequestInit, ms: number, label: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try { return await fetch(url, { ...init, signal: controller.signal }); }
  catch (error) { if (controller.signal.aborted) throw new Error(`${label} timed out. Check your connection and reconnect Google Drive if needed.`); throw error; }
  finally { clearTimeout(timer); }
}
async function driveRequest<T>(url: string, token: string, init: RequestInit = {}, attempts = 3): Promise<{ data: T; response: Response }> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const response = await fetchWithTimeout(url, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.headers || {}) }, cache: 'no-store' }, 120_000, 'Google Drive request');
      if (response.ok) return { data: await response.json() as T, response };
      const detail = (await response.text().catch(() => '')).slice(0, 500);
      if (response.status === 401) throw new Error('Google Drive access token expired or was revoked. Reconnect Google Drive and retry the export.');
      if (![408, 429, 500, 502, 503, 504].includes(response.status) || attempt === attempts - 1) {
        throw new Error(`Google Drive API ${response.status}: ${detail || response.statusText}`);
      }
      lastError = new Error(`Google Drive API ${response.status}: ${detail || response.statusText}`);
    } catch (error) {
      lastError = error;
      if (error instanceof Error && /token expired/i.test(error.message)) throw error;
      if (attempt === attempts - 1) throw error;
    }
    await new Promise(resolve => setTimeout(resolve, 500 * 2 ** attempt));
  }
  throw lastError instanceof Error ? lastError : new Error('Google Drive request failed.');
}
async function createFolder(name: string, token: string, parentId?: string): Promise<{ id: string; webViewLink?: string }> {
  const { data } = await driveRequest<{ id: string; webViewLink?: string }>(`${DRIVE_API}?fields=id,webViewLink`, token, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: FOLDER_MIME, ...(parentId ? { parents: [parentId] } : {}) }),
  });
  if (!data.id) throw new Error(`Google Drive did not return an ID for folder ${name}.`);
  return data;
}
function bodyBlob(body: DriveExportFile['body'], mimeType: string): Blob {
  if (body instanceof Blob) return body;
  if (typeof body === 'string') return new Blob([body], { type: mimeType });
  return new Blob([new Uint8Array(body)], { type: mimeType });
}
async function uploadFile(file: DriveExportFile, parentId: string, token: string): Promise<{ id: string; name: string; webViewLink?: string }> {
  const mimeType = file.mimeType || (file.name.endsWith('.mp4') ? 'video/mp4' : file.name.endsWith('.mp3') ? 'audio/mpeg' : 'text/plain');
  const name = file.name.replace(/[\\/\u0000-\u001f]/g, '_').slice(0, 180);
  if (!name) throw new Error('A Drive export file is missing a valid filename.');
  const blob = bodyBlob(file.body, mimeType);
  if (blob.size > MAX_SINGLE_FILE_BYTES) throw new Error(`${name} exceeds the 5 GB per-file export safety limit.`);
  const metadata = { name, mimeType, parents: [parentId] };
  // Resumable upload handles large video files far more reliably than multipart requests.
  const start = await fetchWithTimeout(`${UPLOAD_API}?uploadType=resumable&fields=id,name,webViewLink`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': mimeType, 'X-Upload-Content-Length': String(blob.size) },
    body: JSON.stringify(metadata), cache: 'no-store',
  }, 60_000, `Starting upload for ${name}`);
  if (start.status === 401) throw new Error('Google Drive access token expired or was revoked. Reconnect Google Drive and retry the export.');
  if (!start.ok) throw new Error(`Could not start Drive upload for ${name} (HTTP ${start.status}).`);
  const uploadUrl = start.headers.get('location');
  if (!uploadUrl || !uploadUrl.startsWith('https://www.googleapis.com/')) throw new Error('Google Drive did not return a valid resumable upload URL.');
  const result = await fetchWithTimeout(uploadUrl, { method: 'PUT', headers: { 'Content-Type': mimeType, 'Content-Range': `bytes 0-${blob.size - 1}/${blob.size}` }, body: blob, cache: 'no-store' }, 10 * 60_000, `Uploading ${name}`);
  if (result.status === 401) throw new Error('Google Drive access token expired or was revoked. Reconnect Google Drive and retry the export.');
  if (!result.ok) {
    const detail = (await result.text().catch(() => '')).slice(0, 300);
    throw new Error(`Drive upload failed for ${name} (HTTP ${result.status}): ${detail || result.statusText}`);
  }
  const item = await result.json() as { id?: string; name?: string; webViewLink?: string };
  if (!item.id) throw new Error(`Google Drive upload for ${name} finished without a file ID.`);
  return { id: item.id, name: item.name || name, webViewLink: item.webViewLink };
}
/** Browser-direct BYOS upload: file bytes go from the user's browser to Google Drive, not through WyCut's server. */
export async function exportProductionKit(accessToken: string, movieName: string, files: DriveExportFile[]): Promise<DriveExportResult> {
  if (!accessToken || accessToken.length < 20) throw new Error('A valid Google OAuth access token is required.');
  if (!files.length || files.length > MAX_FILE_COUNT) throw new Error(`Provide between 1 and ${MAX_FILE_COUNT} export files.`);
  const cleanTitle = movieName.normalize('NFKD').replace(/[^a-zA-Z0-9 _-]/g, '').trim().replace(/\s+/g, '_').slice(0, 70) || 'Movie';
  const root = await createFolder(`WyCut_${cleanTitle}_10Min_Kit`, accessToken);
  const folderIds = {
    video: (await createFolder('01_Video_Clips', accessToken, root.id)).id,
    voiceover: (await createFolder('02_Voiceover_Segments', accessToken, root.id)).id,
    master: (await createFolder('03_Master_Tracks', accessToken, root.id)).id,
  };
  const uploaded: DriveExportResult['uploaded'] = [];
  // Sequential upload avoids several simultaneous video blobs exhausting mobile memory.
  for (let i = 0; i < files.length; i++) {
    const item = await uploadFile(files[i], folderIds[files[i].folder], accessToken);
    uploaded.push({ name: item.name, id: item.id, webViewLink: item.webViewLink });
  }
  return { folderId: root.id, folderUrl: root.webViewLink || `https://drive.google.com/drive/folders/${root.id}`, uploaded };
}
