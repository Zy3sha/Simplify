import WidgetKit
import SwiftUI

// ══════════════════════════════════════════════════════════════════
// OBubba Widgets — Home Screen, Lock Screen & Live Activity
// ══════════════════════════════════════════════════════════════════

// ── Brand Colors ─────────────────────────────────────────────────
private let brandRose    = Color(hex: "#C07088")
private let brandDeep    = Color(hex: "#5B4F5F")
private let brandWarm    = Color(hex: "#F0DDD6")
private let brandBg      = Color(hex: "#FBF5F3")
private let brandMint    = Color(hex: "#50C878")
private let brandPurple  = Color(hex: "#8B7EC8")
private let brandGreen   = Color(hex: "#7FB5A0")

// ── Shared Data Model ────────────────────────────────────────────
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

// ── Timeline Provider ────────────────────────────────────────────
struct OBubbaTimelineProvider: TimelineProvider {
    private let appGroupId = "group.com.obubba.app"

    func placeholder(in context: Context) -> OBubbaEntry {
        OBubbaEntry(date: Date(), data: WidgetData(
            babyName: "Oliver",
            feedCount: 4, sleepCount: 2, nappyCount: 3,
            lastFeedTime: "10:30", lastFeedType: "bottle",
            lastSleepTime: "09:15", nextFeedEstimate: "13:30",
            theme: "light",
            updatedAt: Date().timeIntervalSince1970 * 1000
        ))
    }

    func getSnapshot(in context: Context, completion: @escaping (OBubbaEntry) -> Void) {
        completion(loadEntry())
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<OBubbaEntry>) -> Void) {
        let entry = loadEntry()
        let nextUpdate = Calendar.current.date(byAdding: .minute, value: 15, to: Date())!
        completion(Timeline(entries: [entry], policy: .after(nextUpdate)))
    }

    private func loadEntry() -> OBubbaEntry {
        guard let defaults = UserDefaults(suiteName: appGroupId),
              let json = defaults.string(forKey: "widgetData"),
              let jsonData = json.data(using: .utf8),
              let data = try? JSONDecoder().decode(WidgetData.self, from: jsonData) else {
            return placeholder(in: TimelineProviderContext() as! Context)
        }
        return OBubbaEntry(date: Date(), data: data)
    }
}

struct OBubbaEntry: TimelineEntry {
    let date: Date
    let data: WidgetData
}

// ── Stat Pill ────────────────────────────────────────────────────
struct StatPill: View {
    let icon: String
    let count: Int
    let color: Color

    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: icon)
                .font(.system(size: 10, weight: .semibold))
                .foregroundColor(color)
            Text("\(count)")
                .font(.system(size: 13, weight: .bold, design: .rounded))
                .foregroundColor(brandDeep)
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 5)
        .background(color.opacity(0.1))
        .clipShape(Capsule())
    }
}

// ── Small Widget (2×2) ───────────────────────────────────────────
struct OBubbaSmallWidgetView: View {
    let entry: OBubbaEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Header
            HStack(spacing: 6) {
                Text("🧸")
                    .font(.system(size: 16))
                Text(entry.data.babyName)
                    .font(.system(size: 15, weight: .bold, design: .rounded))
                    .foregroundColor(brandDeep)
            }
            .padding(.bottom, 8)

            Spacer()

            // Stats
            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 5) {
                    Image(systemName: "drop.fill")
                        .font(.system(size: 9))
                        .foregroundColor(brandRose)
                        .frame(width: 14)
                    Text("\(entry.data.feedCount) Feeds")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(brandDeep.opacity(0.8))
                }
                HStack(spacing: 5) {
                    Image(systemName: "moon.zzz.fill")
                        .font(.system(size: 9))
                        .foregroundColor(brandPurple)
                        .frame(width: 14)
                    Text("\(entry.data.sleepCount) Sleeps")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(brandDeep.opacity(0.8))
                }
                HStack(spacing: 5) {
                    Image(systemName: "leaf.fill")
                        .font(.system(size: 9))
                        .foregroundColor(brandGreen)
                        .frame(width: 14)
                    Text("\(entry.data.nappyCount) Nappies")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(brandDeep.opacity(0.8))
                }
            }

            Spacer()

            // Last feed
            if let lastFeed = entry.data.lastFeedTime {
                Text("Fed at \(lastFeed)")
                    .font(.system(size: 10, weight: .medium))
                    .foregroundColor(brandRose.opacity(0.7))
            }
        }
        .padding(14)
        .containerBackground(for: .widget) {
            LinearGradient(
                colors: [brandBg, brandWarm.opacity(0.4)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        }
    }
}

// ── Medium Widget (4×2) ──────────────────────────────────────────
struct OBubbaMediumWidgetView: View {
    let entry: OBubbaEntry

    var body: some View {
        HStack(spacing: 0) {
            // Left — Baby name + stat pills
            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 6) {
                    Text("🧸")
                        .font(.system(size: 18))
                    VStack(alignment: .leading, spacing: 1) {
                        Text(entry.data.babyName)
                            .font(.system(size: 17, weight: .bold, design: .rounded))
                            .foregroundColor(brandDeep)
                        Text("Today's Summary")
                            .font(.system(size: 10, weight: .medium))
                            .foregroundColor(brandDeep.opacity(0.45))
                    }
                }

                HStack(spacing: 6) {
                    StatPill(icon: "drop.fill", count: entry.data.feedCount, color: brandRose)
                    StatPill(icon: "moon.zzz.fill", count: entry.data.sleepCount, color: brandPurple)
                    StatPill(icon: "leaf.fill", count: entry.data.nappyCount, color: brandGreen)
                }
            }

            Spacer()

