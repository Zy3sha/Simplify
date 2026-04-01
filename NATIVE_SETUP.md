# OBubba — Native iOS & Android Setup Guide

Complete guide to building, configuring, and deploying OBubba as a fully native app on iOS and Android.

---

## Prerequisites

- **Node.js** 18+ and npm
- **Xcode** 15+ (for iOS)
- **Android Studio** Hedgehog+ (for Android)
- **CocoaPods** (`sudo gem install cocoapods`)
- **Apple Developer Account** ($99/yr)
- **Google Play Developer Account** ($25 one-time)

---

## 1. Initial Setup

```bash
# Install all dependencies
npm install

# Initialize Capacitor
npx cap init OBubba com.obubba.app --web-dir dist

# Build the web app
npm run build

# Add native platforms
npx cap add ios
npx cap add android

# Sync web assets to native projects
npx cap sync
```

---

## 2. iOS Configuration (Xcode)

### Open in Xcode
```bash
npx cap open ios
```

### Required Xcode Setup

#### Signing & Capabilities
1. Select the **OBubba** target
2. Set **Team** to your Apple Developer account
3. Set **Bundle Identifier** to `com.obubba.app`
4. Add these capabilities:
   - **Push Notifications**
   - **Sign in with Apple**
   - **App Groups** → `group.com.obubba.app`

   - **Siri**
   - **Associated Domains** → `applinks:obubba.com`, `activitycontinuation:obubba.com`
   - **Background Modes** → Remote notifications, Background fetch, Audio

#### Add Widget Extension
1. File → New → Target → **Widget Extension**
2. Name: `OBubbaWidgets`
3. Copy files from `ios/App/OBubba/Widgets/` into the extension target
4. Add to the same **App Group**: `group.com.obubba.app`

#### Add Siri Intent Extension
1. File → New → Target → **Intents Extension**
2. Name: `OBubbaSiriIntents`
3. Copy files from `ios/App/OBubba/SiriIntents/`
4. Add to the same **App Group**: `group.com.obubba.app`

#### Add Share Extension
1. File → New → Target → **Share Extension**
2. Name: `OBubbaShare`
3. Copy `ios/App/OBubba/ShareExtension/ShareViewController.swift`
4. Add to the same **App Group**: `group.com.obubba.app`

#### Add Live Activity Support
1. Ensure the Widget extension includes `OBubbaTimerAttributes.swift`
2. Enable **Supports Live Activities** in the Widget Extension's Info.plist
3. Add `NSSupportsLiveActivities = YES` to the main app Info.plist

#### Register Custom Capacitor Plugins
In `AppDelegate.swift`, register the native plugins:
```swift
import Capacitor

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {
    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Plugins are auto-registered via CAPBridgedPlugin
        return true
    }
}
```

#### Configure Info.plist
Copy the permissions from `ios/App/OBubba/Info.plist` to your Xcode project's Info.plist, or replace it entirely.

#### Configure Entitlements
Copy `ios/App/OBubba/OBubba.entitlements` to your project and select it in Build Settings → Code Signing Entitlements.

---

## 3. Android Configuration (Android Studio)

### Open in Android Studio
```bash
npx cap open android
```

### Required Setup

#### Merge AndroidManifest.xml
Merge the contents of `android/app/src/main/AndroidManifest.xml` with the Capacitor-generated manifest. Key additions:
- Permissions (camera, biometric, notifications, audio, etc.)
- Widget receiver declaration
- App Shortcuts metadata
- FCM service declaration
- Deep link intent filters

#### Register Custom Plugins
In `MainActivity.kt`:
```kotlin
import com.obubba.app.plugins.WidgetBridgePlugin

class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        registerPlugin(WidgetBridgePlugin::class.java)
        super.onCreate(savedInstanceState)
    }
}
```

