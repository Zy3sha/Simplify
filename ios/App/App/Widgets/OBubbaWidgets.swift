import WidgetKit
import SwiftUI

// ══════════════════════════════════════════════════════════════════
// OBubba Home Screen & Lock Screen Widgets
// Shows baby's daily summary, last feed time, and quick actions
// ══════════════════════════════════════════════════════════════════

// ── Shared Data Model ───────────────────────────────────────────
struct WidgetData: Codable {
    let babyName: String
    let feedCount: Int
    let sleepCount: Int
    let nappyCount: Int
    let lastFeedTime: String?
    let lastFeedType: String?
    let lastSleepTime: String?
    let nextFeedEstimate: String?
    let theme: String
    let updatedAt: Double
}

// ── Timeline Provider ───────────────────────────────────────────
struct OBubbaTimelineProvider: TimelineProvider {
    private let appGroupId = "group.com.obubba.app"

    func placeholder(in context: Context) -> OBubbaEntry {
        OBubbaEntry(date: Date(), data: WidgetData(
            babyName: "Baby",
            feedCount: 4,
            sleepCount: 2,
            nappyCount: 3,
            lastFeedTime: "10:30",
            lastFeedType: "bottle",
            lastSleepTime: "09:00",
            nextFeedEstimate: "13:30",
            theme: "light",
            updatedAt: Date().timeIntervalSince1970 * 1000
        ))
    }

    func getSnapshot(in context: Context, completion: @escaping (OBubbaEntry) -> Void) {
        completion(loadEntry())
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<OBubbaEntry>) -> Void) {
        let entry = loadEntry()
        // Refresh every 15 minutes
        let nextUpdate = Calendar.current.date(byAdding: .minute, value: 15, to: Date())!
        let timeline = Timeline(entries: [entry], policy: .after(nextUpdate))
        completion(timeline)
    }

    private func loadEntry() -> OBubbaEntry {
        guard let defaults = UserDefaults(suiteName: appGroupId),
              let json = defaults.string(forKey: "widgetData"),
              let jsonData = json.data(using: .utf8),
              let data = try? JSONDecoder().decode(WidgetData.self, from: jsonData) else {
            return OBubbaEntry(date: Date(), data: WidgetData(
                babyName: "Baby",
                feedCount: 0,
                sleepCount: 0,
                nappyCount: 0,
                lastFeedTime: nil,
                lastFeedType: nil,
                lastSleepTime: nil,
                nextFeedEstimate: nil,
                theme: "light",
                updatedAt: Date().timeIntervalSince1970 * 1000
            ))
        }
        return OBubbaEntry(date: Date(), data: data)
    }
}

struct OBubbaEntry: TimelineEntry {
    let date: Date
    let data: WidgetData
}

// ── Small Widget (2x2) ─────────────────────────────────────────
struct OBubbaSmallWidgetView: View {
    let entry: OBubbaEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text("🍼")
                    .font(.title3)
                Text(entry.data.babyName)
                    .font(.system(.headline, design: .rounded))
                    .foregroundColor(Color(hex: "#5B4F5F"))
            }

            Spacer()

            if let lastFeed = entry.data.lastFeedTime {
                HStack(spacing: 4) {
                    Image(systemName: "drop.fill")
                        .font(.caption2)
                        .foregroundColor(Color(hex: "#C07088"))
                    Text("Fed \(lastFeed)")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
            }

            HStack(spacing: 12) {
                Label("\(entry.data.feedCount)", systemImage: "drop.fill")
                    .font(.caption2)
                    .foregroundColor(Color(hex: "#C07088"))
                Label("\(entry.data.nappyCount)", systemImage: "leaf.fill")
                    .font(.caption2)
                    .foregroundColor(Color(hex: "#7FB5A0"))
            }
        }
        .padding(12)
        .containerBackground(for: .widget) {
            LinearGradient(
                colors: [Color(hex: "#FBF5F3"), Color(hex: "#F0DDD6").opacity(0.5)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        }
    }
}

// ── Medium Widget (4x2) ─────────────────────────────────────────
struct OBubbaMediumWidgetView: View {
    let entry: OBubbaEntry

