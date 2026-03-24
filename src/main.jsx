// ── OBubba Vite Entry Point ──
// Replaces runtime Babel compilation (loader.js) with Vite build pipeline.
// Saves ~2.8MB by eliminating @babel/standalone download.
//
// Import order matters — setup.js exposes React as a global before app.jsx runs.
// native-plugins.js stays as a separate <script> in index.html since it uses
// dynamic import() for Capacitor modules that aren't available at build time.

import './setup.js';          // React globals (window.React, window.ReactDOM)
import './firebase-init.js';  // Firebase init + window._fb
import '../app.jsx';          // The app — Vite compiles JSX at build time
