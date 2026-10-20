import { Capacitor, registerPlugin } from '@capacitor/core';

/** Android foreground service (see scripts/native/*). Keeps the app process running and shows a notification while a job runs. */
type WyCutBackgroundPlugin = { start(options: { title: string; text: string }): Promise<void>; update(options: { text: string }): Promise<void>; stop(): Promise<void> };
const native: WyCutBackgroundPlugin | null = typeof window !== 'undefined' && Capacitor.isNativePlatform() ? registerPlugin<WyCutBackgroundPlugin>('WyCutBackground') : null;

export async function backgroundStart(title: string, text: string) { try { await native?.start({ title, text }); } catch { /* plugin missing or notification blocked: the job still runs */ } }
export async function backgroundUpdate(text: string) { try { await native?.update({ text }); } catch { /* ignore */ } }
export async function backgroundStop() { try { await native?.stop(); } catch { /* ignore */ } }
