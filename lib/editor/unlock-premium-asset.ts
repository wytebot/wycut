'use client';
import { getAuthToken } from '@/lib/auth/get-auth-token';

export type PremiumAssetCategory = 'font' | 'animation' | 'sound' | 'filter' | 'effect' | 'transition' | 'sticker';
export async function unlockPremiumEditorAsset(category: PremiumAssetCategory, asset: string): Promise<{ credits: number; alreadyOwned: boolean }> {
  const fallback = typeof window !== 'undefined' ? localStorage.getItem('wycut_google_id_token') || sessionStorage.getItem('wycut_google_id_token') || '' : '';
  const idToken = await getAuthToken(fallback);
  const response = await fetch('/api/editor/assets/unlock', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken, category, asset }), cache: 'no-store' });
  const data = await response.json().catch(() => ({})) as { credits?: number; alreadyOwned?: boolean; error?: string; required?: number; balance?: number };
  if (!response.ok) throw new Error(data.error || 'Could not unlock this premium asset.');
  return { credits: Number(data.credits || 0), alreadyOwned: Boolean(data.alreadyOwned) };
}
