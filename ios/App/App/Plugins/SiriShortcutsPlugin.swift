import Foundation
import Capacitor
import Intents
import CoreSpotlight
import MobileCoreServices
import AppIntents

/// Capacitor plugin that bridges Siri Shortcuts to the web layer.
/// Donates NSUserActivity items so iOS can suggest them in Siri, Spotlight, and the Shortcuts app.
@objc(OBSiriShortcuts)
public class SiriShortcutsPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "OBSiriShortcuts"
    public let jsName = "OBSiriShortcuts"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "donate", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "donateAll", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "checkPendingEntry", returnType: CAPPluginReturnPromise),
    ]

    private let appGroupId = "group.com.obubba.app"
    private static var siriRegistered = false

    public override func load() {
        super.load()
        // Register App Intents with Siri once (iOS 16.4+)
        if !SiriShortcutsPlugin.siriRegistered {
            SiriShortcutsPlugin.siriRegistered = true
            if #available(iOS 16.4, *) {
                OBubbaAppShortcuts.updateAppShortcutParameters()
                print("[OBSiriShortcuts] App Intents registered with Siri")
            }
        }
    }

    @objc func donate(_ call: CAPPluginCall) {
        guard let activityType = call.getString("activityType"),
              let title = call.getString("title") else {
            call.reject("activityType and title are required")
            return
        }

        let suggestedPhrase = call.getString("suggestedPhrase") ?? title
        let isSearch = call.getBool("isEligibleForSearch") ?? true
        let isPrediction = call.getBool("isEligibleForPrediction") ?? true

        let activity = NSUserActivity(activityType: activityType)
        activity.title = title
        activity.suggestedInvocationPhrase = suggestedPhrase
        activity.isEligibleForSearch = isSearch
        activity.isEligibleForPrediction = isPrediction
        activity.persistentIdentifier = activityType

        if #available(iOS 14.0, *) {
            let attrs = CSSearchableItemAttributeSet(contentType: .item)
            attrs.title = title
            attrs.contentDescription = "OBubba: \(title)"
            activity.contentAttributeSet = attrs
        }

        DispatchQueue.main.async {
            self.bridge?.viewController?.userActivity = activity
            activity.becomeCurrent()
        }

        call.resolve(["donated": true])
    }

    @objc func donateAll(_ call: CAPPluginCall) {
        let shortcuts: [(String, String, String)] = [
            ("com.obubba.app.log_feed", "Log a Feed", "Log a feed in OBubba"),
            ("com.obubba.app.log_sleep", "Log Sleep", "Log sleep in OBubba"),
            ("com.obubba.app.log_nappy", "Log a Nappy", "Log a nappy in OBubba"),
            ("com.obubba.app.start_feed_timer", "Start Feed Timer", "Start feed timer"),
            ("com.obubba.app.start_sleep_timer", "Start Sleep Timer", "Start sleep timer"),
            ("com.obubba.app.baby_summary", "Baby Summary", "How's baby doing?"),
            ("com.obubba.app.last_feed", "Last Feed", "When was the last feed?"),
            ("com.obubba.app.log_temperature", "Log Temperature", "Log baby temperature"),
            ("com.obubba.app.log_medicine", "Log Medicine", "Log baby medicine"),
        ]

        for (type, title, phrase) in shortcuts {
            let activity = NSUserActivity(activityType: type)
            activity.title = title
            activity.suggestedInvocationPhrase = phrase
            activity.isEligibleForSearch = true
            activity.isEligibleForPrediction = true
            activity.persistentIdentifier = type
            activity.becomeCurrent()
        }

        call.resolve(["count": shortcuts.count])
    }

    @objc func checkPendingEntry(_ call: CAPPluginCall) {
        guard let defaults = UserDefaults(suiteName: appGroupId) else {
            call.resolve(["entry": NSNull()])
            return
        }

        guard let json = defaults.string(forKey: "pendingSiriEntry") else {
            call.resolve(["entry": NSNull()])
            return
        }

        defaults.removeObject(forKey: "pendingSiriEntry")
        defaults.synchronize()

        call.resolve(["entry": json])
    }
}