            // Right — Times
            VStack(alignment: .trailing, spacing: 10) {
                if let lastFeed = entry.data.lastFeedTime {
                    VStack(alignment: .trailing, spacing: 2) {
                        Text("Last feed")
                            .font(.system(size: 9, weight: .semibold))
                            .foregroundColor(brandDeep.opacity(0.4))
                            .textCase(.uppercase)
                        Text(lastFeed)
                            .font(.system(size: 22, weight: .bold, design: .rounded))
                            .foregroundColor(brandRose)
                    }
                }

                if let nextFeed = entry.data.nextFeedEstimate {
                    VStack(alignment: .trailing, spacing: 2) {
                        Text("Next ~")
                            .font(.system(size: 9, weight: .semibold))
                            .foregroundColor(brandDeep.opacity(0.4))
                            .textCase(.uppercase)
                        Text(nextFeed)
                            .font(.system(size: 16, weight: .semibold, design: .rounded))
                            .foregroundColor(brandDeep.opacity(0.7))
                    }
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
        .containerBackground(for: .widget) {
            LinearGradient(
                colors: [brandBg, brandWarm.opacity(0.4)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        }
    }
}

// ── Lock Screen Widget ───────────────────────────────────────────
@available(iOS 16.0, *)
struct OBubbaLockScreenWidget: View {
    let entry: OBubbaEntry

    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: "drop.fill").font(.caption2)
            Text("\(entry.data.feedCount)")
                .font(.system(.caption, design: .rounded)).bold()
            Text("·").foregroundColor(.secondary)
            Image(systemName: "moon.zzz.fill").font(.caption2)
            Text("\(entry.data.sleepCount)")
                .font(.system(.caption, design: .rounded)).bold()
            Text("·").foregroundColor(.secondary)
            Image(systemName: "leaf.fill").font(.caption2)
            Text("\(entry.data.nappyCount)")
                .font(.system(.caption, design: .rounded)).bold()
        }
    }
}

// ── Widget Configurations ────────────────────────────────────────
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

// ── Live Activity ────────────────────────────────────────────────
import ActivityKit

struct OBubbaTimerAttributes: ActivityAttributes {
    let timerType: String
    let babyName: String

    struct ContentState: Codable, Hashable {
        let startTime: Date
        let elapsed: Int
        let side: String?
    }
}

@available(iOS 16.1, *)
struct OBubbaTimerLiveActivity: Widget {
    let kind: String = "OBubbaTimer"

    var body: some WidgetConfiguration {
        ActivityConfiguration(for: OBubbaTimerAttributes.self) { context in
            // Lock Screen banner
            HStack(spacing: 14) {
                // Icon circle
                ZStack {
                    Circle()
                        .fill(brandRose.opacity(0.12))
                        .frame(width: 40, height: 40)
                    Image(systemName: context.attributes.timerType == "feed" ? "drop.fill" : "moon.zzz.fill")
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundColor(brandRose)
                }

                VStack(alignment: .leading, spacing: 2) {
                    Text("\(context.attributes.babyName)'s \(context.attributes.timerType == "feed" ? "Feed" : "Sleep")")
                        .font(.system(size: 15, weight: .bold, design: .rounded))
                        .foregroundColor(brandDeep)
                    if let side = context.state.side {
                        Text("\(side.capitalized) side")
                            .font(.system(size: 12, weight: .medium))
                            .foregroundColor(brandDeep.opacity(0.5))
                    }
                }

                Spacer()

                Text(context.state.startTime, style: .timer)
                    .font(.system(size: 28, weight: .bold, design: .rounded))
                    .foregroundColor(brandRose)
                    .monospacedDigit()
            }
            .padding(.horizontal, 18)
            .padding(.vertical, 14)
            .background(
                LinearGradient(
                    colors: [brandBg, brandWarm.opacity(0.3)],
                    startPoint: .leading,
                    endPoint: .trailing
                )
            )

        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Image(systemName: context.attributes.timerType == "feed" ? "drop.fill" : "moon.zzz.fill")
                        .foregroundColor(brandRose)
                        .font(.title3)
                }
                DynamicIslandExpandedRegion(.center) {
                    VStack(spacing: 2) {
                        Text("\(context.attributes.babyName)'s \(context.attributes.timerType == "feed" ? "Feed" : "Sleep")")
                            .font(.system(size: 14, weight: .bold, design: .rounded))
                        if let side = context.state.side {
                            Text("\(side.capitalized) side")
                                .font(.caption2)
                                .foregroundColor(.secondary)
                        }
                    }
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Text(context.state.startTime, style: .timer)
                        .font(.system(.title3, design: .rounded))
                        .foregroundColor(brandRose)
                        .bold()
                        .monospacedDigit()
                }
            } compactLeading: {
                Image(systemName: context.attributes.timerType == "feed" ? "drop.fill" : "moon.zzz.fill")
                    .foregroundColor(brandRose)
            } compactTrailing: {
                Text(context.state.startTime, style: .timer)
                    .font(.system(.caption, design: .rounded))
                    .foregroundColor(brandRose)
                    .bold()
                    .monospacedDigit()
            } minimal: {
                Image(systemName: context.attributes.timerType == "feed" ? "drop.fill" : "moon.zzz.fill")
                    .foregroundColor(brandRose)
            }
        }
    }
}

// ── Widget Bundle ────────────────────────────────────────────────
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

// ── Color Helper ─────────────────────────────────────────────────
extension Color {
    init(hex: String) {
        let h = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: h).scanHexInt64(&int)
        let r, g, b: Double
        switch h.count {
        case 6:
            r = Double((int >> 16) & 0xFF) / 255
            g = Double((int >> 8) & 0xFF) / 255
            b = Double(int & 0xFF) / 255
        default:
            r = 1; g = 1; b = 1
        }
        self.init(red: r, green: g, blue: b)
    }
}
