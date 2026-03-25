// ══════════════════════════════════════════════════════════════════
// OBubba Native Plugin Bridge
// Unified API for all Capacitor native features
// Uses window.Capacitor.Plugins directly (no bundler needed)
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

// Helper to safely get a Capacitor plugin
const cap = (name) => {
  try { return window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins[name]; }
  catch { return null; }
};

// ── 1. HAPTICS ──────────────────────────────────────────────────
const OBHaptics = {
  async impact(style = 'Medium') {
    if (!isNative()) {
      if (navigator.vibrate) navigator.vibrate(style === 'Heavy' ? 30 : style === 'Light' ? 5 : 15);
      return;
    }
    const p = cap('Haptics');
    if (p) await p.impact({ style });
  },
  async notification(type = 'Success') {
    if (!isNative()) return;
    const p = cap('Haptics');
    if (p) await p.notification({ type });
  },
  async selectionStart() {
    if (!isNative()) return;
    const p = cap('Haptics');
    if (p) await p.selectionStart();
  },
  async selectionChanged() {
    if (!isNative()) return;
    const p = cap('Haptics');
    if (p) await p.selectionChanged();
  },
  async selectionEnd() {
    if (!isNative()) return;
    const p = cap('Haptics');
    if (p) await p.selectionEnd();
  },
};

