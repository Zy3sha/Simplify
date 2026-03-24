// ── Firebase SDK Initialization ──
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, doc, setDoc, getDoc, onSnapshot, serverTimestamp, collection, addDoc, getDocs, deleteDoc, query, orderBy }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getAuth, signInAnonymously, onAuthStateChanged }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getAnalytics, logEvent }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-analytics.js";

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
const db  = getFirestore(app);
const auth = getAuth(app);
const analytics = getAnalytics(app);

window._fb = { db, auth, analytics, doc, setDoc, getDoc, onSnapshot, serverTimestamp, signInAnonymously, onAuthStateChanged, logEvent, collection, addDoc, getDocs, deleteDoc, query, orderBy };

signInAnonymously(auth).catch(e => console.warn("Auth error", e));
onAuthStateChanged(auth, user => { if (user) window._fbUid = user.uid; });
