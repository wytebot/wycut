import Link from 'next/link';
import type { ReactNode } from 'react';
import { Clapperboard } from 'lucide-react';

export default function LegalLayout({ title, updated = '17 October 2026', children }: { title: string; updated?: string; children: ReactNode }) {
  return <main className="min-h-screen bg-[#080a10] px-5 py-8 text-white sm:px-8 sm:py-12">
    <div className="mx-auto max-w-3xl">
      <header className="mb-10 flex items-center justify-between border-b border-white/10 pb-5">
        <Link href="/" className="flex items-center gap-2 font-black"><span className="grid h-9 w-9 place-items-center rounded-xl bg-violet-500"><Clapperboard size={20}/></span>WyCut</Link>
        <Link href="/dashboard" className="rounded-lg bg-white/10 px-3 py-2 text-sm font-semibold hover:bg-white/15">Back to studio</Link>
      </header>
      <p className="text-xs font-bold uppercase tracking-[.18em] text-violet-300">Legal</p>
      <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">{title}</h1>
      <p className="mt-3 text-xs text-slate-500">Last updated: {updated}</p>
      <article className="legal-content mt-8 space-y-6 text-sm leading-7 text-slate-300">{children}</article>
      <nav aria-label="Legal pages" className="mt-12 flex flex-wrap gap-x-5 gap-y-2 border-t border-white/10 pt-5 text-sm text-violet-300">
        <Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link><Link href="/refunds">Refunds</Link><Link href="/acceptable-use">Acceptable use</Link>
      </nav>
    </div>
  </main>;
}
