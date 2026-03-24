import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { copyFileSync, existsSync, mkdirSync } from 'fs';
import { resolve } from 'path';

// Plugin to copy standalone JS files to dist after build
function copyNativePlugins() {
  return {
    name: 'copy-native-plugins',
    closeBundle() {
      const files = ['native-plugins.js', 'theme.js', 'obubba-happy.png', 'obubba-celebration.png', 'obubba-thinking.png', 'obubba-loading.png'];
      const outDir = resolve(__dirname, 'dist');
      if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
      for (const f of files) {
        const src = resolve(__dirname, f);
        if (existsSync(src)) {
          copyFileSync(src, resolve(outDir, f));
          console.log(`  ✓ Copied ${f} → dist/${f}`);
        }
      }
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    copyNativePlugins(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,jpg,webp,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: { cacheName: 'google-fonts-css', expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 } },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: { cacheName: 'google-fonts-webfont', expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 } },
          },
          {
            urlPattern: /^https:\/\/www\.gstatic\.com\/firebasejs\/.*/i,
            handler: 'CacheFirst',
            options: { cacheName: 'firebase-sdk', expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 30 } },
          },
        ],
      },
      manifest: false, // We use our own manifest.json
    }),
  ],
  build: {
    outDir: 'dist',
    sourcemap: false,
    target: 'es2020', // Modern WebView targets (iOS 14+, Android 7+)
    cssCodeSplit: true, // Split CSS per lazy-loaded chunk
    rollupOptions: {
      // Capacitor plugins use dynamic import() and only resolve at runtime on native
      external: [
        /^@capacitor\//,
        /^@capacitor-community\//,
        /^@capawesome\//,
        /^cordova-plugin-/,
      ],
      output: {
        manualChunks: {
          react: ['react', 'react-dom'],
          firebase: ['firebase/app', 'firebase/firestore', 'firebase/auth', 'firebase/analytics'],
        },
      },
    },
  },
});
