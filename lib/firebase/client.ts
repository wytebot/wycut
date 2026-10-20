import { getApp, getApps, initializeApp } from 'firebase/app';
import { browserLocalPersistence, getAuth, indexedDBLocalPersistence, initializeAuth, inMemoryPersistence } from 'firebase/auth';

// Firebase web configuration is public client configuration, not a server secret.
const firebaseConfig = {
  apiKey: 'AIzaSyAHyJmjOaN9CJB4neJszUMpV3jbvK9FOWI',
  authDomain: 'wycut5.firebaseapp.com',
  projectId: 'wycut5',
  storageBucket: 'wycut5.firebasestorage.app',
  messagingSenderId: '725460027937',
  appId: '1:725460027937:web:f61ecd8203bf84375c7160',
  measurementId: 'G-L4G5PVMJTM',
};

export const firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);
// Keep sessions across visits in browser and Capacitor WebView. IndexedDB survives app restarts;
// browserLocalPersistence is retained as a fallback for WebViews with restricted IndexedDB.
function createPersistentAuth() {
  try { return initializeAuth(firebaseApp, { persistence: [indexedDBLocalPersistence, browserLocalPersistence, inMemoryPersistence] }); }
  catch { return getAuth(firebaseApp); } // Another module may already have initialized Firebase Auth.
}
export const firebaseAuth = createPersistentAuth();
