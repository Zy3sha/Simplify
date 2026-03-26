import Foundation
import Capacitor
import Intents
import CoreSpotlight

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

        // Add to Spotlight (CSSearchableItemAttributeSet(contentType:) requires iOS 14+)
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

    /// Reads pendingSiriEntry from App Group UserDefaults (written by IntentHandler)
    /// and returns it to the web layer. Clears the entry after reading.
    @objc func checkPendingEntry(_ call: CAPPluginCall) {
        guard let defaults = UserDefaults(suiteName: appGroupId) else {
            call.resolve(["entry": NSNull()])
            return
        }

        guard let json = defaults.string(forKey: "pendingSiriEntry") else {
            call.resolve(["entry": NSNull()])
            return
        }

        // Clear after reading so it's not processed twice
        defaults.removeObject(forKey: "pendingSiriEntry")
        defaults.synchronize()

        call.resolve(["entry": json])
    }
}
