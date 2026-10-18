import { firebaseAuth } from '@/lib/firebase/client';
import { Capacitor } from '@capacitor/core';

/** Obtain a fresh Firebase ID token immediately before authenticated API requests. */
export async function getAuthToken(fallback = ''): Promise<string> {
  // currentUser is null until Firebase finishes restoring the saved session on page load.
  // Without waiting, a fast click on "Generate" fails with a false "session expired" error.
  try { await firebaseAuth.authStateReady(); } catch { /* fall through to the checks below */ }
  const user = firebaseAuth.currentUser;
  if (user) {
    try { return await user.getIdToken(true); }
    catch (error) {
      if (fallback) return fallback; // offline/transient refresh failure: let the server decide
      throw new Error(`Could not refresh your sign-in (${error instanceof Error ? error.message : 'unknown error'}). Check your connection and try again.`);
    }
  }
  // Native Google sign-in may be configured without a Firebase user in older app installs.
  if (Capacitor.isNativePlatform() && fallback) return fallback;
  throw new Error('Your sign-in session has expired. Please sign in again.');
}
