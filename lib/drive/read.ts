/** Reads a finished production kit straight from the user's Google Drive. Nothing is copied into local storage. */
const DRIVE_API = 'https://www.googleapis.com/drive/v3/files';
export type DriveItem = { id: string; name: string; mimeType: string; size: number; webViewLink?: string; thumbnailLink?: string; modifiedTime?: string };
export type DriveKit = { videos: DriveItem[]; voices: DriveItem[]; master: DriveItem[] };
export class DriveReadError extends Error { constructor(message: string, readonly kind: 'auth' | 'missing' | 'other') { super(message); } }

async function driveJson<T>(url: string, token: string): Promise<T> {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
  if (response.status === 401) throw new DriveReadError('Google Drive access expired. Reconnect Drive to view this project.', 'auth');
  if (response.status === 404) throw new DriveReadError('This kit was not found in your Google Drive (it may have been moved or deleted).', 'missing');
  if (!response.ok) throw new DriveReadError(`Google Drive returned HTTP ${response.status}.`, 'other');
  return await response.json() as T;
}
async function listChildren(parentId: string, token: string): Promise<DriveItem[]> {
  const items: DriveItem[] = []; let pageToken = '';
  do {
    const q = encodeURIComponent(`'${parentId}' in parents and trashed=false`);
    const url = `${DRIVE_API}?q=${q}&pageSize=200&orderBy=name&fields=nextPageToken,files(id,name,mimeType,size,webViewLink,thumbnailLink)${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`;
    const data = await driveJson<{ files?: Array<Omit<DriveItem, 'size'> & { size?: string }>; nextPageToken?: string }>(url, token);
    for (const f of data.files || []) items.push({ ...f, size: Number(f.size || 0) });
    pageToken = data.nextPageToken || '';
  } while (pageToken);
  return items;
}

/** Lists only WyCut project folders created in the connected user's Drive. */
export async function listWyCutProjectFolders(token: string): Promise<Array<{ id: string; name: string; webViewLink?: string; modifiedTime?: string }>> {
  if (!token) throw new DriveReadError('Connect Google Drive to view your project history.', 'auth');
  const q = encodeURIComponent("trashed=false and mimeType='application/vnd.google-apps.folder' and name contains 'WyCut_'");
  const url = `${DRIVE_API}?q=${q}&pageSize=100&orderBy=modifiedTime%20desc&fields=nextPageToken,files(id,name,webViewLink,modifiedTime,mimeType)`;
  const data = await driveJson<{ files?: Array<{ id: string; name: string; webViewLink?: string; modifiedTime?: string; mimeType?: string }> }>(url, token);
  return (data.files || []).filter(f => f.id && f.name.startsWith('WyCut_'));
}

export async function deleteDriveFile(token: string, fileId: string): Promise<void> {
  if (!token || !fileId) throw new DriveReadError('Reconnect Google Drive before deleting a project.', 'auth');
  const meta = await driveJson<{ mimeType?: string; trashed?: boolean }>(`${DRIVE_API}/${encodeURIComponent(fileId)}?fields=id,mimeType,trashed`, token);
  if (meta.trashed) return;
  if (meta.mimeType === 'application/vnd.google-apps.folder') {
    const children = await listChildren(fileId, token);
    // Delete children before the folder so its exports do not become orphaned in the user's Drive.
    for (const child of children) await deleteDriveFile(token, child.id);
  }
  const response = await fetch(`${DRIVE_API}/${encodeURIComponent(fileId)}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
  if (response.status === 401) throw new DriveReadError('Google Drive access expired. Reconnect Drive and try again.', 'auth');
  if (response.status !== 204 && !response.ok) throw new DriveReadError(`Could not delete this project from Drive (HTTP ${response.status}).`, 'other');
}

export async function loadProductionKit(token: string, rootFolderId: string): Promise<DriveKit> {
  const meta = await driveJson<{ trashed?: boolean }>(`${DRIVE_API}/${encodeURIComponent(rootFolderId)}?fields=id,trashed`, token);
  if (meta.trashed) throw new DriveReadError('This kit is in your Google Drive trash.', 'missing');
  const children = await listChildren(rootFolderId, token);
  const folder = (name: string) => children.find(c => c.mimeType === 'application/vnd.google-apps.folder' && c.name === name);
  const [video, voice, master] = [folder('01_Video_Clips'), folder('02_Voiceover_Segments'), folder('03_Master_Tracks')];
  const [videos, voices, masters] = await Promise.all([video ? listChildren(video.id, token) : [], voice ? listChildren(voice.id, token) : [], master ? listChildren(master.id, token) : []]);
  return { videos, voices, master: masters };
}
export async function fetchDriveBlob(token: string, fileId: string, signal?: AbortSignal): Promise<Blob> {
  const response = await fetch(`${DRIVE_API}/${encodeURIComponent(fileId)}?alt=media`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal });
  if (response.status === 401) throw new DriveReadError('Google Drive access expired. Reconnect Drive and try again.', 'auth');
  if (!response.ok) throw new DriveReadError(`Could not read this file from Drive (HTTP ${response.status}).`, 'other');
  return await response.blob();
}
export async function fetchDriveText(token: string, fileId: string): Promise<string> { return (await fetchDriveBlob(token, fileId)).text(); }