#### Add Widget Resources
1. Copy `android/app/src/main/res/layout/widget_summary.xml`
2. Copy `android/app/src/main/res/xml/widget_summary_info.xml`
3. Copy `android/app/src/main/res/xml/shortcuts.xml`
4. Copy drawable resources (`widget_background.xml`, `widget_button_bg.xml`)
5. Add icon drawables: `ic_feed.xml`, `ic_sleep.xml`, `ic_nappy.xml`, `ic_timer.xml`, `ic_notification.xml`

#### Firebase Setup
1. Go to [Firebase Console](https://console.firebase.google.com)
2. Add Android app with package `com.obubba.app`
3. Download `google-services.json` → place in `android/app/`
4. Add Firebase dependencies to `build.gradle`

#### App Links
1. Update `assetlinks.json` with your signing key SHA256:
   ```bash
   keytool -list -v -keystore your-keystore.jks | grep SHA256
   ```
2. Host the updated file at `https://obubba.com/.well-known/assetlinks.json`

---

## 4. Push Notifications Setup

### iOS (APNs)
1. Apple Developer → Certificates → Create **APNs Key** (.p8 file)
2. Upload the key to Firebase Console → Project Settings → Cloud Messaging → iOS
3. Note the **Key ID** and **Team ID**

### Android (FCM)
1. Firebase Console → Project Settings → Cloud Messaging
2. FCM is auto-configured via `google-services.json`

### Server-Side
Send push notifications via Firebase Cloud Functions or your backend:
```javascript
const admin = require('firebase-admin');
await admin.messaging().send({
  token: deviceToken,
  notification: {
    title: 'OBubba Reminder',
    body: 'Time for baby\'s next feed!',
  },
  data: { action: 'log_feed' },
});
```

---

## 5. Sign in with Apple

1. Apple Developer → Identifiers → App IDs → Enable "Sign in with Apple"
2. Create a **Services ID** for web sign-in (redirect URI: `https://obubba.com/auth/apple/callback`)
3. The iOS app uses native Sign in with Apple (no additional configuration needed beyond the capability)

---

## 6. Google Sign-In

1. Google Cloud Console → Credentials → Create **OAuth 2.0 Client ID**
2. Create separate client IDs for iOS and Android
3. For Android, use your app's SHA-1 signing key
4. Update `native-plugins.js` line with your Google Client ID:
   ```javascript
   clientId: 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com'
   ```

---

## 7. Siri Shortcuts

### Automatic Donation
The app automatically donates shortcuts when launched natively. Users can then:
- Open the **Shortcuts** app and add OBubba shortcuts
- Say "Hey Siri, log a feed in OBubba"

### Supported Voice Commands
| Command | Action |
|---------|--------|
| "Log a feed in OBubba" | Opens feed log |
| "Log sleep in OBubba" | Opens sleep log |
| "Log a nappy in OBubba" | Opens nappy log |
| "Start feed timer" | Starts breastfeed timer |
| "Start sleep timer" | Starts nap timer |
| "How's baby doing?" | Shows baby summary |
| "When was the last feed?" | Shows last feed time |
| "Log baby temperature" | Opens temperature log |
| "Log baby medicine" | Opens medicine log |

---

## 9. Widgets

### iOS Widgets
- **Small (2×2)**: Baby name + feed/nappy count + last feed time
- **Medium (4×2)**: Full summary with feeds, sleeps, nappies + next feed prediction
- **Lock Screen (Inline/Rectangular)**: Quick feed and sleep counts
- **Live Activity**: Active feed/sleep timer on Lock Screen + Dynamic Island

### Android Widgets
- **Summary Widget (4×2)**: Baby name, daily stats, last feed, quick action buttons

Both update every 15 minutes and immediately when data changes in the app.

---

## 10. Google Assistant (Android)

App Actions are configured via `shortcuts.xml`:
- "Hey Google, log a feed in OBubba"
- "Hey Google, open OBubba baby summary"

Submit the App Actions for review in Google Play Console → App Actions.

---

## 11. Building & Deploying

### iOS
```bash
npm run cap:build:ios
# Then in Xcode: Product → Archive → Distribute to App Store
```

### Android
```bash
npm run cap:build:android
# Then in Android Studio: Build → Generate Signed Bundle/APK
```

---

## 12. App Store Submission Checklist

### iOS App Store
- [ ] App icons (1024×1024 for App Store, all required sizes)
- [ ] Screenshots for iPhone 6.7", 6.5", 5.5" and iPad
- [ ] Privacy policy URL
- [ ] App privacy details (data types collected)

- [ ] Camera/microphone usage justification
- [ ] Age rating: 4+ (Health & Fitness)
- [ ] Category: Health & Fitness
- [ ] Keywords: baby tracker, feeding, sleep, naps, milestones

### Google Play Store
- [ ] App icon (512×512)
- [ ] Feature graphic (1024×500)
- [ ] Screenshots for phone and tablet
- [ ] Privacy policy URL
- [ ] Content rating questionnaire
- [ ] Target audience: Parents
- [ ] Category: Parenting
- [ ] App signing key uploaded to Play Console

---

## Architecture Overview

```
obubba.com (Web)
    ├── index.html          → Entry point
    ├── app.jsx             → React 18 SPA (main app logic)
    ├── native-plugins.js   → Unified native bridge (20 modules)
    ├── sw.js               → Service worker (offline + push)
    ├── firebase.js         → Firebase init
    ├── styles.css          → Glassmorphism design system
    ├── theme.js            → Auto dark/light mode
    └── loader.js           → JSX compiler + utilities

iOS Native (Capacitor)
    ├── Plugins/
    │   ├── SiriShortcutsPlugin.swift    → Siri integration
    │   ├── WidgetBridgePlugin.swift     → Widget data bridge
    │   ├── LiveActivityPlugin.swift     → Dynamic Island + Lock Screen

    ├── Widgets/
    │   └── OBubbaWidgets.swift          → Home + Lock Screen widgets
    ├── LiveActivity/
    │   └── OBubbaTimerAttributes.swift  → Live Activity model + UI
    ├── SiriIntents/
    │   └── IntentHandler.swift          → Voice command processing
    └── ShareExtension/
        └── ShareViewController.swift    → Photo sharing into app

Android Native (Capacitor)
    ├── plugins/
    │   └── WidgetBridgePlugin.kt        → Widget data bridge
    ├── widgets/
    │   └── OBubbaSummaryWidget.kt       → Home screen widget
    ├── shortcuts/
    │   └── AppShortcutsManager.kt       → App shortcuts + Assistant
    └── res/
        ├── layout/widget_summary.xml    → Widget layout
        └── xml/shortcuts.xml            → Static shortcuts + App Actions
```

---

## Native Plugin Bridge (native-plugins.js)

All 20 native modules accessible via `window.OBNative`:

| Module | Description |
|--------|-------------|
| `haptics` | Impact, notification, selection haptics |
| `biometric` | Face ID / Touch ID / Fingerprint auth |
| `appleSignIn` | Sign in with Apple |
| `googleSignIn` | Google Sign-In |
| `push` | Push notifications (APNs + FCM) |
| `localNotifications` | Scheduled local notifications |
| `shortcuts` | 3D Touch / long-press app shortcuts |
| `camera` | Photo capture + gallery picker |
| `share` | Native share sheet |
| `network` | Online/offline detection |
| `database` | SQLite offline persistence |
| `siri` | Siri Shortcuts donation |
| `widgets` | Widget data updates |
| `liveActivity` | Live Activity timer (iOS) |

| `speech` | Voice recognition for logging |
| `lifecycle` | App resume/pause/back/URL handlers |
| `screen` | Screen orientation lock |
| `statusBar` | Status bar style + color |
| `preferences` | Key-value storage (replaces localStorage) |

Each module falls back gracefully to web APIs when not running natively.
