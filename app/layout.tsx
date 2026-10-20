import type { Metadata, Viewport } from 'next';
import PWARegister from '@/components/pwa-register';
import { AppShell } from '@/components/app-shell';
import './globals.css';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#8b5cf6',
  colorScheme: 'dark',
};

export const metadata: Metadata = {
  title: {
    default: 'WyCut — Movie Recap Production Studio',
    template: '%s | WyCut',
  },
  applicationName: 'WyCut',
  description: 'Create movie recap scripts, narration, captions and edit-ready video clip kits with WyCut.',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon-16.png', sizes: '16x16', type: 'image/png' },
      { url: '/icons/icon-192x192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512x512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  appleWebApp: {
    capable: true,
    title: 'WyCut',
    statusBarStyle: 'black-translucent',
  },
  formatDetection: { telephone: false },
  other: {
    'mobile-web-app-capable': 'yes',
    'msapplication-TileColor': '#080a10',
    'msapplication-config': '/browserconfig.xml',
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><AppShell>{children}</AppShell><PWARegister /></body></html>;
}
