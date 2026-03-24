// ══════════════════════════════════════════════════════════════════
// OBubba Native Plugin Bridge
// Unified API for all Capacitor native features
// Falls back gracefully to web APIs when not running natively
// ══════════════════════════════════════════════════════════════════
(function() {
"use strict";

const isNative = () =>
  typeof window !== 'undefined' &&
  window.Capacitor &&
  window.Capacitor.isNativePlatform();

const getPlatform = () =>
  isNative() ? window.Capacitor.getPlatform() : 'web';

// ── 1. HAPTICS ──────────────────────────────────────────────────
const OBHaptics = {
  async impact(style = 'Medium') {
    if (!isNative()) {
      if (navigator.vibrate) navigator.vibrate(style === 'Heavy' ? 30 : style === 'Light' ? 5 : 15);
      return;
    }
    const { Haptics, ImpactStyle } = await import('@capacitor/haptics');
    await Haptics.impact({ style: ImpactStyle[style] });
  },
  async notification(type = 'Success') {
    if (!isNative()) return;
    const { Haptics, NotificationType } = await import('@capacitor/haptics');
    await Haptics.notification({ type: NotificationType[type] });
  },
  async selectionStart() {
    if (!isNative()) return;
    const { Haptics } = await import('@capacitor/haptics');
    await Haptics.selectionStart();
  },
  async selectionChanged() {
    if (!isNative()) return;
    const { Haptics } = await import('@capacitor/haptics');
    await Haptics.selectionChanged();
  },
  async selectionEnd() {
    if (!isNative()) return;
    const { Haptics } = await import('@capacitor/haptics');
    await Haptics.selectionEnd();
  },
};

// ── 2. BIOMETRIC AUTH (Face ID / Touch ID / Fingerprint) ────────
const OBBiometric = {
  async isAvailable() {
    if (!isNative()) return { available: false, type: 'none' };
    try {
      const { BiometricAuth } = await import('@aparajita/capacitor-biometric-auth');
      const result = await BiometricAuth.checkBiometry();
      return {
        available: result.isAvailable,
        type: result.biometryType, // 'faceId', 'touchId', 'fingerprintAuthentication', 'faceAuthentication'
        reason: result.reason,
      };
    } catch { return { available: false, type: 'none' }; }
  },
  async authenticate(reason = 'Verify your identity') {
    if (!isNative()) return { success: false, error: 'not_native' };
    try {
      const { BiometricAuth } = await import('@aparajita/capacitor-biometric-auth');
      await BiometricAuth.authenticate({ reason, allowDeviceCredential: true });
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message || 'auth_failed' };
    }
  },
};

// ── 3. SIGN IN WITH APPLE ───────────────────────────────────────
const OBAppleSignIn = {
  async isAvailable() {
    return getPlatform() === 'ios';
  },
  async signIn() {
    if (getPlatform() !== 'ios') return { success: false, error: 'not_ios' };
    try {
      const { SignInWithApple } = await import('@capacitor-community/apple-sign-in');
      const result = await SignInWithApple.authorize({
        clientId: 'com.obubba.app',
        redirectURI: 'https://obubba.com/auth/apple/callback',
        scopes: 'email name',
        state: crypto.randomUUID(),
        nonce: crypto.randomUUID(),
      });
      return {
        success: true,
        user: result.response.user,
        email: result.response.email,
        givenName: result.response.givenName,
        familyName: result.response.familyName,
        identityToken: result.response.identityToken,
        authorizationCode: result.response.authorizationCode,
      };
    } catch (e) {
      return { success: false, error: e.message || 'apple_signin_failed' };
    }
  },
};

// ── 4. GOOGLE SIGN-IN ───────────────────────────────────────────
const OBGoogleSignIn = {
  async signIn() {
    try {
      const { GoogleAuth } = await import('@capacitor-community/google-auth');
      await GoogleAuth.initialize({
        clientId: 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com',
        scopes: ['profile', 'email'],
      });
      const result = await GoogleAuth.signIn();
      return {
        success: true,
        user: result.id,
        email: result.email,
        name: result.name,
        imageUrl: result.imageUrl,
        idToken: result.authentication.idToken,
      };
    } catch (e) {
      return { success: false, error: e.message || 'google_signin_failed' };
    }
  },
  async signOut() {
    try {
      const { GoogleAuth } = await import('@capacitor-community/google-auth');
      await GoogleAuth.signOut();
    } catch {}
  },
};

// ── 5. PUSH NOTIFICATIONS (APNs + FCM) ─────────────────────────
const OBPushNotifications = {
  _listeners: [],

  async requestPermission() {
    if (!isNative()) {
      if ('Notification' in window) {
        const result = await Notification.requestPermission();
        return { granted: result === 'granted' };
      }
      return { granted: false };
    }
    const { PushNotifications } = await import('@capacitor/push-notifications');
    const perm = await PushNotifications.requestPermissions();
    return { granted: perm.receive === 'granted' };
  },

  async register() {
    if (!isNative()) return { token: null };
    const { PushNotifications } = await import('@capacitor/push-notifications');
    await PushNotifications.register();
    return new Promise((resolve) => {
      PushNotifications.addListener('registration', (token) => {
        resolve({ token: token.value });
      });
      PushNotifications.addListener('registrationError', (err) => {
        resolve({ token: null, error: err.error });
      });
    });
  },

  async onNotificationReceived(callback) {
    if (!isNative()) return;
    const { PushNotifications } = await import('@capacitor/push-notifications');
    const listener = await PushNotifications.addListener('pushNotificationReceived', callback);
    this._listeners.push(listener);
  },

  async onNotificationTapped(callback) {
    if (!isNative()) return;
    const { PushNotifications } = await import('@capacitor/push-notifications');
    const listener = await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      callback(action.notification, action.actionId);
    });
    this._listeners.push(listener);
  },

  async setBadgeCount(count) {
    try {
      const { Badge } = await import('@capawesome/capacitor-badge');
      await Badge.set({ count });
    } catch {}
  },

  async clearBadge() {
    try {
      const { Badge } = await import('@capawesome/capacitor-badge');
      await Badge.clear();
    } catch {}
  },
};

