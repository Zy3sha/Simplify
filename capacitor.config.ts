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
    hostname: 'obubba-d9ccc.firebaseapp.com',
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

    // ── Splash Screen ──
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: '#F0DDD6',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      iosSpinnerStyle: 'small',
      spinnerColor: '#C07088',
      splashFullScreen: true,
      splashImmersive: true,
      layoutName: 'launch_screen',
      useDialog: true,
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
    scheme: 'OBubba',
    contentInset: 'automatic',
    allowsLinkPreview: true,
    backgroundColor: '#F0DDD6',
    preferredContentMode: 'mobile',
    limitsNavigationsToAppBoundDomains: true,
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
