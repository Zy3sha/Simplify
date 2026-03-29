import ActivityKit
import SwiftUI

/// Defines the Live Activity for active feed/sleep timers.
/// Shows on Lock Screen and Dynamic Island while a timer is running.
struct OBubbaTimerAttributes: ActivityAttributes {
    /// Static data that doesn't change during the activity
    let timerType: String   // "feed" or "sleep"
    let babyName: String

    /// Dynamic data that updates during the activity
    struct ContentState: Codable, Hashable {
        let startTime: Date
        let elapsed: Int     // seconds
        let side: String?    // "left" or "right" for breastfeeding
    }
}

// ── Lock Screen / Dynamic Island Widget Views ──
@available(iOS 16.1, *)
struct OBubbaTimerLiveActivity: Widget {
    let kind: String = "OBubbaTimer"

    var body: some WidgetConfiguration {
        ActivityConfiguration(for: OBubbaTimerAttributes.self) { context in
            // Lock Screen banner
            HStack(spacing: 16) {
                // Timer icon
                Image(systemName: context.attributes.timerType == "feed" ? "drop.fill" : "moon.zzz.fill")
                    .font(.title2)
                    .foregroundColor(Color(hex: "#C07088"))

                VStack(alignment: .leading, spacing: 2) {
                    Text("\(context.attributes.babyName)'s \(context.attributes.timerType == "feed" ? "Feed" : "Sleep")")
                        .font(.headline)
                        .foregroundColor(.primary)

                    if let side = context.state.side {
                        Text("\(side.capitalized) side")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                }

                Spacer()

                // Live timer
                Text(context.state.startTime, style: .timer)
                    .font(.system(.title, design: .monospaced))
                    .foregroundColor(Color(hex: "#C07088"))
                    .monospacedDigit()
            }
            .padding(16)
            .background(Color(hex: "#FBF5F3"))

        } dynamicIsland: { context in
            DynamicIsland {
                // Expanded view
                DynamicIslandExpandedRegion(.leading) {
                    Image(systemName: context.attributes.timerType == "feed" ? "drop.fill" : "moon.zzz.fill")
                        .foregroundColor(Color(hex: "#C07088"))
                }
                DynamicIslandExpandedRegion(.center) {
                    VStack(spacing: 2) {
                        Text("\(context.attributes.babyName)'s \(context.attributes.timerType == "feed" ? "Feed" : "Sleep")")
                            .font(.headline)
                        if let side = context.state.side {
                            Text("\(side.capitalized) side")
                                .font(.caption2)
                                .foregroundColor(.secondary)
                        }
                    }
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Text(context.state.startTime, style: .timer)
                        .font(.system(.title3, design: .monospaced))
                        .foregroundColor(Color(hex: "#C07088"))
                        .monospacedDigit()
                }
            } compactLeading: {
                Image(systemName: context.attributes.timerType == "feed" ? "drop.fill" : "moon.zzz.fill")
                    .foregroundColor(Color(hex: "#C07088"))
            } compactTrailing: {
                Text(context.state.startTime, style: .timer)
                    .font(.system(.caption, design: .monospaced))
                    .foregroundColor(Color(hex: "#C07088"))
                    .monospacedDigit()
            } minimal: {
                Image(systemName: context.attributes.timerType == "feed" ? "drop.fill" : "moon.zzz.fill")
                    .foregroundColor(Color(hex: "#C07088"))
            }
        }
    }
}

// Helper for hex colors in SwiftUI
extension Color {
    init(hex: String) {
        let hex = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&int)
        let a, r, g, b: UInt64
        switch hex.count {
        case 6: (a, r, g, b) = (255, int >> 16, int >> 8 & 0xFF, int & 0xFF)
        case 8: (a, r, g, b) = (int >> 24, int >> 16 & 0xFF, int >> 8 & 0xFF, int & 0xFF)
        default: (a, r, g, b) = (255, 0, 0, 0)
        }
        self.init(.sRGB, red: Double(r) / 255, green: Double(g) / 255, blue: Double(b) / 255, opacity: Double(a) / 255)
    }
}
