import Foundation
import AppIntents

// ══════════════════════════════════════════════════════════════════
// OBubba App Intents — iOS 16+ (no .intentdefinition file required)
// Powers "Hey Siri, ..." commands. AppShortcutsProvider auto-registers.
// ══════════════════════════════════════════════════════════════════

private let appGroup = "group.com.obubba.app"

// ── Helper: read widget data from App Group ─────────────────────
private func widgetDict() -> [String: Any]? {
    guard let defaults = UserDefaults(suiteName: appGroup),
          let json = defaults.string(forKey: "widgetData"),
          let data = json.data(using: .utf8),
          let dict = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return nil }
    return dict
}

private func babyName() -> String {
    widgetDict()?["babyName"] as? String ?? "Baby"
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
        return .result(dialog: "Feed logged for \(babyName()) ✓")
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
        return .result(dialog: "\(amount)ml feed logged for \(babyName()) ✓")
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
        return .result(dialog: "Morning wake logged for \(babyName()) ✓")
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
        return .result(dialog: "Nap timer started for \(babyName()) ✓")
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
        return .result(dialog: "Nap stopped for \(babyName()) ✓")
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
        return .result(dialog: "Bedtime logged for \(babyName()) ✓")
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
        return .result(dialog: "Nappy logged for \(babyName()) ✓")
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
        return .result(dialog: "Wet nappy logged for \(babyName()) ✓")
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
        return .result(dialog: "Dirty nappy (\(c)) logged for \(babyName()) ✓")
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
        return .result(dialog: "Night wake (self-settled) logged for \(babyName()) ✓")
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
        return .result(dialog: "Night wake (milk\(mlNote)) logged for \(babyName()) ✓")
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
        return .result(dialog: "Night wake (rocking) logged for \(babyName()) ✓")
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
        return .result(dialog: "Night wake (\(m)) logged for \(babyName()) ✓")
    }
}

// ══════════════════════════════════════════════════════════════════
// MARK: - QUERY INTENTS (no app open — read from widget data)
// ══════════════════════════════════════════════════════════════════

