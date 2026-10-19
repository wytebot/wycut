/** Tiny bridge between the history page and the studio, which stays mounted while the user moves around the app. */
const OPEN_KEY = 'wycut_open_project';
export const OPEN_PROJECT_EVENT = 'wycut:open-project';
export const CONNECT_DRIVE_EVENT = 'wycut:connect-drive';
export const DRIVE_TOKEN_EVENT = 'wycut:drive-token';
export function requestOpenProject(id: string) { try { sessionStorage.setItem(OPEN_KEY, id); window.dispatchEvent(new Event(OPEN_PROJECT_EVENT)); } catch { /* ignore */ } }
export function takePendingProject(): string { try { const id = sessionStorage.getItem(OPEN_KEY) || ''; if (id) sessionStorage.removeItem(OPEN_KEY); return id; } catch { return ''; } }
export function requestDriveConnect() { try { window.dispatchEvent(new Event(CONNECT_DRIVE_EVENT)); } catch { /* ignore */ } }
export function readDriveToken(): string {
  try { const token = localStorage.getItem('wycut_drive_access_token') || ''; const expires = Number(localStorage.getItem('wycut_drive_access_token_expiry') || 0); return token && expires > Date.now() ? token : ''; } catch { return ''; }
}
