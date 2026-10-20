/**
 * Normal web/server deployment keeps Next.js API routes enabled.
 * Capacitor's APK bundles a static UI and calls the separately deployed API server.
 * scripts/build-capacitor-web.mjs temporarily removes server-only route files while
 * building the static export, then restores them before returning.
 */
const isCapacitorStaticExport = process.env.CAPACITOR_STATIC_EXPORT === '1';

/** @type {import('next').NextConfig} */
const nextConfig = {
  ...(isCapacitorStaticExport ? { output: 'export', trailingSlash: true } : {}),
  images: { unoptimized: isCapacitorStaticExport },
};

export default nextConfig;
