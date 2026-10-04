import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
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

export const auth = getAuth(authApp);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: 'select_account'
});

export { firebaseConfig };