    var body: some View {
        HStack(spacing: 16) {
            // Left: Summary
            VStack(alignment: .leading, spacing: 8) {
                Text(entry.data.babyName)
                    .font(.system(.headline, design: .rounded))
                    .foregroundColor(Color(hex: "#5B4F5F"))

                VStack(alignment: .leading, spacing: 4) {
                    StatRow(icon: "drop.fill", label: "Feeds", count: entry.data.feedCount, color: "#C07088")
                    StatRow(icon: "moon.zzz.fill", label: "Sleeps", count: entry.data.sleepCount, color: "#8B7EC8")
                    StatRow(icon: "leaf.fill", label: "Nappies", count: entry.data.nappyCount, color: "#7FB5A0")
                }
            }

            Spacer()

            // Right: Last activity & next prediction
            VStack(alignment: .trailing, spacing: 8) {
                if let lastFeed = entry.data.lastFeedTime {
                    VStack(alignment: .trailing, spacing: 2) {
                        Text("Last feed")
                            .font(.caption2)
                            .foregroundColor(.secondary)
                        Text(lastFeed)
                            .font(.system(.title3, design: .monospaced))
                            .foregroundColor(Color(hex: "#C07088"))
                            .bold()
                    }
                }

                if let nextFeed = entry.data.nextFeedEstimate {
                    VStack(alignment: .trailing, spacing: 2) {
                        Text("Next feed ~")
                            .font(.caption2)
                            .foregroundColor(.secondary)
                        Text(nextFeed)
                            .font(.system(.callout, design: .monospaced))
                            .foregroundColor(Color(hex: "#5B4F5F"))
                    }
                }
            }
        }
        .padding(16)
        .containerBackground(for: .widget) {
            LinearGradient(
                colors: [Color(hex: "#FBF5F3"), Color(hex: "#F0DDD6").opacity(0.5)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        }
    }
}

// ── Lock Screen Widget (iOS 16+) ────────────────────────────────
@available(iOS 16.0, *)
struct OBubbaLockScreenWidget: View {
    let entry: OBubbaEntry

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: "drop.fill")
                .font(.caption)
            Text("\(entry.data.feedCount) feeds")
                .font(.caption)
            Text("·")
            Image(systemName: "moon.zzz.fill")
                .font(.caption)
            Text("\(entry.data.sleepCount) sleeps")
                .font(.caption)
        }
    }
}

// ── Stat Row Helper ─────────────────────────────────────────────
struct StatRow: View {
    let icon: String
    let label: String
    let count: Int
    let color: String

    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: icon)
                .font(.caption2)
                .foregroundColor(Color(hex: color))
                .frame(width: 14)
            Text("\(count) \(label)")
                .font(.caption)
                .foregroundColor(.secondary)
        }
    }
}

// ── Widget Configuration ────────────────────────────────────────
struct OBubbaSummaryWidget: Widget {
    let kind: String = "OBubbaSummary"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: OBubbaTimelineProvider()) { entry in
            if #available(iOS 17.0, *) {
                OBubbaMediumWidgetView(entry: entry)
            } else {
                OBubbaMediumWidgetView(entry: entry)
            }
        }
        .configurationDisplayName("Baby Summary")
        .description("See your baby's daily feeds, sleeps, and nappies at a glance.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

@available(iOS 16.0, *)
struct OBubbaLockScreenAccessoryWidget: Widget {
    let kind: String = "OBubbaLockScreen"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: OBubbaTimelineProvider()) { entry in
            OBubbaLockScreenWidget(entry: entry)
        }
        .configurationDisplayName("Baby Stats")
        .description("Quick baby stats on your Lock Screen.")
        .supportedFamilies([.accessoryRectangular, .accessoryInline])
    }
}

// ── Widget Bundle ───────────────────────────────────────────────
@main
struct OBubbaWidgetBundle: WidgetBundle {
    var body: some Widget {
        OBubbaSummaryWidget()
        if #available(iOS 16.0, *) {
            OBubbaLockScreenAccessoryWidget()
        }
        if #available(iOS 16.1, *) {
            OBubbaTimerLiveActivity()
        }
    }
}