// ══════════════════════════════════════════════════════════════════
// MARK: - Shared helpers
// ══════════════════════════════════════════════════════════════════

private let siriAppGroup = "group.com.obubba.app"

private func storePendingSiriEntry(_ dict: [String: Any]) {
    var entry = dict
    let df = DateFormatter()
    df.dateFormat = "HH:mm"
    entry["time"] = df.string(from: Date())
    guard let data = try? JSONSerialization.data(withJSONObject: entry),
          let json = String(data: data, encoding: .utf8),
          let defaults = UserDefaults(suiteName: siriAppGroup) else { return }
    defaults.set(json, forKey: "pendingSiriEntry")
    defaults.synchronize()
}

private func siriWidgetDict() -> [String: Any]? {
    guard let defaults = UserDefaults(suiteName: siriAppGroup),
          let json = defaults.string(forKey: "widgetData"),
          let data = json.data(using: .utf8),
          let dict = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return nil }
    return dict
}

private func siriBabyName() -> String {
    siriWidgetDict()?["babyName"] as? String ?? "Baby"
}

// ══════════════════════════════════════════════════════════════════
// MARK: - ACTION INTENTS (open app + log)
// ══════════════════════════════════════════════════════════════════

// MARK: Log Feed
@available(iOS 16.0, *)
struct OBLogFeedAppIntent: AppIntent {
    static var title: LocalizedStringResource = "Log a Feed"
    static var description = IntentDescription("Log a feed for baby in OBubba")
    static var openAppWhenRun: Bool = true
    func perform() async throws -> some IntentResult & ProvidesDialog {
        storePendingSiriEntry(["type": "feed", "feedType": "bottle", "source": "siri"])
        return .result(dialog: "Feed logged for \(siriBabyName()) ✓")
    }
}

// MARK: Log Feed with Amount
@available(iOS 16.0, *)
struct OBLogFeedAmountAppIntent: AppIntent {
    static var title: LocalizedStringResource = "Log a Feed with Amount"
    static var description = IntentDescription("Log a feed with specific ml amount")
    static var openAppWhenRun: Bool = true
    @Parameter(title: "Amount in ml")
    var amount: Int
    func perform() async throws -> some IntentResult & ProvidesDialog {
        storePendingSiriEntry(["type": "feed", "feedType": "bottle", "amount": amount, "source": "siri"])
        return .result(dialog: "\(amount)ml feed logged for \(siriBabyName()) ✓")
    }
}

// MARK: Morning Wake
@available(iOS 16.0, *)
struct OBLogWakeAppIntent: AppIntent {
    static var title: LocalizedStringResource = "Log Morning Wake"
    static var description = IntentDescription("Log morning wake up time")
    static var openAppWhenRun: Bool = true
    func perform() async throws -> some IntentResult & ProvidesDialog {
        storePendingSiriEntry(["type": "wake", "source": "siri"])
        return .result(dialog: "Morning wake logged for \(siriBabyName()) ✓")
    }
}

// MARK: Start Nap
@available(iOS 16.0, *)
struct OBStartNapAppIntent: AppIntent {
    static var title: LocalizedStringResource = "Start Nap Timer"
    static var description = IntentDescription("Start a nap timer")
    static var openAppWhenRun: Bool = true
    func perform() async throws -> some IntentResult & ProvidesDialog {
        storePendingSiriEntry(["type": "nap_start", "source": "siri"])
        return .result(dialog: "Nap timer started for \(siriBabyName()) ✓")
    }
}

// MARK: Stop Nap
@available(iOS 16.0, *)
struct OBStopNapAppIntent: AppIntent {
    static var title: LocalizedStringResource = "Stop Nap Timer"
    static var description = IntentDescription("Stop the nap timer")
    static var openAppWhenRun: Bool = true
    func perform() async throws -> some IntentResult & ProvidesDialog {
        storePendingSiriEntry(["type": "nap_stop", "source": "siri"])
        return .result(dialog: "Nap stopped for \(siriBabyName()) ✓")
    }
}