// ── 6. LOCAL NOTIFICATIONS ──────────────────────────────────────
const OBLocalNotifications = {
  async schedule({ id, title, body, scheduleAt, extra, channelId }) {
    if (!isNative()) {
      // Web fallback: schedule with setTimeout if within reasonable time
      if ('Notification' in window && Notification.permission === 'granted') {
        const delay = new Date(scheduleAt).getTime() - Date.now();
        if (delay > 0 && delay < 86400000) {
          setTimeout(() => new Notification(title, { body, icon: '/icons/icon-192.png', data: extra }), delay);
        }
      }
      return;
    }
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    await LocalNotifications.schedule({
      notifications: [{
        id: id || Math.floor(Math.random() * 100000),
        title,
        body,
        schedule: { at: new Date(scheduleAt) },
        sound: 'notification.wav',
        extra: extra || {},
        channelId: channelId || 'obubba_reminders',
      }],
    });
  },

  async cancelAll() {
    if (!isNative()) return;
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    const pending = await LocalNotifications.getPending();
    if (pending.notifications.length > 0) {
      await LocalNotifications.cancel(pending);
    }
  },

  async createChannels() {
    if (getPlatform() !== 'android') return;
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    await LocalNotifications.createChannel({
      id: 'obubba_reminders',
      name: 'Reminders',
      description: 'Feed, sleep, and medicine reminders',
      importance: 4,
      sound: 'notification.wav',
      vibration: true,
    });
    await LocalNotifications.createChannel({
      id: 'obubba_timers',
      name: 'Active Timers',
      description: 'Running feed and sleep timers',
      importance: 3,
      sound: null,
      vibration: false,
    });
    await LocalNotifications.createChannel({
      id: 'obubba_milestones',
      name: 'Milestones',
      description: 'Developmental milestone reminders',
      importance: 3,
      sound: 'notification.wav',
      vibration: true,
    });
  },
};

// ── 7. APP SHORTCUTS (3D Touch / Long Press Home Icon) ──────────
const OBAppShortcuts = {
  async set(shortcuts) {
    if (!isNative()) return;
    try {
      const { AppShortcuts } = await import('@capawesome/capacitor-app-shortcuts');
      await AppShortcuts.set({
        shortcuts: shortcuts.map((s) => ({
          id: s.id,
          title: s.title,
          description: s.description || '',
          iconName: s.icon || undefined,
        })),
      });
    } catch {}
  },

  async onShortcutUsed(callback) {
    if (!isNative()) return;
    try {
      const { AppShortcuts } = await import('@capawesome/capacitor-app-shortcuts');
      AppShortcuts.addListener('shortcut', (event) => {
        callback(event.shortcutId);
      });
    } catch {}
  },
};

