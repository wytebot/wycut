import { firebaseAuth } from '@/lib/firebase/client';
import { Capacitor } from '@capacitor/core';

/** Obtain a fresh Firebase ID token immediately before authenticated API requests. */
export async function getAuthToken(fallback = ''): Promise<string> {
  const user = firebaseAuth.currentUser;
  if (user) return user.getIdToken(true);
  // Native Google sign-in may be configured without a Firebase user in older app installs.
  if (Capacitor.isNativePlatform() && fallback) return fallback;
  throw new Error('Your sign-in session has expired. Please sign in again.');
}
