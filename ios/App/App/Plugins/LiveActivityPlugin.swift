import Foundation
import Capacitor
import ActivityKit

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
            call.resolve(["available": ActivityAuthorizationInfo().areActivitiesEnabled])
        } else {
            call.resolve(["available": false])
        }
    }

    @objc func start(_ call: CAPPluginCall) {
        if #available(iOS 16.1, *) {
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
                let act = try Activity<OBubbaTimerAttributes>.request(
                    attributes: attributes,
                    content: .init(state: state, staleDate: nil),
                    pushType: nil
                )
                call.resolve(["activityId": act.id])
            } catch {
                call.reject("Failed to start Live Activity: \(error.localizedDescription)")
            }
        } else {
            call.reject("Live Activities require iOS 16.1+")
        }
    }

    @objc func update(_ call: CAPPluginCall) {
        if #available(iOS 16.1, *) {
            let elapsed = call.getInt("elapsed") ?? 0
            let side = call.getString("side")

            // Reconstruct the original start time from elapsed seconds.
            // Previously this used Date() which reset the timer display
            // on every update — the widget would show 0s elapsed instead
            // of the actual running time.
            let state = OBubbaTimerAttributes.ContentState(
                startTime: Date(timeIntervalSinceNow: -Double(elapsed)),
                elapsed: elapsed,
                side: side
            )

            Task {
                for act in Activity<OBubbaTimerAttributes>.activities {
                    await act.update(.init(state: state, staleDate: nil))
                }
                call.resolve()
            }
        } else {
            call.reject("Live Activities require iOS 16.1+")
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        if #available(iOS 16.1, *) {
            Task {
                for act in Activity<OBubbaTimerAttributes>.activities {
                    await act.end(nil, dismissalPolicy: .immediate)
                }
                call.resolve()
            }
        } else {
            call.resolve()
        }
    }
}
