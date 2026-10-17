/* WyCut PWA service worker. Never cache API responses, authentication, billing, or private Drive data. */
'use strict';
const CACHE_VERSION = 'wycut-pwa-v1';
const APP_SHELL = [
  '/offline.html',
  '/manifest.webmanifest',
  '/favicon.ico',
  '/apple-touch-icon.png',
  '/icons/icon-192x192.png',
  '/icons/icon-maskable-192.png',
  '/icons/icon-512x512.png',
  '/icons/icon-maskable-512.png'
];
const NEVER_CACHE = /\/(api|billing|auth|oauth|token|webhook)(\/|$)/i;

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_VERSION);
    await cache.addAll(APP_SHELL);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith('wycut-pwa-') && key !== CACHE_VERSION).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || NEVER_CACHE.test(url.pathname)) return;
  // Navigations are network-first so studio pages and authenticated state stay current.
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        return response;
      } catch {
        return (await caches.match('/offline.html')) || Response.error();
      }
    })());
    return;
  }
  // Cache only static Next assets and public assets; never cache HTML/API data here.
  const isStaticAsset = url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/') || /\.(?:png|jpg|jpeg|webp|svg|ico|woff2?)$/i.test(url.pathname) || url.pathname === '/manifest.webmanifest';
  if (!isStaticAsset) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_VERSION);
    const cached = await cache.match(request);
    if (cached) return cached;
    try {
      const response = await fetch(request);
      if (response && response.ok && response.type === 'basic') await cache.put(request, response.clone());
      return response;
    } catch {
      return cached || Response.error();
    }
  })());
});
