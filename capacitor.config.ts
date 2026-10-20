import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.wycut.vercel',
  appName: 'WyCut',
  // Bundle the static UI in the APK. API routes stay on the HTTPS Next.js deployment.
  webDir: 'out',
  // https scheme => the app origin is https://localhost, which must be listed in CAPACITOR_ALLOWED_ORIGINS on the backend.
  server: { androidScheme: 'https' },
  backgroundColor: '#080a10',
  android: { allowMixedContent: false, backgroundColor: '#080a10' },
  plugins: {
    GoogleAuth: {
      scopes: ['profile', 'email', 'https://www.googleapis.com/auth/drive.file'],
      serverClientId: process.env.NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    },
  },
};

export default config;
