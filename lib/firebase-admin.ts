import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

function getAdminApp(): App {
  const existing = getApps()[0];
  if (existing) return existing;
  const encoded = process.env.FIREBASE_SERVICE_ACCOUNT_JSON_BASE64;
  if (!encoded) throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON_BASE64 is not configured.');
  let credentials: { project_id?: string; client_email?: string; private_key?: string };
  try { credentials = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8')); }
  catch { throw new Error('Firebase service account environment variable is not valid base64-encoded JSON.'); }
  if (!credentials.project_id || !credentials.client_email || !credentials.private_key) throw new Error('Firebase service account is missing project_id, client_email, or private_key.');
  return initializeApp({ credential: cert({ projectId: credentials.project_id, clientEmail: credentials.client_email, privateKey: credentials.private_key.replace(/\\n/g, '\n') }), projectId: credentials.project_id });
}
export function getAdminDb() { return getFirestore(getAdminApp()); }
