import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.wycutrecap.vercel',
  appName: 'WyCut',
  // Bundle the static UI in the APK. API routes stay on the HTTPS Next.js deployment.
  webDir: 'out',
  android: { allowMixedContent: false },
  plugins: {
    GoogleAuth: {
      scopes: ['profile', 'email', 'https://www.googleapis.com/auth/drive.file'],
      serverClientId: process.env.NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    },
  },
};

export default config;
