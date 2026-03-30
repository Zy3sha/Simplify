import Foundation
import Capacitor
import WidgetKit

/// Bridges widget data between the web app and iOS WidgetKit.
/// Writes data to a shared App Group container file so widgets can read it.
/// Uses file-based sharing instead of UserDefaults to avoid CFPrefs container issues.
@objc(OBWidgetBridge)
public class WidgetBridgePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "OBWidgetBridge"
    public let jsName = "OBWidgetBridge"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "setData", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "reloadAll", returnType: CAPPluginReturnPromise),
    ]

    private let appGroupId = "group.com.obubba.app"

    /// Returns the shared file URL for widget data
    private func sharedFileURL() -> URL? {
        FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroupId)?
            .appendingPathComponent("widgetData.json")
    }

    @objc func setData(_ call: CAPPluginCall) {
        guard let json = call.getString("json") else {
            call.reject("json is required")
            return
        }

        // Method 1: Write to shared file (primary — most reliable)
        if let fileURL = sharedFileURL() {
            do {
                try json.write(to: fileURL, atomically: true, encoding: .utf8)
                print("[OBWidgetBridge] Wrote \(json.count) bytes to \(fileURL.path)")
            } catch {
                print("[OBWidgetBridge] File write error: \(error)")
            }
        } else {
            print("[OBWidgetBridge] ERROR: Could not get App Group container URL")
        }

        // Method 2: Also write to UserDefaults (backup)
        if let defaults = UserDefaults(suiteName: appGroupId) {
            defaults.set(json, forKey: "widgetData")
            defaults.synchronize()
        }

        // Tell WidgetKit to refresh
        if #available(iOS 14.0, *) {
            WidgetCenter.shared.reloadAllTimelines()
        }

        call.resolve(["saved": true])
    }

    @objc func reloadAll(_ call: CAPPluginCall) {
        if #available(iOS 14.0, *) {
            WidgetCenter.shared.reloadAllTimelines()
        }
        call.resolve()
    }
}
