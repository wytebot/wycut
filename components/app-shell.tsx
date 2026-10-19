'use client';

import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { AppMenu } from '@/components/app-menu';

// The studio is loaded on demand and then kept mounted while the user moves between pages, so a running
// generation keeps going when they open History, Billing or the menu instead of being cut off by the navigation.
const DashboardWorkspace = dynamic(() => import('@/components/dashboard-workspace').then(m => m.DashboardWorkspace), { ssr: false });
type Flow = 'url' | 'file' | 'subtitles';
const clean = (path: string) => (path.length > 1 ? path.replace(/\/+$/, '') : path) || '/';

export function AppShell({ children }: { children: ReactNode }) {
  const path = clean(usePathname() || '/');
  const onStudio = path === '/dashboard' || path.startsWith('/dashboard/');
  const needsStudio = onStudio || path === '/history';
  const [mounted, setMounted] = useState(false);
  const [flow, setFlow] = useState<Flow>('subtitles');
  useEffect(() => { if (needsStudio) setMounted(true); }, [needsStudio]);
  useEffect(() => { if (path.startsWith('/dashboard/file')) setFlow('file'); else if (path.startsWith('/dashboard/url')) setFlow('url'); else if (onStudio) setFlow('subtitles'); }, [path, onStudio]);
  return <>
    {mounted && <div hidden={!onStudio}><DashboardWorkspace initialFlow={flow} /></div>}
    {children}
    <AppMenu path={path} />
  </>;
}