// MARK: Log Bedtime
@available(iOS 16.0, *)
struct OBLogBedtimeAppIntent: AppIntent {
    static var title: LocalizedStringResource = "Log Bedtime"
    static var description = IntentDescription("Log bedtime for baby")
    static var openAppWhenRun: Bool = true
    func perform() async throws -> some IntentResult & ProvidesDialog {
        storePendingSiriEntry(["type": "sleep", "source": "siri"])
        return .result(dialog: "Bedtime logged for \(siriBabyName()) ✓")
    }
}

// MARK: Log Nappy (basic)
@available(iOS 16.0, *)
struct OBLogNappyAppIntent: AppIntent {
    static var title: LocalizedStringResource = "Log a Nappy"
    static var description = IntentDescription("Log a nappy change")
    static var openAppWhenRun: Bool = true
    func perform() async throws -> some IntentResult & ProvidesDialog {
        storePendingSiriEntry(["type": "poop", "poopType": "wet", "source": "siri"])
        return .result(dialog: "Nappy logged for \(siriBabyName()) ✓")
    }
}

// MARK: Log Wet Nappy
@available(iOS 16.0, *)
struct OBLogWetNappyAppIntent: AppIntent {
    static var title: LocalizedStringResource = "Log Wet Nappy"
    static var description = IntentDescription("Log a wet nappy")
    static var openAppWhenRun: Bool = true
    func perform() async throws -> some IntentResult & ProvidesDialog {
        storePendingSiriEntry(["type": "poop", "poopType": "wet", "source": "siri"])
        return .result(dialog: "Wet nappy logged for \(siriBabyName()) ✓")
    }
}

// MARK: Log Dirty Nappy
@available(iOS 16.0, *)
struct OBLogDirtyNappyAppIntent: AppIntent {
    static var title: LocalizedStringResource = "Log Dirty Nappy"
    static var description = IntentDescription("Log a dirty nappy with colour")
    static var openAppWhenRun: Bool = true
    @Parameter(title: "Colour", default: "mustard")
    var colour: String?
    func perform() async throws -> some IntentResult & ProvidesDialog {
        let c = colour ?? "mustard"
        storePendingSiriEntry(["type": "poop", "poopType": "dirty", "poopColour": c, "source": "siri"])
        return .result(dialog: "Dirty nappy (\(c)) logged for \(siriBabyName()) ✓")
    }
}

// MARK: Night Wake — Self-Settled
@available(iOS 16.0, *)
struct OBLogNightWakeSelfAppIntent: AppIntent {
    static var title: LocalizedStringResource = "Log Night Wake Self-Settled"
    static var description = IntentDescription("Log a night wake where baby self-settled")
    static var openAppWhenRun: Bool = true
    func perform() async throws -> some IntentResult & ProvidesDialog {
        storePendingSiriEntry(["type": "night_wake", "selfSettled": true, "source": "siri"])
        return .result(dialog: "Night wake (self-settled) logged for \(siriBabyName()) ✓")
    }
}

// MARK: Night Wake — Assisted with Milk
@available(iOS 16.0, *)
struct OBLogNightWakeMilkAppIntent: AppIntent {
    static var title: LocalizedStringResource = "Log Night Wake with Milk"
    static var description = IntentDescription("Log a night wake where baby was given milk")
    static var openAppWhenRun: Bool = true
    @Parameter(title: "Amount in ml", default: 0)
    var amount: Int
    func perform() async throws -> some IntentResult & ProvidesDialog {
        storePendingSiriEntry(["type": "night_wake", "selfSettled": false, "assisted": true, "assistedType": "milk", "ml": amount, "source": "siri"])
        let mlNote = amount > 0 ? " (\(amount)ml)" : ""
        return .result(dialog: "Night wake (milk\(mlNote)) logged for \(siriBabyName()) ✓")
    }
}

// MARK: Night Wake — Assisted Rocking
@available(iOS 16.0, *)
struct OBLogNightWakeRockingAppIntent: AppIntent {
    static var title: LocalizedStringResource = "Log Night Wake Rocking"
    static var description = IntentDescription("Log a night wake where baby was rocked back to sleep")
    static var openAppWhenRun: Bool = true
    func perform() async throws -> some IntentResult & ProvidesDialog {
        storePendingSiriEntry(["type": "night_wake", "selfSettled": false, "assisted": true, "assistedType": "rocking", "source": "siri"])
        return .result(dialog: "Night wake (rocking) logged for \(siriBabyName()) ✓")
    }
}

