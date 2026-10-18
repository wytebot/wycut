'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  browserSessionPersistence,
  getRedirectResult,
  GoogleAuthProvider,
  setPersistence,
  signInWithPopup,
  signInWithRedirect,
  type User,
} from 'firebase/auth';
import { ArrowLeft, Clapperboard, LoaderCircle, ShieldCheck } from 'lucide-react';
import { firebaseAuth } from '@/lib/firebase/client';
import { Capacitor } from '@capacitor/core';
import { signInWithGoogleNative } from '@/lib/auth/google-native';

const TOKEN_KEY = 'wycut_google_id_token';

function readableAuthError(error: unknown): string {
  const code = typeof error === 'object' && error && 'code' in error
    ? String((error as { code?: unknown }).code)
    : '';
  const messages: Record<string, string> = {
    'auth/popup-blocked': 'Your browser blocked the Google sign-in popup. Please allow popups and try again.',
    'auth/popup-closed-by-user': 'The Google sign-in window was closed before sign-in finished.',
    'auth/cancelled-popup-request': 'A Google sign-in request was cancelled. Please try again.',
    'auth/unauthorized-domain': 'This website domain is not authorized. Add it in Firebase Console → Authentication → Settings → Authorized domains.',
    'auth/operation-not-allowed': 'Google sign-in is not enabled. Enable Google under Firebase Console → Authentication → Sign-in method.',
    'auth/network-request-failed': 'Network connection failed. Check your internet connection and retry.',
    'auth/account-exists-with-different-credential': 'An account already exists with this email using a different sign-in method. Contact support for help.',
    'auth/web-storage-unsupported': 'Browser storage is unavailable. Allow site storage or try another browser.',
  };
  return messages[code] || (error instanceof Error ? error.message : 'Google sign-in failed. Please try again.');
}

export default function LoginPage() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const redirectHandled = useRef(false);

  function continueToApp() {
    const params = new URLSearchParams(window.location.search);
    const next = params.get('next');
    const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard';
    router.replace(safeNext);
  }

  async function finishLogin(user: User) {
    const token = await user.getIdToken(true);
    sessionStorage.setItem(TOKEN_KEY, token);
    sessionStorage.setItem('wycut_auth_email', user.email || '');
    continueToApp();
  }

  useEffect(() => {
    if (redirectHandled.current) return;
    redirectHandled.current = true;
    let active = true;
    void (async () => {
      try {
        if (!Capacitor.isNativePlatform()) await setPersistence(firebaseAuth, browserSessionPersistence);
        const result = await getRedirectResult(firebaseAuth);
        if (active && result?.user) await finishLogin(result.user);
      } catch (e) {
        if (active) setError(readableAuthError(e));
      }
    })();
    return () => { active = false; };
    // This runs once to process Firebase's redirect result after returning from Google.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function googleLogin() {
    setBusy(true);
    setError('');
    setNotice('Opening Google sign-in…');
    try {
      if (Capacitor.isNativePlatform()) {
        const nativeUser = await signInWithGoogleNative();
        sessionStorage.setItem(TOKEN_KEY, nativeUser.authentication.idToken);
        sessionStorage.setItem('wycut_auth_email', nativeUser.email || '');
        continueToApp();
        return;
      }
      await setPersistence(firebaseAuth, browserSessionPersistence);
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      try {
        const result = await signInWithPopup(firebaseAuth, provider);
        await finishLogin(result.user);
      } catch (e) {
        const code = typeof e === 'object' && e && 'code' in e
          ? String((e as { code?: unknown }).code)
          : '';
        const fallbackCodes = [
          'auth/popup-blocked',
          'auth/popup-closed-by-user',
          'auth/cancelled-popup-request',
          'auth/operation-not-supported-in-this-environment',
          'auth/web-storage-unsupported',
        ];
        if (!fallbackCodes.includes(code)) throw e;
        setNotice('Popup unavailable. Switching to Google redirect sign-in…');
        await signInWithRedirect(firebaseAuth, provider);
        return;
      }
    } catch (e) {
      setError(readableAuthError(e));
      setNotice('');
      setBusy(false);
    }
  }

  return <main className="min-h-screen bg-[#080a10] px-4 py-8 text-white sm:px-6">
    <div className="mx-auto max-w-md">
      <Link href="/" className="inline-flex items-center gap-2 text-sm text-violet-300"><ArrowLeft size={16}/> Back to WyCut</Link>
      <section className="mt-7 rounded-3xl border border-white/10 bg-[#111521] p-6 shadow-2xl shadow-black/30 sm:p-8">
        <div className="mb-7 flex items-center gap-3">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-violet-500"><Clapperboard size={25}/></span>
          <div><p className="text-xl font-black">Welcome to WyCut</p><p className="text-sm text-slate-400">Sign in securely with your Google account</p></div>
        </div>
        <button type="button" disabled={busy} onClick={() => void googleLogin()} className="flex min-h-12 w-full items-center justify-center gap-3 rounded-xl bg-white px-4 py-3 font-bold text-black transition hover:bg-slate-100 disabled:opacity-50">
          {busy ? <LoaderCircle size={19} className="animate-spin"/> : <span aria-hidden="true" className="text-xl font-black">G</span>}
          {busy ? 'Connecting to Google…' : 'Continue with Google'}
        </button>
        <p className="mt-4 text-center text-sm leading-6 text-slate-400">Choose the Google account you want to use for WyCut. If the popup cannot open, sign-in will continue in this window.</p>
        {notice && <p role="status" className="mt-4 rounded-xl border border-emerald-400/20 bg-emerald-400/5 p-3 text-sm text-emerald-200">{notice}</p>}
        {error && <p role="alert" className="mt-4 rounded-xl border border-rose-400/20 bg-rose-400/5 p-3 text-sm text-rose-200">{error}</p>}
        <p className="mt-6 flex items-start gap-2 text-xs leading-5 text-slate-500"><ShieldCheck size={15} className="mt-0.5 shrink-0 text-emerald-300"/>Authentication is handled by Google and Firebase. WyCut does not ask you to create or remember a separate password.</p>
      </section>
      <p className="mt-5 text-center text-xs text-slate-500">By continuing, you agree to our <Link href="/terms" className="text-violet-300 underline">Terms</Link> and <Link href="/privacy" className="text-violet-300 underline">Privacy Policy</Link>.</p>
    </div>
  </main>;
}