// ── 8. CAMERA ───────────────────────────────────────────────────
const OBCamera = {
  async takePhoto() {
    if (!isNative()) {
      // Web fallback: file input
      return new Promise((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.capture = 'environment';
        input.onchange = (e) => {
          const file = e.target.files[0];
          if (!file) return resolve(null);
          const reader = new FileReader();
          reader.onload = () => resolve({ dataUrl: reader.result, format: 'jpeg' });
          reader.readAsDataURL(file);
        };
        input.click();
      });
    }
    const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera');
    const photo = await Camera.getPhoto({
      quality: 85,
      allowEditing: false,
      resultType: CameraResultType.DataUrl,
      source: CameraSource.Prompt, // Let user choose camera or gallery
      width: 1200,
      correctOrientation: true,
    });
    return { dataUrl: photo.dataUrl, format: photo.format };
  },

  async pickFromGallery() {
    if (!isNative()) return this.takePhoto(); // Same web fallback
    const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera');
    const photo = await Camera.getPhoto({
      quality: 85,
      allowEditing: false,
      resultType: CameraResultType.DataUrl,
      source: CameraSource.Photos,
      width: 1200,
      correctOrientation: true,
    });
    return { dataUrl: photo.dataUrl, format: photo.format };
  },
};

// ── 9. SHARE ────────────────────────────────────────────────────
const OBShare = {
  async share({ title, text, url, files }) {
    if (!isNative()) {
      if (navigator.share) {
        await navigator.share({ title, text, url });
        return { shared: true };
      }
      // Fallback: copy to clipboard
      await navigator.clipboard.writeText(url || text || '');
      return { shared: false, copied: true };
    }
    const { Share } = await import('@capacitor/share');
    const result = await Share.share({ title, text, url, files });
    return { shared: true, activityType: result.activityType };
  },
};

// ── 10. NETWORK STATUS ──────────────────────────────────────────
const OBNetwork = {
  async getStatus() {
    if (!isNative()) {
      return { connected: navigator.onLine, connectionType: navigator.onLine ? 'wifi' : 'none' };
    }
    const { Network } = await import('@capacitor/network');
    const status = await Network.getStatus();
    return { connected: status.connected, connectionType: status.connectionType };
  },

  async onStatusChange(callback) {
    if (!isNative()) {
      window.addEventListener('online', () => callback({ connected: true, connectionType: 'wifi' }));
      window.addEventListener('offline', () => callback({ connected: false, connectionType: 'none' }));
      return;
    }
    const { Network } = await import('@capacitor/network');
    Network.addListener('networkStatusChange', callback);
  },
};

// ── 11. SQLITE (Offline-first persistence) ──────────────────────
const OBDatabase = {
  _db: null,

  async init() {
    if (!isNative()) return false;
    try {
      const { CapacitorSQLite } = await import('@capacitor-community/sqlite');
      await CapacitorSQLite.createConnection({ database: 'obubba', version: 1, encrypted: false, mode: 'no-encryption' });
      await CapacitorSQLite.open({ database: 'obubba' });

      // Create tables
      await CapacitorSQLite.execute({
        database: 'obubba',
        statements: `
          CREATE TABLE IF NOT EXISTS entries (
            id TEXT PRIMARY KEY,
            date TEXT NOT NULL,
            type TEXT NOT NULL,
            data TEXT NOT NULL,
            synced INTEGER DEFAULT 0,
            updated_at INTEGER DEFAULT 0
          );
          CREATE TABLE IF NOT EXISTS children (
            id TEXT PRIMARY KEY,
            data TEXT NOT NULL,
            synced INTEGER DEFAULT 0
          );
          CREATE TABLE IF NOT EXISTS milestones (
            id TEXT PRIMARY KEY,
            child_id TEXT,
            data TEXT NOT NULL,
            synced INTEGER DEFAULT 0
          );
          CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
          );
          CREATE INDEX IF NOT EXISTS idx_entries_date ON entries(date);
          CREATE INDEX IF NOT EXISTS idx_entries_type ON entries(type);
          CREATE INDEX IF NOT EXISTS idx_entries_synced ON entries(synced);
        `,
      });
      this._db = true;
      return true;
    } catch (e) {
      console.warn('SQLite init failed:', e);
      return false;
    }
  },

  async put(table, id, data) {
    if (!this._db) return;
    const { CapacitorSQLite } = await import('@capacitor-community/sqlite');
    const json = JSON.stringify(data);
    await CapacitorSQLite.run({
      database: 'obubba',
      statement: `INSERT OR REPLACE INTO ${table} (id, data, synced) VALUES (?, ?, 0)`,
      values: [id, json],
    });
  },

  async get(table, id) {
    if (!this._db) return null;
    const { CapacitorSQLite } = await import('@capacitor-community/sqlite');
    const result = await CapacitorSQLite.query({
      database: 'obubba',
      statement: `SELECT data FROM ${table} WHERE id = ?`,
      values: [id],
    });
    if (result.values && result.values.length > 0) {
      return JSON.parse(result.values[0].data);
    }
    return null;
  },

  async getAll(table) {
    if (!this._db) return [];
    const { CapacitorSQLite } = await import('@capacitor-community/sqlite');
    const result = await CapacitorSQLite.query({
      database: 'obubba',
      statement: `SELECT id, data FROM ${table}`,
      values: [],
    });
    return (result.values || []).map((r) => ({ id: r.id, ...JSON.parse(r.data) }));
  },
};

