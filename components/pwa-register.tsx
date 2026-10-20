'use client';

import { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';

type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }> };

export default function PWARegister() {
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [showInstall, setShowInstall] = useState(false);

  useEffect(() => {
    if ('serviceWorker' in navigator && window.isSecureContext) {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((error) => {
        console.warn('WyCut service worker registration failed:', error);
      });
    }

    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
      setShowInstall(true);
    };
    const onInstalled = () => {
      setShowInstall(false);
      setInstallPrompt(null);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  async function install() {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome !== 'accepted') setShowInstall(false);
    setInstallPrompt(null);
  }

  if (!showInstall || !installPrompt) return null;
  return (
    <aside className="fixed inset-x-3 bottom-3 z-[100] mx-auto flex max-w-lg items-center gap-3 rounded-2xl border border-violet-300/20 bg-[#111521]/95 p-3 text-white shadow-2xl backdrop-blur-xl" role="region" aria-label="Install WyCut">
      <img src="/icons/icon-96x96.png" width="48" height="48" alt="" className="rounded-xl" />
      <div className="min-w-0 flex-1"><p className="font-bold">Install WyCut</p><p className="text-xs text-slate-300">Add the recap studio to your home screen.</p></div>
      <button type="button" onClick={install} className="inline-flex items-center gap-2 rounded-xl bg-violet-500 px-3 py-2 text-sm font-bold hover:bg-violet-400"><Download size={16}/> Install</button>
      <button type="button" onClick={() => setShowInstall(false)} className="rounded-lg p-2 text-slate-300 hover:bg-white/10" aria-label="Dismiss install prompt"><X size={17}/></button>
    </aside>
  );
}
