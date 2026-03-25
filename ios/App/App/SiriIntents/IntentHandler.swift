import Intents
import UIKit

/// Handles Siri voice commands routed to OBubba.
/// Processes intents like "Log a feed in OBubba" or "When was the last feed?"
class IntentHandler: INExtension {

    override func handler(for intent: INIntent) -> Any {
        // Route to appropriate handler based on intent type
        if intent is OBLogFeedIntent {
            return LogFeedIntentHandler()
        }
        if intent is OBLogSleepIntent {
            return LogSleepIntentHandler()
        }
        if intent is OBBabySummaryIntent {
            return BabySummaryIntentHandler()
        }
        return self
    }
}

// ── Custom Intent Definitions ───────────────────────────────────
// These correspond to the Intents defined in the .intentdefinition file

class OBLogFeedIntent: INIntent {
    @NSManaged var feedType: String?     // "breast", "bottle", "pumped"
    @NSManaged var side: String?         // "left", "right"
    @NSManaged var amount: NSNumber?     // ml for bottle feeds
}

class OBLogSleepIntent: INIntent {
    @NSManaged var sleepType: String?    // "nap", "bedtime"
}

class OBBabySummaryIntent: INIntent {}

// ── Intent Handlers ─────────────────────────────────────────────

class LogFeedIntentHandler: NSObject, INExtension {
    func handle(intent: OBLogFeedIntent, completion: @escaping (OBLogFeedIntentResponse) -> Void) {
        // Read shared data to get active baby
        let appGroupId = "group.com.obubba.app"
        guard let defaults = UserDefaults(suiteName: appGroupId) else {
            completion(OBLogFeedIntentResponse(code: .failure, userActivity: nil))
            return
        }

        // Store the pending log entry for the app to pick up
        let entry: [String: Any] = [
            "type": "feed",
            "subtype": intent.feedType ?? "bottle",
            "side": intent.side ?? "",
            "amount": intent.amount ?? 0,
            "time": ISO8601DateFormatter().string(from: Date()),
            "source": "siri"
        ]

        if let jsonData = try? JSONSerialization.data(withJSONObject: entry),
           let json = String(data: jsonData, encoding: .utf8) {
            defaults.set(json, forKey: "pendingSiriEntry")
        }

        let response = OBLogFeedIntentResponse(code: .success, userActivity: nil)
        response.feedType = intent.feedType ?? "bottle"
        completion(response)
    }
}

class LogSleepIntentHandler: NSObject, INExtension {
    func handle(intent: OBLogSleepIntent, completion: @escaping (OBLogSleepIntentResponse) -> Void) {
        let appGroupId = "group.com.obubba.app"
        guard let defaults = UserDefaults(suiteName: appGroupId) else {
            completion(OBLogSleepIntentResponse(code: .failure, userActivity: nil))
            return
        }

        let entry: [String: Any] = [
            "type": intent.sleepType == "bedtime" ? "sleep" : "nap",
            "time": ISO8601DateFormatter().string(from: Date()),
            "source": "siri"
        ]

        if let jsonData = try? JSONSerialization.data(withJSONObject: entry),
           let json = String(data: jsonData, encoding: .utf8) {
            defaults.set(json, forKey: "pendingSiriEntry")
        }

        completion(OBLogSleepIntentResponse(code: .success, userActivity: nil))
    }
}

class BabySummaryIntentHandler: NSObject, INExtension {
    func handle(intent: OBBabySummaryIntent, completion: @escaping (OBBabySummaryIntentResponse) -> Void) {
        let appGroupId = "group.com.obubba.app"
        guard let defaults = UserDefaults(suiteName: appGroupId),
              let json = defaults.string(forKey: "widgetData"),
              let jsonData = json.data(using: .utf8),
              let data = try? JSONDecoder().decode(WidgetData.self, from: jsonData) else {
            completion(OBBabySummaryIntentResponse(code: .failure, userActivity: nil))
            return
        }

        let response = OBBabySummaryIntentResponse(code: .success, userActivity: nil)
        response.summary = "\(data.babyName) has had \(data.feedCount) feeds, \(data.sleepCount) sleeps, and \(data.nappyCount) nappy changes today."
        if let lastFeed = data.lastFeedTime {
            response.summary = (response.summary ?? "") + " Last feed was at \(lastFeed)."
        }
        completion(response)
    }
}

// ── Intent Responses ────────────────────────────────────────────

class OBLogFeedIntentResponse: INIntentResponse {
    var feedType: String?
    init(code: OBLogFeedIntentResponseCode, userActivity: NSUserActivity?) {
        super.init()
    }
    required init?(coder: NSCoder) { super.init(coder: coder) }
}

enum OBLogFeedIntentResponseCode: Int { case success = 0, failure = 1 }

class OBLogSleepIntentResponse: INIntentResponse {
    init(code: OBLogSleepIntentResponseCode, userActivity: NSUserActivity?) {
        super.init()
    }
    required init?(coder: NSCoder) { super.init(coder: coder) }
}

enum OBLogSleepIntentResponseCode: Int { case success = 0, failure = 1 }

class OBBabySummaryIntentResponse: INIntentResponse {
    var summary: String?
    init(code: OBBabySummaryIntentResponseCode, userActivity: NSUserActivity?) {
        super.init()
    }
    required init?(coder: NSCoder) { super.init(coder: coder) }
}

enum OBBabySummaryIntentResponseCode: Int { case success = 0, failure = 1 }