// ── 12. SIRI SHORTCUTS (iOS) ────────────────────────────────────
// Siri integration uses native Swift code (see ios/App/SiriIntents/)
// This bridge communicates with the native Siri handler
const OBSiri = {
  async donateShortcut({ id, title, phrase }) {
    if (getPlatform() !== 'ios') return;
    // Call native Swift bridge via Capacitor plugin message
    try {
      await window.Capacitor.Plugins.OBSiriShortcuts.donate({
        activityType: `com.obubba.app.${id}`,
        title,
        suggestedPhrase: phrase,
        isEligibleForSearch: true,
        isEligibleForPrediction: true,
      });
    } catch {}
  },

  async donateAllShortcuts() {
    const shortcuts = [
      { id: 'log_feed', title: 'Log a Feed', phrase: 'Log a feed in OBubba' },
      { id: 'log_sleep', title: 'Log Sleep', phrase: 'Log sleep in OBubba' },
      { id: 'log_nappy', title: 'Log a Nappy', phrase: 'Log a nappy in OBubba' },
      { id: 'start_feed_timer', title: 'Start Feed Timer', phrase: 'Start feed timer' },
      { id: 'start_sleep_timer', title: 'Start Sleep Timer', phrase: 'Start sleep timer' },
      { id: 'baby_summary', title: 'Baby Summary', phrase: "How's baby doing?" },
      { id: 'last_feed', title: 'Last Feed', phrase: 'When was the last feed?' },
      { id: 'log_temperature', title: 'Log Temperature', phrase: 'Log baby temperature' },
      { id: 'log_medicine', title: 'Log Medicine', phrase: 'Log baby medicine' },
    ];
    for (const s of shortcuts) {
      await this.donateShortcut(s);
    }
  },
};

// ── 13. WIDGETS (iOS WidgetKit + Android Glance) ────────────────
// Widgets use native code but we provide data through shared storage
const OBWidgets = {
  async updateWidgetData() {
    if (!isNative()) return;
    // Collect current baby data for widget display
    try {
      const activeChild = localStorage.getItem('active_child');
      const childrenRaw = localStorage.getItem('children_v1');
      const entriesRaw = localStorage.getItem('babyTracker_v6');
      if (!childrenRaw) return;

      const children = JSON.parse(childrenRaw);
      const child = activeChild ? children[activeChild] : Object.values(children)[0];
      if (!child) return;

      const today = new Date().toISOString().slice(0, 10);
      const entries = entriesRaw ? JSON.parse(entriesRaw) : {};
      const todayEntries = entries[today] || [];

      // Calculate summary for widget
      const feeds = todayEntries.filter((e) => e.type === 'feed');
      const sleeps = todayEntries.filter((e) => e.type === 'sleep' || e.type === 'nap');
      const nappies = todayEntries.filter((e) => e.type === 'nappy');
      const lastFeed = feeds.length > 0 ? feeds[feeds.length - 1] : null;
      const lastSleep = sleeps.length > 0 ? sleeps[sleeps.length - 1] : null;

      const widgetData = {
        babyName: child.name || 'Baby',
        feedCount: feeds.length,
        sleepCount: sleeps.length,
        nappyCount: nappies.length,
        lastFeedTime: lastFeed ? lastFeed.time : null,
        lastFeedType: lastFeed ? lastFeed.subtype : null,
        lastSleepTime: lastSleep ? lastSleep.time : null,
        nextFeedEstimate: null, // App calculates predictions
        theme: localStorage.getItem('theme_v1') || 'light',
        updatedAt: Date.now(),
      };

      // Write to shared UserDefaults (iOS) / SharedPreferences (Android)
      if (getPlatform() === 'ios') {
        await window.Capacitor.Plugins.OBWidgetBridge.setData({ json: JSON.stringify(widgetData) });
      } else if (getPlatform() === 'android') {
        await window.Capacitor.Plugins.OBWidgetBridge.setData({ json: JSON.stringify(widgetData) });
      }
    } catch (e) {
      console.warn('Widget update failed:', e);
    }
  },

  async reloadWidgets() {
    if (!isNative()) return;
    try {
      await window.Capacitor.Plugins.OBWidgetBridge.reloadAll();
    } catch {}
  },
};