// ── 2. BIOMETRIC AUTH (Face ID / Touch ID / Fingerprint) ────────
const OBBiometric = {
  async isAvailable() {
    if (!isNative()) return { available: false, type: 'none' };
    try {
      const p = cap('BiometricAuth');
      if (!p) return { available: false, type: 'none' };
      const result = await p.checkBiometry();
      return {
        available: result.isAvailable,
        type: result.biometryType,
        reason: result.reason,
      };
    } catch { return { available: false, type: 'none' }; }
  },
  async authenticate(reason = 'Verify your identity') {
    if (!isNative()) return { success: false, error: 'not_native' };
    try {
      const p = cap('BiometricAuth');
      if (!p) return { success: false, error: 'not_available' };
      await p.authenticate({ reason, allowDeviceCredential: true });
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
      const p = cap('SignInWithApple');
      if (!p) return { success: false, error: 'plugin_not_found' };
      const result = await p.authorize({
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
      const p = cap('GoogleAuth');
      if (!p) return { success: false, error: 'plugin_not_found' };
      await p.initialize({
        clientId: 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com',
        scopes: ['profile', 'email'],
      });
      const result = await p.signIn();
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
      const p = cap('GoogleAuth');
      if (p) await p.signOut();
    } catch(e) { console.warn('[OBubba Native]', e.message || e); }
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
    const p = cap('PushNotifications');
    if (!p) return { granted: false };
    const perm = await p.requestPermissions();
    return { granted: perm.receive === 'granted' };
  },

  async register() {
    if (!isNative()) return { token: null };
    const p = cap('PushNotifications');
    if (!p) return { token: null };
    await p.register();
    return new Promise((resolve) => {
      p.addListener('registration', (token) => {
        resolve({ token: token.value });
      });
      p.addListener('registrationError', (err) => {
        resolve({ token: null, error: err.error });
      });
    });
  },

  async onNotificationReceived(callback) {
    if (!isNative()) return;
    const p = cap('PushNotifications');
    if (!p) return;
    const listener = await p.addListener('pushNotificationReceived', callback);
    this._listeners.push(listener);
  },

  async onNotificationTapped(callback) {
    if (!isNative()) return;
    const p = cap('PushNotifications');
    if (!p) return;
    const listener = await p.addListener('pushNotificationActionPerformed', (action) => {
      callback(action.notification, action.actionId);
    });
    this._listeners.push(listener);
  },

  async setBadgeCount(count) {
    try {
      const p = cap('Badge');
      if (p) await p.set({ count });
    } catch(e) { console.warn('[OBubba Native]', e.message || e); }
  },

  async clearBadge() {
    try {
      const p = cap('Badge');
      if (p) await p.clear();
    } catch(e) { console.warn('[OBubba Native]', e.message || e); }
  },
};

// ── 6. LOCAL NOTIFICATIONS ──────────────────────────────────────
const OBLocalNotifications = {
  async schedule({ id, title, body, scheduleAt, extra, channelId }) {
    if (!isNative()) {
      if ('Notification' in window && Notification.permission === 'granted') {
        const delay = new Date(scheduleAt).getTime() - Date.now();
        if (delay > 0 && delay < 86400000) {
          setTimeout(() => new Notification(title, { body, icon: '/icons/icon-192.png', data: extra }), delay);
        }
      }
      return;
    }
    const p = cap('LocalNotifications');
    if (!p) return;
    await p.schedule({
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
    const p = cap('LocalNotifications');
    if (!p) return;
    const pending = await p.getPending();
    if (pending.notifications.length > 0) {
      await p.cancel(pending);
    }
  },

  async createChannels() {
    if (getPlatform() !== 'android') return;
    const p = cap('LocalNotifications');
    if (!p) return;
    await p.createChannel({
      id: 'obubba_reminders',
      name: 'Reminders',
      description: 'Feed, sleep, and medicine reminders',
      importance: 4,
      sound: 'notification.wav',
      vibration: true,
    });
    await p.createChannel({
      id: 'obubba_timers',
      name: 'Active Timers',
      description: 'Running feed and sleep timers',
      importance: 3,
      sound: null,
      vibration: false,
    });
    await p.createChannel({
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
      const p = cap('AppShortcuts');
      if (!p) return;
      await p.set({
        shortcuts: shortcuts.map((s) => ({
          id: s.id,
          title: s.title,
          description: s.description || '',
          iconName: s.icon || undefined,
        })),
      });
    } catch(e) { console.warn('[OBubba Native]', e.message || e); }
  },

  async onShortcutUsed(callback) {
    if (!isNative()) return;
    try {
      const p = cap('AppShortcuts');
      if (!p) return;
      p.addListener('shortcut', (event) => {
        callback(event.shortcutId);
      });
    } catch(e) { console.warn('[OBubba Native]', e.message || e); }
  },
};

// ── 8. CAMERA ───────────────────────────────────────────────────
const OBCamera = {
  async takePhoto() {
    if (!isNative()) {
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
    const p = cap('Camera');
    if (!p) return null;
    const photo = await p.getPhoto({
      quality: 85,
      allowEditing: false,
      resultType: 'dataUrl',
      source: 'prompt',
      width: 1200,
      correctOrientation: true,
    });
    return { dataUrl: photo.dataUrl, format: photo.format };
  },

  async pickFromGallery() {
    if (!isNative()) return this.takePhoto();
    const p = cap('Camera');
    if (!p) return null;
    const photo = await p.getPhoto({
      quality: 85,
      allowEditing: false,
      resultType: 'dataUrl',
      source: 'photos',
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
      await navigator.clipboard.writeText(url || text || '');
      return { shared: false, copied: true };
    }
    const p = cap('Share');
    if (!p) return { shared: false };
    const result = await p.share({ title, text, url, files });
    return { shared: true, activityType: result.activityType };
  },
};

// ── 10. NETWORK STATUS ──────────────────────────────────────────
const OBNetwork = {
  async getStatus() {
    if (!isNative()) {
      return { connected: navigator.onLine, connectionType: navigator.onLine ? 'wifi' : 'none' };
    }
    const p = cap('Network');
    if (!p) return { connected: navigator.onLine, connectionType: 'unknown' };
    const status = await p.getStatus();
    return { connected: status.connected, connectionType: status.connectionType };
  },

  async onStatusChange(callback) {
    if (!isNative()) {
      window.addEventListener('online', () => callback({ connected: true, connectionType: 'wifi' }));
      window.addEventListener('offline', () => callback({ connected: false, connectionType: 'none' }));
      return;
    }
    const p = cap('Network');
    if (p) p.addListener('networkStatusChange', callback);
  },
};

// ── 11. SQLITE (Offline-first persistence) ──────────────────────
const OBDatabase = {
  _db: null,

  async init() {
    if (!isNative()) return false;
    try {
      const p = cap('CapacitorSQLite');
      if (!p) return false;
      await p.createConnection({ database: 'obubba', version: 1, encrypted: false, mode: 'no-encryption' });
      await p.open({ database: 'obubba' });

      await p.execute({
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
    const p = cap('CapacitorSQLite');
    if (!p) return;
    const json = JSON.stringify(data);
    await p.run({
      database: 'obubba',
      statement: `INSERT OR REPLACE INTO ${table} (id, data, synced) VALUES (?, ?, 0)`,
      values: [id, json],
    });
  },

  async get(table, id) {
    if (!this._db) return null;
    const p = cap('CapacitorSQLite');
    if (!p) return null;
    const result = await p.query({
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
    const p = cap('CapacitorSQLite');
    if (!p) return [];
    const result = await p.query({
      database: 'obubba',
      statement: `SELECT id, data FROM ${table}`,
      values: [],
    });
    return (result.values || []).map((r) => ({ id: r.id, ...JSON.parse(r.data) }));
  },
};

// ── 12. SIRI SHORTCUTS (iOS) ────────────────────────────────────
const OBSiri = {
  async donateShortcut({ id, title, phrase }) {
    if (getPlatform() !== 'ios') return;
    try {
      const p = cap('OBSiriShortcuts');
      if (!p) return;
      await p.donate({
        activityType: `com.obubba.app.${id}`,
        title,
        suggestedPhrase: phrase,
        isEligibleForSearch: true,
        isEligibleForPrediction: true,
      });
    } catch(e) { console.warn('[OBubba Native]', e.message || e); }
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

  async checkPendingEntry() {
    if (getPlatform() !== 'ios') return null;
    try {
      const p = cap('OBSiriShortcuts');
      if (!p) return null;
      return await p.checkPendingEntry();
    } catch(e) { console.warn('[OBubba Native]', e.message || e); return null; }
  },
};

// ── 13. WIDGETS (iOS WidgetKit + Android Glance) ────────────────
const OBWidgets = {
  async updateWidgetData() {
    if (!isNative()) return;
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
        nextFeedEstimate: null,
        theme: localStorage.getItem('theme_v1') || 'light',
        updatedAt: Date.now(),
      };

      const p = cap('OBWidgetBridge');
      if (p) await p.setData({ json: JSON.stringify(widgetData) });
    } catch (e) {
      console.warn('Widget update failed:', e);
    }
  },

  async reloadWidgets() {
    if (!isNative()) return;
    try {
      const p = cap('OBWidgetBridge');
      if (p) await p.reloadAll();
    } catch(e) { console.warn('[OBubba Native]', e.message || e); }
  },
};

// ── 14. LIVE ACTIVITIES (iOS) ───────────────────────────────────
const OBLiveActivity = {
  async startTimer({ type, startTime, babyName, side }) {
    if (getPlatform() !== 'ios') return;
    try {
      const p = cap('OBLiveActivity');
      if (!p) return;
      await p.start({
        type,
        startTime: startTime || Date.now(),
        babyName: babyName || 'Baby',
        side: side || null,
      });
    } catch(e) { console.warn('[OBubba Native]', e.message || e); }
  },

  async updateTimer({ elapsed, side }) {
    if (getPlatform() !== 'ios') return;
    try {
      const p = cap('OBLiveActivity');
      if (p) await p.update({ elapsed, side });
    } catch(e) { console.warn('[OBubba Native]', e.message || e); }
  },

  async stopTimer() {
    if (getPlatform() !== 'ios') return;
    try {
      const p = cap('OBLiveActivity');
      if (p) await p.stop();
    } catch(e) { console.warn('[OBubba Native]', e.message || e); }
  },
};

// ── 15. HEALTHKIT (iOS) / GOOGLE FIT (Android) ──────────────────
const OBHealth = {
  async isAvailable() {
    if (!isNative()) return false;
    try {
      if (getPlatform() === 'ios') {
        const p = cap('OBHealthKit');
        if (!p) return false;
        return await p.isAvailable();
      }
      return false;
    } catch { return false; }
  },

  async requestPermission() {
    if (!isNative()) return false;
    try {
      const p = cap('OBHealthKit');
      if (!p) return false;
      await p.requestAuthorization({
        read: ['weight', 'height'],
        write: ['weight', 'height'],
      });
      return true;
    } catch { return false; }
  },

  async saveWeight({ kg, date }) {
    if (!isNative()) return;
    try {
      const p = cap('OBHealthKit');
      if (p) await p.saveWeight({ kg, date });
    } catch(e) { console.warn('[OBubba Native]', e.message || e); }
  },

  async saveHeight({ cm, date }) {
    if (!isNative()) return;
    try {
      const p = cap('OBHealthKit');
      if (p) await p.saveHeight({ cm, date });
    } catch(e) { console.warn('[OBubba Native]', e.message || e); }
  },
};

// ── 16. SPEECH RECOGNITION (Voice Logging) ──────────────────────
const OBSpeech = {
  async isAvailable() {
    if (!isNative()) {
      return 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;
    }
    try {
      const p = cap('SpeechRecognition');
      if (!p) return false;
      const result = await p.available();
      return result.available;
    } catch { return false; }
  },

  async listen(language = 'en-GB') {
    if (!isNative()) {
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
    const p = cap('SpeechRecognition');
    if (!p) return '';
    await p.requestPermission();
    const result = await p.start({ language, popup: false });
    return result.matches?.[0] || '';
  },

  async stop() {
    if (!isNative()) return;
    const p = cap('SpeechRecognition');
    if (p) await p.stop();
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
    const p = cap('App');
    if (p) p.addListener('appStateChange', (state) => {
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
    const p = cap('App');
    if (p) p.addListener('appStateChange', (state) => {
      if (!state.isActive) callback();
    });
  },

  async onBackButton(callback) {
    if (!isNative()) return;
    const p = cap('App');
    if (p) p.addListener('backButton', callback);
  },

  async onUrlOpen(callback) {
    if (!isNative()) return;
    const p = cap('App');
    if (p) p.addListener('appUrlOpen', (data) => {
      callback(data.url);
    });
  },
};

// ── 18. SCREEN ORIENTATION ──────────────────────────────────────
const OBScreen = {
  async lockPortrait() {
    if (!isNative()) return;
    try {
      const p = cap('ScreenOrientation');
      if (p) await p.lock({ orientation: 'portrait' });
    } catch(e) { console.warn('[OBubba Native]', e.message || e); }
  },
};

// ── 19. STATUS BAR ──────────────────────────────────────────────
const OBStatusBar = {
  async setStyle(isDark) {
    if (!isNative()) return;
    try {
      const p = cap('StatusBar');
      if (!p) return;
      await p.setStyle({ style: isDark ? 'DARK' : 'LIGHT' });
      if (getPlatform() === 'android') {
        await p.setBackgroundColor({ color: isDark ? '#080e1c' : '#F0DDD6' });
      }
    } catch(e) { console.warn('[OBubba Native]', e.message || e); }
  },
  async hide() {
    if (!isNative()) return;
    try {
      const p = cap('StatusBar');
      if (p) await p.hide();
    } catch(e) { console.warn('[OBubba Native]', e.message || e); }
  },
  async show() {
    if (!isNative()) return;
    try {
      const p = cap('StatusBar');
      if (p) await p.show();
    } catch(e) { console.warn('[OBubba Native]', e.message || e); }
  },
};

// ── 20. PREFERENCES (Key-Value, replaces localStorage on native) ─
const OBPreferences = {
  async get(key) {
    if (!isNative()) return localStorage.getItem(key);
    const p = cap('Preferences');
    if (!p) return localStorage.getItem(key);
    const result = await p.get({ key });
    return result.value;
  },
  async set(key, value) {
    if (!isNative()) { localStorage.setItem(key, value); return; }
    const p = cap('Preferences');
    if (!p) { localStorage.setItem(key, value); return; }
    await p.set({ key, value });
  },
  async remove(key) {
    if (!isNative()) { localStorage.removeItem(key); return; }
    const p = cap('Preferences');
    if (!p) { localStorage.removeItem(key); return; }
    await p.remove({ key });
  },
};

// ── Set global native flag used by app.jsx ──────────────────────
window._isNative = isNative();

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

// ── DIAGNOSTICS — log native state for debugging ──────────────────
console.log('[OBubba] Native:', isNative(), '| Platform:', getPlatform());
if (typeof window !== 'undefined' && window.Capacitor) {
  console.log('[OBubba] Capacitor.Plugins:', Object.keys(window.Capacitor.Plugins || {}));
}

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