// MARK: Night Wake — Assisted Generic
@available(iOS 16.0, *)
struct OBLogNightWakeAssistedAppIntent: AppIntent {
    static var title: LocalizedStringResource = "Log Night Wake Assisted"
    static var description = IntentDescription("Log a night wake with assisted soothing")
    static var openAppWhenRun: Bool = true
    @Parameter(title: "Soothing method", default: "soothing")
    var method: String?
    func perform() async throws -> some IntentResult & ProvidesDialog {
        let m = method ?? "soothing"
        storePendingSiriEntry(["type": "night_wake", "selfSettled": false, "assisted": true, "assistedType": m, "source": "siri"])
        return .result(dialog: "Night wake (\(m)) logged for \(siriBabyName()) ✓")
    }
}

// ══════════════════════════════════════════════════════════════════
// MARK: - QUERY INTENTS (no app open — read from widget data)
// ══════════════════════════════════════════════════════════════════

@available(iOS 16.0, *)
struct OBubbaSummaryAppIntent: AppIntent {
    static var title: LocalizedStringResource = "Baby Summary"
    static var description = IntentDescription("Get a summary of how baby is doing today")
    static var openAppWhenRun: Bool = false
    func perform() async throws -> some IntentResult & ProvidesDialog {
        guard let dict = siriWidgetDict() else {
            return .result(dialog: "Open OBubba to see the latest summary.")
        }
        let name = dict["babyName"] as? String ?? "Baby"
        let feeds = dict["feedCount"] as? Int ?? 0
        let sleeps = dict["sleepCount"] as? Int ?? 0
        let nappies = dict["nappyCount"] as? Int ?? 0
        let lastFeed = dict["lastFeedTime"] as? String
        var text = "\(name) has had \(feeds) feed\(feeds == 1 ? "" : "s"), \(sleeps) sleep\(sleeps == 1 ? "" : "s"), and \(nappies) nappy change\(nappies == 1 ? "" : "s") today."
        if let lf = lastFeed, !lf.isEmpty { text += " Last feed was at \(lf)." }
        if let pred = dict["nextPrediction"] as? String, !pred.isEmpty { text += " Next: \(pred)." }
        return .result(dialog: IntentDialog(stringLiteral: text))
    }
}

@available(iOS 16.0, *)
struct OBNextNapAppIntent: AppIntent {
    static var title: LocalizedStringResource = "When is Next Nap"
    static var description = IntentDescription("Check when baby's next nap is predicted")
    static var openAppWhenRun: Bool = false
    func perform() async throws -> some IntentResult & ProvidesDialog {
        guard let dict = siriWidgetDict() else {
            return .result(dialog: "Open OBubba first so I can predict naps.")
        }
        let name = dict["babyName"] as? String ?? "Baby"
        if let pred = dict["nextPrediction"] as? String, !pred.isEmpty {
            return .result(dialog: IntentDialog(stringLiteral: "\(name)'s next predicted event: \(pred)."))
        }
        return .result(dialog: IntentDialog(stringLiteral: "No nap prediction available right now. Open OBubba to update."))
    }
}

@available(iOS 16.0, *)
struct OBLastFeedAppIntent: AppIntent {
    static var title: LocalizedStringResource = "When was Last Feed"
    static var description = IntentDescription("Check when baby last fed")
    static var openAppWhenRun: Bool = false
    func perform() async throws -> some IntentResult & ProvidesDialog {
        guard let dict = siriWidgetDict() else {
            return .result(dialog: "Open OBubba to check feeding times.")
        }
        let name = dict["babyName"] as? String ?? "Baby"
        if let lf = dict["lastFeedTime"] as? String, !lf.isEmpty {
            return .result(dialog: IntentDialog(stringLiteral: "\(name)'s last feed was at \(lf)."))
        }
        return .result(dialog: IntentDialog(stringLiteral: "No feeds logged for \(name) today yet."))
    }
}

