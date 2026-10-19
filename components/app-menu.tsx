'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Menu, X, FileText, UploadCloud, Link2, History, CreditCard, UserRound } from 'lucide-react';
import { listProjects, liveProjects, PROJECTS_CHANGED } from '@/lib/projects/store';

const ITEMS = [
  { href: '/dashboard/subtitles', label: 'Subtitles recap', Icon: FileText },
  { href: '/dashboard/file', label: 'Video file', Icon: UploadCloud },
  { href: '/dashboard/url', label: 'Video URL', Icon: Link2 },
  { href: '/history', label: 'History', Icon: History },
  { href: '/billing', label: 'Credits & billing', Icon: CreditCard },
  { href: '/login?next=/dashboard', label: 'Account', Icon: UserRound },
];
const SHOW_ON = (path: string) => path === '/dashboard' || path.startsWith('/dashboard/') || path === '/history' || path === '/billing';

/** Floating menu: tap the button to expand, tap anywhere else on the screen (or an item) to collapse it. */
export function AppMenu({ path }: { path: string }) {
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(0);
  useEffect(() => { setOpen(false); }, [path]);
  useEffect(() => {
    const refresh = () => { void listProjects().then(list => setRunning(list.filter(p => p.status === 'running' && liveProjects.has(p.id)).length)); };
    refresh(); window.addEventListener(PROJECTS_CHANGED, refresh); const timer = window.setInterval(refresh, 4000);
    return () => { window.removeEventListener(PROJECTS_CHANGED, refresh); window.clearInterval(timer); };
  }, []);
  useEffect(() => { if (!open) return; const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); }; window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey); }, [open]);
  if (!SHOW_ON(path)) return null;
  const isActive = (href: string) => { const base = href.split('?')[0]; return path === base || (base === '/dashboard/subtitles' && path === '/dashboard'); };
  return <>
    {open && <div aria-hidden="true" onPointerDown={() => setOpen(false)} className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[1px]" />}
    <div className="fixed right-4 z-50 flex flex-col items-end gap-2" style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 1rem)' }}>
      <nav id="wycut-menu" aria-label="Main menu" aria-hidden={!open} className={`w-60 origin-bottom-right overflow-hidden rounded-2xl border border-white/10 bg-[#111521] shadow-2xl shadow-black/60 transition-all duration-200 ${open ? 'max-h-[28rem] scale-100 opacity-100' : 'pointer-events-none max-h-0 scale-95 opacity-0'}`}>
        <ul className="p-2">
          {ITEMS.map(({ href, label, Icon }) => <li key={href}>
            <Link href={href} tabIndex={open ? 0 : -1} onClick={() => setOpen(false)} className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold ${isActive(href) ? 'bg-violet-500/20 text-violet-200' : 'text-slate-200 active:bg-white/10'}`}>
              <Icon size={18} className={isActive(href) ? 'text-violet-300' : 'text-slate-400'} />
              <span className="flex-1">{label}</span>
              {href === '/history' && running > 0 && <span className="rounded-full bg-emerald-400/15 px-2 py-0.5 text-[11px] font-bold text-emerald-300">{running} running</span>}
            </Link>
          </li>)}
        </ul>
      </nav>
      <button type="button" aria-expanded={open} aria-controls="wycut-menu" aria-label={open ? 'Close menu' : 'Open menu'} onClick={() => setOpen(v => !v)} className="relative grid h-14 w-14 place-items-center rounded-full bg-violet-500 text-white shadow-lg shadow-violet-950/60 active:scale-95">
        {open ? <X size={24} /> : <Menu size={24} />}
        {!open && running > 0 && <span className="absolute right-0.5 top-0.5 h-3.5 w-3.5 animate-pulse rounded-full border-2 border-[#080a10] bg-emerald-400" />}
      </button>
    </div>
  </>;
}
