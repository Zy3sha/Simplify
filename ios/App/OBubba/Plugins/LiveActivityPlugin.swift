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
        CAPPluginMethod(name: "startPrediction", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "updatePrediction", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopPrediction", returnType: CAPPluginReturnPromise),
    ]

    @objc func isAvailable(_ call: CAPPluginCall) {
        if #available(iOS 16.1, *) {
            call.resolve(["available": ActivityAuthorizationInfo().areActivitiesEnabled])
        } else {
            call.resolve(["available": false])
        }
    }

    @objc func start(_ call: CAPPluginCall) {
        guard #available(iOS 16.1, *) else {
            call.reject("Live Activities require iOS 16.1+")
            return
        }

        let type = call.getString("type") ?? "feed"
        let babyName = call.getString("babyName") ?? "Baby"
        let startTime = call.getDouble("startTime") ?? Date().timeIntervalSince1970 * 1000
        let side = call.getString("side")
        let nextNap = call.getString("nextNap")

        let attributes = OBubbaTimerAttributes(
            timerType: type,
            babyName: babyName
        )

        let state = OBubbaTimerAttributes.ContentState(
            startTime: Date(timeIntervalSince1970: startTime / 1000),
            elapsed: 0,
            side: side,
            nextNap: nextNap
        )

        // End any existing activities first to prevent duplicates
        Task {
            for existing in Activity<OBubbaTimerAttributes>.activities {
                await existing.end(nil, dismissalPolicy: .immediate)
            }

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
        }
    }

    @objc func update(_ call: CAPPluginCall) {
        guard #available(iOS 16.1, *) else {
            call.reject("Live Activities require iOS 16.1+")
            return
        }

        let elapsed = call.getInt("elapsed") ?? 0
        let side = call.getString("side")
        let nextNap = call.getString("nextNap")

        let state = OBubbaTimerAttributes.ContentState(
            startTime: Date(timeIntervalSinceNow: -Double(elapsed)),
            elapsed: elapsed,
            side: side,
            nextNap: nextNap
        )

        Task {
            for activity in Activity<OBubbaTimerAttributes>.activities {
                await activity.update(.init(state: state, staleDate: nil))
            }
            call.resolve()
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        guard #available(iOS 16.1, *) else {
            call.resolve()
            return
        }

        Task {
            for activity in Activity<OBubbaTimerAttributes>.activities {
                await activity.end(nil, dismissalPolicy: .immediate)
            }
            call.resolve()
        }
    }

    // ── Prediction Countdown Live Activity ──

    @objc func startPrediction(_ call: CAPPluginCall) {
        guard #available(iOS 16.1, *) else {
            call.reject("Live Activities require iOS 16.1+")
            return
        }

        let babyName = call.getString("babyName") ?? "Baby"
        let targetMs = call.getDouble("targetTime") ?? 0
        let label = call.getString("label") ?? "Nap"
        let timeFormatted = call.getString("timeFormatted") ?? ""

        let attributes = OBubbaPredictionAttributes(babyName: babyName)
        let state = OBubbaPredictionAttributes.ContentState(
            targetTime: Date(timeIntervalSince1970: targetMs / 1000),
            label: label,
            timeFormatted: timeFormatted
        )

        Task {
            // End any existing prediction activities
            for existing in Activity<OBubbaPredictionAttributes>.activities {
                await existing.end(nil, dismissalPolicy: .immediate)
            }

            do {
                let activity = try Activity.request(
                    attributes: attributes,
                    content: .init(state: state, staleDate: nil),
                    pushType: nil
                )
                call.resolve(["activityId": activity.id])
            } catch {
                call.reject("Failed to start Prediction LA: \(error.localizedDescription)")
            }
        }
    }

    @objc func updatePrediction(_ call: CAPPluginCall) {
        guard #available(iOS 16.1, *) else {
            call.reject("Live Activities require iOS 16.1+")
            return
        }

        let targetMs = call.getDouble("targetTime") ?? 0
        let label = call.getString("label") ?? "Nap"
        let timeFormatted = call.getString("timeFormatted") ?? ""

        let state = OBubbaPredictionAttributes.ContentState(
            targetTime: Date(timeIntervalSince1970: targetMs / 1000),
            label: label,
            timeFormatted: timeFormatted
        )

        Task {
            for activity in Activity<OBubbaPredictionAttributes>.activities {
                await activity.update(.init(state: state, staleDate: nil))
            }
            call.resolve()
        }
    }

    @objc func stopPrediction(_ call: CAPPluginCall) {
        guard #available(iOS 16.1, *) else {
            call.resolve()
            return
        }

        Task {
            for activity in Activity<OBubbaPredictionAttributes>.activities {
                await activity.end(nil, dismissalPolicy: .immediate)
            }
            call.resolve()
        }
    }
}
