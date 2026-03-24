import Foundation
import Capacitor

#if canImport(ActivityKit)
import ActivityKit
#endif

/// Manages Live Activities for active feed/sleep timers on the Lock Screen and Dynamic Island.
@objc(OBLiveActivity)
public class LiveActivityPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "OBLiveActivity"
    public let jsName = "OBLiveActivity"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "update", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
    ]

    @objc func isAvailable(_ call: CAPPluginCall) {
        if #available(iOS 16.1, *) {
            #if canImport(ActivityKit)
            call.resolve(["available": ActivityAuthorizationInfo().areActivitiesEnabled])
            #else
            call.resolve(["available": false])
            #endif
        } else {
            call.resolve(["available": false])
        }
    }

    @objc func start(_ call: CAPPluginCall) {
        if #available(iOS 16.1, *) {
            #if canImport(ActivityKit)
            let type = call.getString("type") ?? "feed"
            let babyName = call.getString("babyName") ?? "Baby"
            let startTime = call.getDouble("startTime") ?? Date().timeIntervalSince1970 * 1000
            let side = call.getString("side")

            let attributes = OBubbaTimerAttributes(
                timerType: type,
                babyName: babyName
            )

            let state = OBubbaTimerAttributes.ContentState(
                startTime: Date(timeIntervalSince1970: startTime / 1000),
                elapsed: 0,
                side: side
            )

            do {
                let activity = try Activity.request(
                    attributes: attributes,
                    content: .init(state: state, staleDate: nil),
                    pushType: nil
                )
                call.resolve(["activityId": activity.id])
            } catch {
                call.reject("Failed to start Live Activity: \(error.localizedDescription)")
            }
            #else
            call.reject("ActivityKit not available")
            #endif
        } else {
            call.reject("Live Activities require iOS 16.1+")
        }
    }

    @objc func update(_ call: CAPPluginCall) {
        if #available(iOS 16.1, *) {
            #if canImport(ActivityKit)
            let elapsed = call.getInt("elapsed") ?? 0
            let side = call.getString("side")

            let state = OBubbaTimerAttributes.ContentState(
                startTime: Date(),
                elapsed: elapsed,
                side: side
            )

            Task {
                for activity in Activity<OBubbaTimerAttributes>.activities {
                    await activity.update(.init(state: state, staleDate: nil))
                }
                call.resolve()
            }
            #else
            call.reject("ActivityKit not available")
            #endif
        } else {
            call.reject("Live Activities require iOS 16.1+")
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        if #available(iOS 16.1, *) {
            #if canImport(ActivityKit)
            Task {
                for activity in Activity<OBubbaTimerAttributes>.activities {
                    await activity.end(nil, dismissalPolicy: .immediate)
                }
                call.resolve()
            }
            #else
            call.resolve()
            #endif
        } else {
            call.resolve()
        }
    }
}