// ── 14. LIVE ACTIVITIES (iOS) ───────────────────────────────────
const OBLiveActivity = {
  async startTimer({ type, startTime, babyName, side }) {
    if (getPlatform() !== 'ios') return;
    try {
      await window.Capacitor.Plugins.OBLiveActivity.start({
        type, // 'feed' or 'sleep'
        startTime: startTime || Date.now(),
        babyName: babyName || 'Baby',
        side: side || null, // 'left' or 'right' for breastfeeding
      });
    } catch {}
  },

  async updateTimer({ elapsed, side }) {
    if (getPlatform() !== 'ios') return;
    try {
      await window.Capacitor.Plugins.OBLiveActivity.update({ elapsed, side });
    } catch {}
  },

  async stopTimer() {
    if (getPlatform() !== 'ios') return;
    try {
      await window.Capacitor.Plugins.OBLiveActivity.stop();
    } catch {}
  },
};

// ── 15. HEALTHKIT (iOS) / GOOGLE FIT (Android) ──────────────────
const OBHealth = {
  async isAvailable() {
    if (!isNative()) return false;
    try {
      if (getPlatform() === 'ios') {
        return await window.Capacitor.Plugins.OBHealthKit.isAvailable();
      }
      return false; // Google Fit requires separate setup
    } catch { return false; }
  },

  async requestPermission() {
    if (!isNative()) return false;
    try {
      await window.Capacitor.Plugins.OBHealthKit.requestAuthorization({
        read: ['weight', 'height'],
        write: ['weight', 'height'],
      });
      return true;
    } catch { return false; }
  },

  async saveWeight({ kg, date }) {
    if (!isNative()) return;
    try {
      await window.Capacitor.Plugins.OBHealthKit.saveWeight({ kg, date });
    } catch {}
  },

  async saveHeight({ cm, date }) {
    if (!isNative()) return;
    try {
      await window.Capacitor.Plugins.OBHealthKit.saveHeight({ cm, date });
    } catch {}
  },
};

// ── 16. SPEECH RECOGNITION (Voice Logging) ──────────────────────
const OBSpeech = {
  async isAvailable() {
    if (!isNative()) {
      return 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;
    }
    try {
      const { SpeechRecognition } = await import('@capacitor-community/speech-recognition');
      const result = await SpeechRecognition.available();
      return result.available;
    } catch { return false; }
  },

  async listen(language = 'en-GB') {
    if (!isNative()) {
      // Web Speech API fallback
      return new Promise((resolve, reject) => {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) return reject(new Error('Not supported'));
        const recognition = new SpeechRecognition();
        recognition.lang = language;
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.onresult = (e) => resolve(e.results[0][0].transcript);
        recognition.onerror = (e) => reject(e.error);
        recognition.start();
      });
    }
    const { SpeechRecognition } = await import('@capacitor-community/speech-recognition');
    await SpeechRecognition.requestPermission();
    const result = await SpeechRecognition.start({ language, popup: false });
    return result.matches?.[0] || '';
  },

  async stop() {
    if (!isNative()) return;
    const { SpeechRecognition } = await import('@capacitor-community/speech-recognition');
    await SpeechRecognition.stop();
  },
};

