// ── Firebase Initialization (ES Module) ──
// Replaces firebase.js CDN imports with npm package imports.
// Maintains window._fb global for backward compatibility with app.jsx.

import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, getDoc, onSnapshot, serverTimestamp, collection, addDoc, getDocs, deleteDoc, query, orderBy } from 'firebase/firestore';
import { initializeAuth, signInAnonymously, onAuthStateChanged, indexedDBLocalPersistence, browserLocalPersistence } from 'firebase/auth';
import { getAnalytics, logEvent } from 'firebase/analytics';

const firebaseConfig = {
  apiKey: "AIzaSyCdHzmheQRbtzP_JI1FuWcZLeW8yVja5-0",
  authDomain: "obubba-d9ccc.firebaseapp.com",
  projectId: "obubba-d9ccc",
  storageBucket: "obubba-d9ccc.firebasestorage.app",
  messagingSenderId: "1091432133381",
  appId: "1:1091432133381:web:1cd4d0ce7397affeae7d6c",
  measurementId: "G-Y7CHSL1YHZ"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
// Use indexedDB persistence to avoid iframe blocked by WKAppBoundDomains
const auth = initializeAuth(app, {
  persistence: [indexedDBLocalPersistence, browserLocalPersistence]
});
const analytics = getAnalytics(app);

window._fb = { db, auth, analytics, doc, setDoc, getDoc, onSnapshot, serverTimestamp, signInAnonymously, onAuthStateChanged, logEvent, collection, addDoc, getDocs, deleteDoc, query, orderBy };

// Auth-ready promise: resolves when we have a user, rejects after 10s
window._fbAuthReady = new Promise((resolve, reject) => {
  const timeout = setTimeout(() => reject(new Error("Auth timeout 10s")), 10000);
  onAuthStateChanged(auth, user => {
    if (user) { window._fbUid = user.uid; clearTimeout(timeout); resolve(user); }
  });
});
signInAnonymously(auth).catch(e => {
  console.warn("Auth error", e);
  window._fbAuthError = e;
  // Visible debug on device
  if(window.Capacitor) document.title = "AUTH_ERR: " + (e.code||e.message||e);
});

export { db, auth, analytics };