@available(iOS 16.0, *)
struct OBNextFeedAppIntent: AppIntent {
    static var title: LocalizedStringResource = "When is Next Feed"
    static var description = IntentDescription("Check when baby's next feed is estimated")
    static var openAppWhenRun: Bool = false
    func perform() async throws -> some IntentResult & ProvidesDialog {
        guard let dict = siriWidgetDict() else {
            return .result(dialog: "Open OBubba to check feed estimates.")
        }
        let name = dict["babyName"] as? String ?? "Baby"
        if let nf = dict["nextFeedEstimate"] as? String, !nf.isEmpty {
            return .result(dialog: IntentDialog(stringLiteral: "\(name)'s next feed is estimated around \(nf)."))
        }
        return .result(dialog: IntentDialog(stringLiteral: "No feed estimate available right now."))
    }
}

// ══════════════════════════════════════════════════════════════════
// MARK: - App Shortcuts Provider (auto-registers with Siri)
// ══════════════════════════════════════════════════════════════════

@available(iOS 16.4, *)
struct OBubbaAppShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        // Max 10 App Shortcuts allowed — pick the most used actions
        AppShortcut(
            intent: OBLogFeedAppIntent(),
            phrases: [
                "Log a feed in \(.applicationName)",
                "Record a feed in \(.applicationName)",
                "Feed in \(.applicationName)"
            ],
            shortTitle: "Log Feed",
            systemImageName: "drop.fill"
        )
        AppShortcut(
            intent: OBStartNapAppIntent(),
            phrases: [
                "Start nap timer in \(.applicationName)",
                "Start nap in \(.applicationName)",
                "Nap time in \(.applicationName)"
            ],
            shortTitle: "Start Nap",
            systemImageName: "moon.zzz.fill"
        )
        AppShortcut(
            intent: OBStopNapAppIntent(),
            phrases: [
                "Stop nap in \(.applicationName)",
                "Stop timer in \(.applicationName)",
                "End nap in \(.applicationName)"
            ],
            shortTitle: "Stop Nap",
            systemImageName: "stop.fill"
        )
        AppShortcut(
            intent: OBLogWakeAppIntent(),
            phrases: [
                "Log morning wake in \(.applicationName)",
                "Morning wake in \(.applicationName)",
                "Baby is awake in \(.applicationName)"
            ],
            shortTitle: "Morning Wake",
            systemImageName: "sun.max.fill"
        )
        AppShortcut(
            intent: OBLogBedtimeAppIntent(),
            phrases: [
                "Log bedtime in \(.applicationName)",
                "Bedtime in \(.applicationName)",
                "Baby is asleep in \(.applicationName)"
            ],
            shortTitle: "Log Bedtime",
            systemImageName: "moon.fill"
        )
        AppShortcut(
            intent: OBLogNappyAppIntent(),
            phrases: [
                "Log a nappy in \(.applicationName)",
                "Nappy change in \(.applicationName)",
                "Log nappy in \(.applicationName)"
            ],
            shortTitle: "Log Nappy",
            systemImageName: "leaf.fill"
        )
        AppShortcut(
            intent: OBLogNightWakeSelfAppIntent(),
            phrases: [
                "Night wake self settled in \(.applicationName)",
                "Self settled in \(.applicationName)"
            ],
            shortTitle: "Night Wake",
            systemImageName: "star.fill"
        )
        AppShortcut(
            intent: OBLogNightWakeMilkAppIntent(),
            phrases: [
                "Night wake milk in \(.applicationName)",
                "Night feed in \(.applicationName)"
            ],
            shortTitle: "Night Feed",
            systemImageName: "cup.and.saucer.fill"
        )
        AppShortcut(
            intent: OBubbaSummaryAppIntent(),
            phrases: [
                "How's baby doing in \(.applicationName)",
                "Baby summary in \(.applicationName)"
            ],
            shortTitle: "Baby Summary",
            systemImageName: "person.fill"
        )
        AppShortcut(
            intent: OBNextNapAppIntent(),
            phrases: [
                "When is next nap in \(.applicationName)",
                "Next nap in \(.applicationName)"
            ],
            shortTitle: "Next Nap",
            systemImageName: "clock.fill"
        )
    }
}
