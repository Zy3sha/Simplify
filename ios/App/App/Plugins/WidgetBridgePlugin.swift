import Foundation
import Capacitor
import WidgetKit

/// Bridges widget data between the web app and iOS WidgetKit.
/// Writes data to a shared App Group container so widgets can read it.
@objc(OBWidgetBridge)
public class WidgetBridgePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "OBWidgetBridge"
    public let jsName = "OBWidgetBridge"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "setData", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "reloadAll", returnType: CAPPluginReturnPromise),
    ]

    private let appGroupId = "group.com.obubba.app"

    @objc func setData(_ call: CAPPluginCall) {
        guard let json = call.getString("json") else {
            call.reject("json is required")
            return
        }

        guard let defaults = UserDefaults(suiteName: appGroupId) else {
            call.reject("Failed to access App Group")
            return
        }

        defaults.set(json, forKey: "widgetData")
        defaults.synchronize()

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
