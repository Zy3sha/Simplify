// ── Firebase Initialization (ES Module) ──
// Replaces firebase.js CDN imports with npm package imports.
// Maintains window._fb global for backward compatibility with app.jsx.

import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, getDoc, onSnapshot, serverTimestamp, collection, addDoc, getDocs, deleteDoc, query, orderBy } from 'firebase/firestore';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
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
const auth = getAuth(app);
const analytics = getAnalytics(app);

window._fb = { db, auth, analytics, doc, setDoc, getDoc, onSnapshot, serverTimestamp, signInAnonymously, onAuthStateChanged, logEvent, collection, addDoc, getDocs, deleteDoc, query, orderBy };

// Try SDK anonymous auth first
signInAnonymously(auth).catch(e => {
  console.warn("SDK auth failed, trying REST fallback:", e?.code || e);
  // REST fallback: call Firebase Identity Toolkit directly (no domain restriction)
  const _doRestAuth = async () => {
    try {
      const _capHttp = window.Capacitor?.Plugins?.CapacitorHttp;
      const url = `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${firebaseConfig.apiKey}`;
      const body = { returnSecureToken: true };
      let resp;
      if (_capHttp) {
        resp = await _capHttp.post({ url, headers: {"Content-Type":"application/json"}, data: body });
      } else {
        const r = await fetch(url, { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify(body) });
        resp = { status: r.status, data: await r.json() };
      }
      if (resp?.data?.idToken) {
        window._fbRestToken = resp.data.idToken;
        window._fbUid = resp.data.localId;
        // Sign into Firebase SDK with the custom token if possible
        const { signInWithCredential, GoogleAuthProvider } = await import('firebase/auth').catch(()=>({}));
        // Store token for REST calls
        console.log("REST auth succeeded, uid:", resp.data.localId);
      }
    } catch(e2) { console.warn("REST auth also failed:", e2); }
  };
  _doRestAuth();
});
onAuthStateChanged(auth, user => { if (user) window._fbUid = user.uid; });

export { db, auth, analytics };
