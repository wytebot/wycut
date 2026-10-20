import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

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

// Use Firebase's standard Auth initialization. The previous custom initializeAuth()
// persistence array could leave Auth initialized differently depending on module load
// order (especially after a client-side navigation or hot reload). Login explicitly
// selects browserLocalPersistence on web before starting the OAuth flow.
export const firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const firebaseAuth = getAuth(firebaseApp);
