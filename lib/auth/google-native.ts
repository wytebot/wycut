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

export async function signInWithGoogleNative(): Promise<NativeGoogleUser> {
  if (!Capacitor.isNativePlatform()) throw new Error('Native Google sign-in is only available in the installed Android/iOS app.');
  await initializeGoogleNative();
  const GoogleAuth = await getGoogleAuth();
  const user = await GoogleAuth.signIn();
  const idToken = user.authentication?.idToken;
  if (!idToken) throw new Error('Google sign-in did not return an ID token. Check that the APK signing SHA-1 is registered for package app.wycut.vercel in Firebase, and that NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID is the Web client.');
  // Exchange the native Google credential for a Firebase session. Firebase then refreshes the token by itself, so users are not
  // signed out every hour (a raw Google ID token expires after about 60 minutes). If Firebase is unavailable, keep the Google token.
  let sessionToken = idToken;
  try {
    const credential = GoogleAuthProvider.credential(idToken, user.authentication?.accessToken);
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
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    imageUrl: user.imageUrl,
    authentication: { idToken: sessionToken, accessToken: user.authentication?.accessToken },
  };
}

export async function signOutGoogleNative(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const GoogleAuth = await getGoogleAuth();
    await GoogleAuth.signOut();
    await signOut(firebaseAuth).catch(() => undefined);
  } finally {
    initialized = false;
    initializationPromise = null;
  }
}
