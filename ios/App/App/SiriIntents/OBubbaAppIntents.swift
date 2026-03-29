import Foundation
import AppIntents

// ══════════════════════════════════════════════════════════════════
// OBubba App Intents — iOS 16+ (no .intentdefinition file required)
// These power "Hey Siri, log a feed in OBubba" style commands.
// AppShortcutsProvider auto-registers phrases — no manual Siri setup needed.
// ══════════════════════════════════════════════════════════════════

// MARK: - Log Feed

@available(iOS 16.0, *)
struct OBLogFeedAppIntent: AppIntent {
    static var title: LocalizedStringResource = "Log a Feed"
    static var description = IntentDescription("Log a feed for baby in OBubba")
    static var openAppWhenRun: Bool = false

    func perform() async throws -> some IntentResult & ProvidesDialog {
        storePendingSiriEntry(["type": "feed", "feedType": "bottle", "source": "siri"])
        return .result(dialog: "Feed logged in OBubba ✓")
    }
}

// MARK: - Start Nap Timer

@available(iOS 16.0, *)
struct OBStartNapAppIntent: AppIntent {
    static var title: LocalizedStringResource = "Start Nap Timer"
    static var description = IntentDescription("Start a nap timer for baby in OBubba")
    static var openAppWhenRun: Bool = false

    func perform() async throws -> some IntentResult & ProvidesDialog {
        storePendingSiriEntry(["type": "nap_start", "source": "siri"])
        return .result(dialog: "Nap timer started in OBubba ✓")
    }
}

// MARK: - Log Bedtime

@available(iOS 16.0, *)
struct OBLogBedtimeAppIntent: AppIntent {
    static var title: LocalizedStringResource = "Log Bedtime"
    static var description = IntentDescription("Log bedtime for baby in OBubba")
    static var openAppWhenRun: Bool = false

    func perform() async throws -> some IntentResult & ProvidesDialog {
        storePendingSiriEntry(["type": "sleep", "source": "siri"])
        return .result(dialog: "Bedtime logged in OBubba ✓")
    }
}

// MARK: - Log Nappy

@available(iOS 16.0, *)
struct OBLogNappyAppIntent: AppIntent {
    static var title: LocalizedStringResource = "Log a Nappy"
    static var description = IntentDescription("Log a nappy change for baby in OBubba")
    static var openAppWhenRun: Bool = false

    func perform() async throws -> some IntentResult & ProvidesDialog {
        storePendingSiriEntry(["type": "poop", "poopType": "wet", "source": "siri"])
        return .result(dialog: "Nappy logged in OBubba ✓")
    }
}

// MARK: - Baby Summary

@available(iOS 16.0, *)
struct OBubbaSummaryAppIntent: AppIntent {
    static var title: LocalizedStringResource = "Baby Summary"
    static var description = IntentDescription("Get a summary of how baby is doing today")
    static var openAppWhenRun: Bool = false

    func perform() async throws -> some IntentResult & ProvidesDialog {
        guard let defaults = UserDefaults(suiteName: "group.com.obubba.app"),
              let json = defaults.string(forKey: "widgetData"),
              let data = json.data(using: .utf8),
              let dict = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return .result(dialog: "Open OBubba to see the latest summary.")
        }
        let name = dict["babyName"] as? String ?? "Baby"
        let feeds = dict["feedCount"] as? Int ?? 0
        let sleeps = dict["sleepCount"] as? Int ?? 0
        let nappies = dict["nappyCount"] as? Int ?? 0
        let lastFeed = dict["lastFeedTime"] as? String
        var text = "\(name) has had \(feeds) feed\(feeds == 1 ? "" : "s"), \(sleeps) sleep\(sleeps == 1 ? "" : "s"), and \(nappies) nappy change\(nappies == 1 ? "" : "s") today."
        if let lf = lastFeed, !lf.isEmpty { text += " Last feed was at \(lf)." }
        return .result(dialog: IntentDialog(stringLiteral: text))
    }
}

// MARK: - App Shortcuts Provider (iOS 16.4+ auto-registers with Siri)

@available(iOS 16.4, *)
struct OBubbaAppShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: OBLogFeedAppIntent(),
            phrases: [
                "Log a feed in \(.applicationName)",
                "Record a feed in \(.applicationName)",
                "Add feed in \(.applicationName)"
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
            intent: OBLogBedtimeAppIntent(),
            phrases: [
                "Log bedtime in \(.applicationName)",
                "Bedtime in \(.applicationName)"
            ],
            shortTitle: "Log Bedtime",
            systemImageName: "moon.fill"
        )
        AppShortcut(
            intent: OBLogNappyAppIntent(),
            phrases: [
                "Log a nappy in \(.applicationName)",
                "Nappy change in \(.applicationName)"
            ],
            shortTitle: "Log Nappy",
            systemImageName: "leaf.fill"
        )
        AppShortcut(
            intent: OBubbaSummaryAppIntent(),
            phrases: [
                "How's baby doing in \(.applicationName)",
                "Baby summary in \(.applicationName)",
                "How is baby in \(.applicationName)"
            ],
            shortTitle: "Baby Summary",
            systemImageName: "person.fill"
        )
    }
}

// MARK: - Helper: write pending Siri entry to App Group

private func storePendingSiriEntry(_ dict: [String: Any]) {
    var entry = dict
    entry["time"] = ISO8601DateFormatter().string(from: Date())
    guard let data = try? JSONSerialization.data(withJSONObject: entry),
          let json = String(data: data, encoding: .utf8),
          let defaults = UserDefaults(suiteName: "group.com.obubba.app") else { return }
    defaults.set(json, forKey: "pendingSiriEntry")
    defaults.synchronize()
}
