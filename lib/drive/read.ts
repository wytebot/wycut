/** Reads a finished production kit straight from the user's Google Drive. Nothing is copied into local storage. */
const DRIVE_API = 'https://www.googleapis.com/drive/v3/files';
export type DriveItem = { id: string; name: string; mimeType: string; size: number; webViewLink?: string; thumbnailLink?: string };
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
