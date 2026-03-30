import ActivityKit
import SwiftUI

/// Defines the Live Activity for active feed/sleep timers.
/// Shared between main app (start/update) and widget extension (UI).
struct OBubbaTimerAttributes: ActivityAttributes {
    /// Static data that doesn't change during the activity
    let timerType: String   // "feed" or "sleep"
    let babyName: String

    /// Dynamic data that updates during the activity
    struct ContentState: Codable, Hashable {
        let startTime: Date
        let elapsed: Int     // seconds
        let side: String?    // "left" or "right" for breastfeeding
        let nextNap: String? // e.g. "Nap 2:00pm" or "Bed 7:30pm"
    }
}

/// Prediction countdown Live Activity — shows next nap/bedtime on lock screen
struct OBubbaPredictionAttributes: ActivityAttributes {
    let babyName: String

    struct ContentState: Codable, Hashable {
        let targetTime: Date       // The predicted nap/bedtime
        let label: String          // e.g. "Nap 2" or "Bedtime"
        let timeFormatted: String  // e.g. "2:00 pm" or "7:30 pm"
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