// ── 17. APP LIFECYCLE ───────────────────────────────────────────
const OBAppLifecycle = {
  async onResume(callback) {
    if (!isNative()) {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') callback();
      });
      return;
    }
    const { App } = await import('@capacitor/app');
    App.addListener('appStateChange', (state) => {
      if (state.isActive) callback();
    });
  },

  async onPause(callback) {
    if (!isNative()) {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') callback();
      });
      return;
    }
    const { App } = await import('@capacitor/app');
    App.addListener('appStateChange', (state) => {
      if (!state.isActive) callback();
    });
  },

  async onBackButton(callback) {
    if (!isNative()) return;
    const { App } = await import('@capacitor/app');
    App.addListener('backButton', callback);
  },

  async onUrlOpen(callback) {
    if (!isNative()) return;
    const { App } = await import('@capacitor/app');
    App.addListener('appUrlOpen', (data) => {
      callback(data.url);
    });
  },
};

// ── 18. SCREEN ORIENTATION ──────────────────────────────────────
const OBScreen = {
  async lockPortrait() {
    if (!isNative()) return;
    try {
      const { ScreenOrientation } = await import('@capacitor/screen-orientation');
      await ScreenOrientation.lock({ orientation: 'portrait' });
    } catch {}
  },
};

// ── 19. STATUS BAR ──────────────────────────────────────────────
const OBStatusBar = {
  async setStyle(isDark) {
    if (!isNative()) return;
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    await StatusBar.setStyle({ style: isDark ? Style.Dark : Style.Light });
    if (getPlatform() === 'android') {
      await StatusBar.setBackgroundColor({ color: isDark ? '#080e1c' : '#F0DDD6' });
    }
  },
  async hide() {
    if (!isNative()) return;
    const { StatusBar } = await import('@capacitor/status-bar');
    await StatusBar.hide();
  },
  async show() {
    if (!isNative()) return;
    const { StatusBar } = await import('@capacitor/status-bar');
    await StatusBar.show();
  },
};

// ── 20. PREFERENCES (Key-Value, replaces localStorage on native) ─
const OBPreferences = {
  async get(key) {
    if (!isNative()) return localStorage.getItem(key);
    const { Preferences } = await import('@capacitor/preferences');
    const result = await Preferences.get({ key });
    return result.value;
  },
  async set(key, value) {
    if (!isNative()) { localStorage.setItem(key, value); return; }
    const { Preferences } = await import('@capacitor/preferences');
    await Preferences.set({ key, value });
  },
  async remove(key) {
    if (!isNative()) { localStorage.removeItem(key); return; }
    const { Preferences } = await import('@capacitor/preferences');
    await Preferences.remove({ key });
  },
};

// ── EXPORT ALL ──────────────────────────────────────────────────
window.OBNative = {
  isNative,
  getPlatform,
  haptics: OBHaptics,
  biometric: OBBiometric,
  appleSignIn: OBAppleSignIn,
  googleSignIn: OBGoogleSignIn,
  push: OBPushNotifications,
  localNotifications: OBLocalNotifications,
  shortcuts: OBAppShortcuts,
  camera: OBCamera,
  share: OBShare,
  network: OBNetwork,
  database: OBDatabase,
  siri: OBSiri,
  widgets: OBWidgets,
  liveActivity: OBLiveActivity,
  health: OBHealth,
  speech: OBSpeech,
  lifecycle: OBAppLifecycle,
  screen: OBScreen,
  statusBar: OBStatusBar,
  preferences: OBPreferences,
};

// ── AUTO-INIT on native ─────────────────────────────────────────
if (isNative()) {
  (async () => {
    try {
      // Lock to portrait
      await OBScreen.lockPortrait();
      // Init SQLite
      await OBDatabase.init();
      // Create Android notification channels
      await OBLocalNotifications.createChannels();
      // Set up app shortcuts
      await OBAppShortcuts.set([
        { id: 'log_feed', title: 'Log Feed', description: 'Quickly log a feed' },
        { id: 'log_sleep', title: 'Log Sleep', description: 'Log sleep or nap' },
        { id: 'log_nappy', title: 'Log Nappy', description: 'Log a nappy change' },
        { id: 'start_timer', title: 'Start Timer', description: 'Start feed or sleep timer' },
      ]);
      // Donate Siri shortcuts
      if (getPlatform() === 'ios') {
        await OBSiri.donateAllShortcuts();
      }
      // Update widget data
      await OBWidgets.updateWidgetData();
    } catch (e) {
      console.warn('Native init error:', e);
    }
  })();
}

})();
