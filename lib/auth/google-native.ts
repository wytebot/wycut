import { Capacitor } from '@capacitor/core';
import { apiUrl } from '@/lib/api-client';
import { GoogleAuthProvider, signInWithCredential, signOut } from 'firebase/auth';
import { firebaseAuth } from '@/lib/firebase/client';

export type NativeGoogleUser = {
  id: string;
  email: string;
  name?: string;
  imageUrl?: string;
  authentication: { idToken: string; accessToken?: string };
};

const GOOGLE_SCOPES = ['profile', 'email', 'https://www.googleapis.com/auth/drive.file'];

/** Bridge injected by WyBuild Capacitor builds (see WyBuild capacitor-bridge.entry.js). */
type WyBuildGoogleResult = {
  ok?: boolean;
  error?: string;
  user?: { uid?: string; email?: string | null; displayName?: string | null; photoUrl?: string | null } | null;
  credential?: { idToken?: string | null; accessToken?: string | null } | null;
};
type WyBuildNativeBridge = { auth?: { google?: (options?: { scopes?: string[] }) => Promise<WyBuildGoogleResult> } };
declare global { interface Window { WyBuildNative?: WyBuildNativeBridge } }

/** The bridge is a module script, so it can finish loading just after the page. Wait briefly for it. */
async function waitForWyBuildBridge(timeoutMs = 4000): Promise<WyBuildNativeBridge | null> {
  if (typeof window === 'undefined') return null;
  if (window.WyBuildNative?.auth?.google) return window.WyBuildNative;
  return new Promise(resolve => {
    const finish = () => { window.removeEventListener('wybuild-native-ready', finish); clearTimeout(timer); resolve(window.WyBuildNative?.auth?.google ? window.WyBuildNative : null); };
    const timer = setTimeout(finish, timeoutMs);
    window.addEventListener('wybuild-native-ready', finish);
  });
}

function explainNativeError(message: string): string {
  if (/cancel/i.test(message)) return 'Google sign-in was cancelled.';
  if (/developer|\b10\b|12500|12501|no credential/i.test(message)) {
    return `Google rejected this app build (${message}). The APK signing SHA-1 must be added to the Firebase Android app for package app.wycut.vercel (Firebase > Project settings), then download a fresh google-services.json and rebuild.`;
  }
  return message || 'Google sign-in failed. Please try again.';
}

let initialized = false;
let initializationPromise: Promise<void> | null = null;
let pluginPromise: Promise<typeof import('@codetrix-studio/capacitor-google-auth').GoogleAuth> | null = null;
async function getGoogleAuth() {
  // Dynamic import keeps the native plugin out of server-side page evaluation.
  pluginPromise ||= import('@codetrix-studio/capacitor-google-auth').then(module => module.GoogleAuth);
  return pluginPromise;
}

export async function initializeGoogleNative(): Promise<void> {
  if (initialized || !Capacitor.isNativePlatform()) return;
  if (!initializationPromise) {
    initializationPromise = (async () => {
      const GoogleAuth = await getGoogleAuth();
      const clientId = process.env.NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID;
      if (!clientId) throw new Error('Google sign-in is not configured. Set NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID before building/deploying WyCut.');
      await GoogleAuth.initialize({
        clientId,
        scopes: ['profile', 'email', 'https://www.googleapis.com/auth/drive.file'],
        grantOfflineAccess: false,
      });
      initialized = true;
    })().finally(() => { initializationPromise = null; });
  }
  await initializationPromise;
}

async function completeNativeSignIn(user: NativeGoogleUser): Promise<NativeGoogleUser> {
  const idToken = user.authentication.idToken;
  // Exchange the native Google credential for a Firebase session. Firebase then refreshes the token by itself, so users are not
  // signed out every hour (a raw Google ID token expires after about 60 minutes). If Firebase is unavailable, keep the Google token.
  let sessionToken = idToken;
  try {
    const credential = GoogleAuthProvider.credential(idToken, user.authentication.accessToken);
    const result = await signInWithCredential(firebaseAuth, credential);
    sessionToken = await result.user.getIdToken();
  } catch (error) {
    console.warn('[google-native] Firebase sign-in unavailable, using the Google ID token directly.', error instanceof Error ? error.message : error);
  }
  const response = await fetch(apiUrl('/api/auth/google/verify'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken: sessionToken }),
    cache: 'no-store',
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(data.error || 'Google identity verification failed. Please sign in again.');
  }
  return { ...user, authentication: { idToken: sessionToken, accessToken: user.authentication.accessToken } };
}

async function signInWithWyBuildBridge(bridge: WyBuildNativeBridge): Promise<NativeGoogleUser> {
  // Opens Android's own account chooser. Scopes are requested so Google Drive export keeps working.
  const result = await bridge.auth!.google!({ scopes: GOOGLE_SCOPES });
  if (!result || result.ok === false) throw new Error(explainNativeError(result?.error || ''));
  const idToken = result.credential?.idToken;
  if (!idToken) throw new Error('Google sign-in did not return an ID token. Check that the APK signing SHA-1 is registered for package app.wycut.vercel in Firebase and that google-services.json was refreshed afterwards.');
  return completeNativeSignIn({
    id: result.user?.uid || '',
    email: result.user?.email || '',
    name: result.user?.displayName || undefined,
    imageUrl: result.user?.photoUrl || undefined,
    authentication: { idToken, accessToken: result.credential?.accessToken || undefined },
  });
}

export async function signInWithGoogleNative(): Promise<NativeGoogleUser> {
  if (!Capacitor.isNativePlatform()) throw new Error('Native Google sign-in is only available in the installed Android/iOS app.');
  // 1) WyBuild Capacitor builds (Firebase Authentication plugin).
  const bridge = await waitForWyBuildBridge();
  if (bridge) return signInWithWyBuildBridge(bridge);
  // 2) WyCut's own Capacitor build (npm run android:debug) with @codetrix-studio/capacitor-google-auth.
  await initializeGoogleNative();
  const GoogleAuth = await getGoogleAuth();
  let user;
  try { user = await GoogleAuth.signIn(); }
  catch (error) { throw new Error(explainNativeError(error instanceof Error ? error.message : String((error as { message?: unknown })?.message || error))); }
  const idToken = user.authentication?.idToken;
  if (!idToken) throw new Error('Google sign-in did not return an ID token. Check that the APK signing SHA-1 is registered for package app.wycut.vercel in Firebase, and that NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID is the Web client.');
  return completeNativeSignIn({
    id: user.id,
    email: user.email,
    name: user.name,
    imageUrl: user.imageUrl,
    authentication: { idToken, accessToken: user.authentication?.accessToken },
  });
}

export async function signOutGoogleNative(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const bridge = window.WyBuildNative as (WyBuildNativeBridge & { auth?: { signOut?: () => Promise<unknown> } }) | undefined;
    if (bridge?.auth?.signOut) { await bridge.auth.signOut(); await signOut(firebaseAuth).catch(() => undefined); return; }
    const GoogleAuth = await getGoogleAuth();
    await GoogleAuth.signOut();
    await signOut(firebaseAuth).catch(() => undefined);
  } finally {
    initialized = false;
    initializationPromise = null;
  }
}
