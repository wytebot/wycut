import type { Metadata } from 'next';
import './globals.css';
export const viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover' } as const;
export const metadata: Metadata = { title: 'WyCut — Movie Recap Production Studio', description: 'Create recap scripts, narration, captions and local video clip kits with WyCut.' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