// MARK: Baby Summary
@available(iOS 16.0, *)
struct OBubbaSummaryAppIntent: AppIntent {
    static var title: LocalizedStringResource = "Baby Summary"
    static var description = IntentDescription("Get a summary of how baby is doing today")
    static var openAppWhenRun: Bool = false
    func perform() async throws -> some IntentResult & ProvidesDialog {
        guard let dict = widgetDict() else {
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

// MARK: When is Next Nap
@available(iOS 16.0, *)
struct OBNextNapAppIntent: AppIntent {
    static var title: LocalizedStringResource = "When is Next Nap"
    static var description = IntentDescription("Check when baby's next nap is predicted")
    static var openAppWhenRun: Bool = false
    func perform() async throws -> some IntentResult & ProvidesDialog {
        guard let dict = widgetDict() else {
            return .result(dialog: "Open OBubba first so I can predict naps.")
        }
        let name = dict["babyName"] as? String ?? "Baby"
        if let pred = dict["nextPrediction"] as? String, !pred.isEmpty {
            return .result(dialog: IntentDialog(stringLiteral: "\(name)'s next predicted event: \(pred)."))
        }
        if let timer = dict["activeTimer"] as? String, !timer.isEmpty {
            return .result(dialog: IntentDialog(stringLiteral: "\(name) is currently \(timer == "nap" || timer == "sleep" ? "sleeping" : timer == "feed" ? "feeding" : timer). No next nap prediction yet."))
        }
        return .result(dialog: IntentDialog(stringLiteral: "No nap prediction available right now. Open OBubba to update."))
    }
}

// MARK: When was Last Feed
@available(iOS 16.0, *)
struct OBLastFeedAppIntent: AppIntent {
    static var title: LocalizedStringResource = "When was Last Feed"
    static var description = IntentDescription("Check when baby last fed")
    static var openAppWhenRun: Bool = false
    func perform() async throws -> some IntentResult & ProvidesDialog {
        guard let dict = widgetDict() else {
            return .result(dialog: "Open OBubba to check feeding times.")
        }
        let name = dict["babyName"] as? String ?? "Baby"
        if let lf = dict["lastFeedTime"] as? String, !lf.isEmpty {
            let feedType = dict["lastFeedType"] as? String ?? "bottle"
            return .result(dialog: IntentDialog(stringLiteral: "\(name)'s last \(feedType) feed was at \(lf)."))
        }
        return .result(dialog: IntentDialog(stringLiteral: "No feeds logged for \(name) today yet."))
    }
}

// MARK: When is Next Feed
@available(iOS 16.0, *)
struct OBNextFeedAppIntent: AppIntent {
    static var title: LocalizedStringResource = "When is Next Feed"
    static var description = IntentDescription("Check when baby's next feed is estimated")
    static var openAppWhenRun: Bool = false
    func perform() async throws -> some IntentResult & ProvidesDialog {
        guard let dict = widgetDict() else {
            return .result(dialog: "Open OBubba to check feed estimates.")
        }
        let name = dict["babyName"] as? String ?? "Baby"
        if let nf = dict["nextFeedEstimate"] as? String, !nf.isEmpty {
            return .result(dialog: IntentDialog(stringLiteral: "\(name)'s next feed is estimated around \(nf)."))
        }
        if let lf = dict["lastFeedTime"] as? String, !lf.isEmpty {
            return .result(dialog: IntentDialog(stringLiteral: "\(name)'s last feed was at \(lf). No next feed estimate available — open OBubba for details."))
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
        // ── Feeds ──
        AppShortcut(
            intent: OBLogFeedAppIntent(),
            phrases: [
                "Log a feed in \(.applicationName)",
                "Record a feed in \(.applicationName)",
                "Add feed in \(.applicationName)",
                "Feed in \(.applicationName)"
            ],
            shortTitle: "Log Feed",
            systemImageName: "drop.fill"
        )
        AppShortcut(
            intent: OBLogFeedAmountAppIntent(),
            phrases: [
                "Log \(\.$amount) ml feed in \(.applicationName)",
                "Feed \(\.$amount) ml in \(.applicationName)",
                "\(\.$amount) ml feed in \(.applicationName)"
            ],
            shortTitle: "Log Feed Amount",
            systemImageName: "drop.fill"
        )
        // ── Sleep ──
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
                "End nap in \(.applicationName)",
                "Nap over in \(.applicationName)"
            ],
            shortTitle: "Stop Nap",
            systemImageName: "stop.fill"
        )
        AppShortcut(
            intent: OBLogWakeAppIntent(),
            phrases: [
                "Log morning wake in \(.applicationName)",
                "Morning wake in \(.applicationName)",
                "Baby is awake in \(.applicationName)",
                "Good morning in \(.applicationName)"
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
        // ── Night wakes ──
        AppShortcut(
            intent: OBLogNightWakeSelfAppIntent(),
            phrases: [
                "Log night wake self settled in \(.applicationName)",
                "Night wake unassisted in \(.applicationName)",
                "Self settled in \(.applicationName)"
            ],
            shortTitle: "Night Wake Self-Settled",
            systemImageName: "star.fill"
        )
        AppShortcut(
            intent: OBLogNightWakeMilkAppIntent(),
            phrases: [
                "Log night wake \(\.$amount) ml milk in \(.applicationName)",
                "Night wake milk in \(.applicationName)",
                "Night feed \(\.$amount) ml in \(.applicationName)",
                "Night wake assisted milk in \(.applicationName)"
            ],
            shortTitle: "Night Wake Milk",
            systemImageName: "cup.and.saucer.fill"
        )
        AppShortcut(
            intent: OBLogNightWakeRockingAppIntent(),
            phrases: [
                "Log night wake rocking in \(.applicationName)",
                "Night wake assisted rocking in \(.applicationName)",
                "Rocked baby in \(.applicationName)"
            ],
            shortTitle: "Night Wake Rocking",
            systemImageName: "hands.clap.fill"
        )
        AppShortcut(
            intent: OBLogNightWakeAssistedAppIntent(),
            phrases: [
                "Log night wake assisted \(\.$method) in \(.applicationName)",
                "Night wake \(\.$method) in \(.applicationName)",
                "Assisted soothing in \(.applicationName)"
            ],
            shortTitle: "Night Wake Assisted",
            systemImageName: "hand.raised.fill"
        )
        // ── Nappies ──
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
            intent: OBLogWetNappyAppIntent(),
            phrases: [
                "Log wet nappy in \(.applicationName)",
                "Wet nappy in \(.applicationName)"
            ],
            shortTitle: "Wet Nappy",
            systemImageName: "drop.triangle.fill"
        )
        AppShortcut(
            intent: OBLogDirtyNappyAppIntent(),
            phrases: [
                "Log dirty nappy in \(.applicationName)",
                "Dirty nappy in \(.applicationName)",
                "Poo nappy in \(.applicationName)"
            ],
            shortTitle: "Dirty Nappy",
            systemImageName: "leaf.fill"
        )
        // ── Queries ──
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
        AppShortcut(
            intent: OBNextNapAppIntent(),
            phrases: [
                "When is next nap in \(.applicationName)",
                "Next nap in \(.applicationName)",
                "When should baby nap in \(.applicationName)"
            ],
            shortTitle: "Next Nap",
            systemImageName: "clock.fill"
        )
        AppShortcut(
            intent: OBLastFeedAppIntent(),
            phrases: [
                "When was last feed in \(.applicationName)",
                "Last feed in \(.applicationName)",
                "When did baby eat in \(.applicationName)"
            ],
            shortTitle: "Last Feed",
            systemImageName: "clock.arrow.circlepath"
        )
        AppShortcut(
            intent: OBNextFeedAppIntent(),
            phrases: [
                "When is next feed in \(.applicationName)",
                "Next feed in \(.applicationName)",
                "When should baby eat in \(.applicationName)"
            ],
            shortTitle: "Next Feed",
            systemImageName: "clock.badge.questionmark"
        )
    }
}

// ══════════════════════════════════════════════════════════════════
// MARK: - Helper: write pending entry to App Group
// ══════════════════════════════════════════════════════════════════

private func storePendingSiriEntry(_ dict: [String: Any]) {
    var entry = dict
    let fmt = DateFormatter()
    fmt.dateFormat = "HH:mm"
    entry["time"] = fmt.string(from: Date())
    guard let data = try? JSONSerialization.data(withJSONObject: entry),
          let json = String(data: data, encoding: .utf8),
          let defaults = UserDefaults(suiteName: appGroup) else { return }
    defaults.set(json, forKey: "pendingSiriEntry")
    defaults.synchronize()
}
