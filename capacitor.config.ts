import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.obubba.app',
  appName: 'OBubba',
  webDir: 'dist',
  bundledWebRuntime: false,

  // Server config for dev
  server: {
    androidScheme: 'https',
    iosScheme: 'https',
    hostname: 'localhost',
  },

  plugins: {
    // ── Push Notifications ──
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },

    // ── Local Notifications ──
    LocalNotifications: {
      smallIcon: 'ic_notification',
      iconColor: '#C07088',
      sound: 'notification.wav',
    },

    // ── Splash Screen — disabled so the HTML sleeping-baby splash shows ──
    SplashScreen: {
      launchShowDuration: 0,
      launchAutoHide: true,
      backgroundColor: '#FFFEFD',
      showSpinner: false,
    },

    // ── Keyboard ──
    Keyboard: {
      resize: 'body',
      resizeOnFullScreen: true,
    },

    // ── Status Bar ──
    StatusBar: {
      overlaysWebView: true,
      style: 'LIGHT',
      backgroundColor: '#F0DDD6',
    },

    // ── App Shortcuts (Quick Actions / 3D Touch) ──
    AppShortcuts: {
      shortcuts: [
        {
          id: 'log_feed',
          title: 'Log Feed',
          icon: 'feed_icon',
        },
        {
          id: 'log_sleep',
          title: 'Log Sleep',
          icon: 'sleep_icon',
        },
        {
          id: 'log_nappy',
          title: 'Log Nappy',
          icon: 'nappy_icon',
        },
        {
          id: 'start_timer',
          title: 'Start Timer',
          icon: 'timer_icon',
        },
      ],
    },

    // ── Biometric Auth ──
    BiometricAuth: {
      allowDeviceCredential: true,
    },

    // ── SQLite (offline persistence) ──
    CapacitorSQLite: {
      iosDatabaseLocation: 'Library/CapacitorDatabase',
      iosIsEncryption: false,
      androidIsEncryption: false,
    },

    // ── Camera ──
    Camera: {
      presentationStyle: 'popover',
    },

    // ── Network ──
    Network: {},

    // ── Badge ──
    Badge: {},
  },

  // ── iOS-specific ──
  ios: {
    contentInset: 'automatic',
    allowsLinkPreview: true,
    backgroundColor: '#F0DDD6',
    preferredContentMode: 'mobile',
    limitsNavigationsToAppBoundDomains: false,
    webContentsDebuggingEnabled: true,
    // Enable associated domains for Universal Links & Siri
    // Configured in Xcode: applinks:obubba.com, activitycontinuation:obubba.com
  },

  // ── Android-specific ──
  android: {
    backgroundColor: '#F0DDD6',
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
    // App Links configured via assetlinks.json
  },
};

export default config;
