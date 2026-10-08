import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
import { 
  getAuth, 
  initializeAuth, 
  GoogleAuthProvider, 
  browserLocalPersistence, 
  indexedDBLocalPersistence,
  browserPopupRedirectResolver,
  setPersistence 
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

// Primary Firestore Database app (connected to project firestore database)
export const app = getApps().some(a => a.name === '[DEFAULT]') 
  ? getApp('[DEFAULT]') 
  : initializeApp(firebaseConfig);

export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

// Shared Google OAuth Authentication app (connected to the user's primary Firebase Auth project 'acquired-myth-1nzsc',
// which is shared with IT Desk (devicecare-drab.vercel.app), IPass (i-pass-three.vercel.app), and 디벗On (dibeot.vercel.app))
export const authFirebaseConfig = {
  projectId: import.meta.env.VITE_FIREBASE_AUTH_PROJECT_ID || "acquired-myth-1nzsc",
  appId: import.meta.env.VITE_FIREBASE_AUTH_APP_ID || "1:301056078537:web:35b496eab137171d32d318",
  apiKey: import.meta.env.VITE_FIREBASE_AUTH_API_KEY || "AIzaSyBmQJi7o29iliLQYdU2ZyIAnG54ppe1Kds",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "acquired-myth-1nzsc.firebaseapp.com",
  storageBucket: import.meta.env.VITE_FIREBASE_AUTH_STORAGE_BUCKET || "acquired-myth-1nzsc.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_AUTH_MESSAGING_SENDER_ID || "301056078537"
};

export const authApp = getApps().some(a => a.name === 'authApp') 
  ? getApp('authApp') 
  : initializeApp(authFirebaseConfig, 'authApp');

// Robust Auth persistence: IndexedDB (primary on modern browsers and Mobile PWA standalone) + localStorage fallback
let authInstance: ReturnType<typeof getAuth>;
try {
  authInstance = initializeAuth(authApp, {
    persistence: [indexedDBLocalPersistence, browserLocalPersistence],
    popupRedirectResolver: browserPopupRedirectResolver
  });
} catch {
  authInstance = getAuth(authApp);
}
export const auth = authInstance;

// Explicitly reinforce persistence across all devices and mobile standalone PWAs
if (typeof window !== 'undefined') {
  setPersistence(auth, browserLocalPersistence).catch(err => {
    console.warn('Firebase Auth browserLocalPersistence setup notice:', err);
  });
}

// Test connection to Firestore
if (typeof window !== 'undefined') {
  getDocFromServer(doc(db, 'test', 'connection')).catch(error => {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn('Firestore offline notice: Please check network or Firebase configuration.');
    }
  });
}

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: 'select_account'
});

export { firebaseConfig };

