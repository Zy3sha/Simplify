import WidgetKit
import SwiftUI
import AppIntents
import ActivityKit

// ══════════════════════════════════════════════════════════════════
// OBubba Widgets — Home Screen, Lock Screen, Live Activity & Interactive
// Premium redesign — clean, airy, elegant
// ══════════════════════════════════════════════════════════════════

// ── Widget AppIntents (must be in widget target) ─────────────────

private let widgetAppGroupId = "group.com.obubba.app"

private func widgetStorePendingEntry(_ dict: [String: Any]) {
    var entry = dict
    let fmt = DateFormatter()
    fmt.dateFormat = "HH:mm"
    entry["time"] = fmt.string(from: Date())
    guard let data = try? JSONSerialization.data(withJSONObject: entry),
          let json = String(data: data, encoding: .utf8),
          let defaults = UserDefaults(suiteName: widgetAppGroupId) else { return }
    defaults.set(json, forKey: "pendingSiriEntry")
    defaults.synchronize()
}

@available(iOS 17.0, *)
struct OBWidgetLogFeedIntent: AppIntent {
    static var title: LocalizedStringResource = "Quick Log Feed"
    static var description = IntentDescription("Log a feed from the widget")
    static var openAppWhenRun: Bool = true
    func perform() async throws -> some IntentResult {
        widgetStorePendingEntry(["type": "feed", "feedType": "bottle", "source": "widget"])
        return .result()
    }
}

@available(iOS 17.0, *)
struct OBWidgetLogNappyIntent: AppIntent {
    static var title: LocalizedStringResource = "Quick Log Nappy"
    static var description = IntentDescription("Log a nappy from the widget")
    static var openAppWhenRun: Bool = true
    func perform() async throws -> some IntentResult {
        widgetStorePendingEntry(["type": "poop", "poopType": "wet", "source": "widget"])
        return .result()
    }
}

@available(iOS 17.0, *)
struct OBWidgetToggleTimerIntent: AppIntent {
    static var title: LocalizedStringResource = "Toggle Timer"
    static var description = IntentDescription("Start or stop the nap timer from widget")
    static var openAppWhenRun: Bool = true
    func perform() async throws -> some IntentResult {
        let defaults = UserDefaults(suiteName: widgetAppGroupId)
        let hasActiveTimer: Bool
        if let json = defaults?.string(forKey: "widgetData"),
           let data = json.data(using: .utf8),
           let dict = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
           let timer = dict["activeTimer"] as? String, !timer.isEmpty {
            hasActiveTimer = true
        } else {
            hasActiveTimer = false
        }
        if hasActiveTimer {
            widgetStorePendingEntry(["type": "nap_stop", "source": "widget"])
        } else {
            widgetStorePendingEntry(["type": "nap_start", "source": "widget"])
        }
        return .result()
    }
}

@available(iOS 17.0, *)
struct OBWidgetBreastLeftIntent: AppIntent {
    static var title: LocalizedStringResource = "Start Left Breast"
    static var description = IntentDescription("Start left breast feed timer from widget")
    static var openAppWhenRun: Bool = true
    func perform() async throws -> some IntentResult {
        widgetStorePendingEntry(["type": "breast_start", "side": "left", "source": "widget"])
        return .result()
    }
}

@available(iOS 17.0, *)
struct OBWidgetBreastRightIntent: AppIntent {
    static var title: LocalizedStringResource = "Start Right Breast"
    static var description = IntentDescription("Start right breast feed timer from widget")
    static var openAppWhenRun: Bool = true
    func perform() async throws -> some IntentResult {
        widgetStorePendingEntry(["type": "breast_start", "side": "right", "source": "widget"])
        return .result()
    }
}

// ══════════════════════════════════════════════════════════════════
// MARK: - Design System
// ══════════════════════════════════════════════════════════════════

private let brandRose    = Color(hex: "#C07088")
private let brandDeep    = Color(hex: "#5B4F5F")
private let brandWarm    = Color(hex: "#F0DDD6")
private let brandBg      = Color(hex: "#FBF5F3")
private let brandCream   = Color(hex: "#FAF0EB")
private let brandMint    = Color(hex: "#6FA898")
private let brandPurple  = Color(hex: "#8B7EC8")
private let brandSky     = Color(hex: "#7AABC4")
private let brandGold    = Color(hex: "#D4A855")

// ══════════════════════════════════════════════════════════════════
// MARK: - Data Model
// ══════════════════════════════════════════════════════════════════

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
    let lastFeedAmount: Double?
    let lastNappyTime: String?
    let lastNappyType: String?
    let nextPrediction: String?
    let activeTimer: String?
    let timerStartTime: String?
    let timerStartMs: Double?
    let timerLabel: String?
    let breastSide: String?
    let showNursing: Bool?
    let lastBreastSide: String?

    enum CodingKeys: String, CodingKey {
        case babyName, feedCount, sleepCount, nappyCount
        case lastFeedTime, lastFeedType, lastSleepTime, nextFeedEstimate
        case theme, updatedAt, lastFeedAmount
        case lastNappyTime, lastNappyType, nextPrediction
        case activeTimer, timerStartTime, timerStartMs, timerLabel
        case breastSide, showNursing, lastBreastSide
    }

    private static func flexInt(_ c: KeyedDecodingContainer<CodingKeys>, _ key: CodingKeys) -> Int {
        if let v = try? c.decodeIfPresent(Int.self, forKey: key) { return v }
        if let v = try? c.decodeIfPresent(Double.self, forKey: key) { return Int(v) }
        if let s = try? c.decodeIfPresent(String.self, forKey: key), let v = Int(s) { return v }
        return 0
    }
    private static func flexDouble(_ c: KeyedDecodingContainer<CodingKeys>, _ key: CodingKeys) -> Double? {
        if let v = try? c.decodeIfPresent(Double.self, forKey: key) { return v }
        if let v = try? c.decodeIfPresent(Int.self, forKey: key) { return Double(v) }
        if let s = try? c.decodeIfPresent(String.self, forKey: key), let v = Double(s) { return v }
        return nil
    }
    private static func flexString(_ c: KeyedDecodingContainer<CodingKeys>, _ key: CodingKeys) -> String? {
        if let v = try? c.decodeIfPresent(String.self, forKey: key) { return v }
        if let v = try? c.decodeIfPresent(Double.self, forKey: key) { return String(v) }
        if let v = try? c.decodeIfPresent(Int.self, forKey: key) { return String(v) }
        return nil
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        babyName = (try? c.decodeIfPresent(String.self, forKey: .babyName)) ?? "Baby"
        feedCount = Self.flexInt(c, .feedCount)
        sleepCount = Self.flexInt(c, .sleepCount)
        nappyCount = Self.flexInt(c, .nappyCount)
        lastFeedTime = Self.flexString(c, .lastFeedTime)
        lastFeedType = Self.flexString(c, .lastFeedType)
        lastSleepTime = Self.flexString(c, .lastSleepTime)
        nextFeedEstimate = Self.flexString(c, .nextFeedEstimate)
        theme = (try? c.decodeIfPresent(String.self, forKey: .theme)) ?? "light"
        updatedAt = Self.flexDouble(c, .updatedAt) ?? 0
        lastFeedAmount = Self.flexDouble(c, .lastFeedAmount)
        lastNappyTime = Self.flexString(c, .lastNappyTime)
        lastNappyType = Self.flexString(c, .lastNappyType)
        nextPrediction = Self.flexString(c, .nextPrediction)
        activeTimer = Self.flexString(c, .activeTimer)
        timerStartTime = Self.flexString(c, .timerStartTime)
        timerStartMs = Self.flexDouble(c, .timerStartMs)
        timerLabel = Self.flexString(c, .timerLabel)
        breastSide = Self.flexString(c, .breastSide)
        showNursing = (try? c.decodeIfPresent(Bool.self, forKey: .showNursing)) ?? false
        lastBreastSide = Self.flexString(c, .lastBreastSide)
    }

    init(babyName: String, feedCount: Int, sleepCount: Int, nappyCount: Int,
         lastFeedTime: String?, lastFeedType: String?, lastSleepTime: String?,
         nextFeedEstimate: String?, theme: String, updatedAt: Double) {
        self.babyName = babyName; self.feedCount = feedCount; self.sleepCount = sleepCount
        self.nappyCount = nappyCount; self.lastFeedTime = lastFeedTime
        self.lastFeedType = lastFeedType; self.lastSleepTime = lastSleepTime
        self.nextFeedEstimate = nextFeedEstimate; self.theme = theme; self.updatedAt = updatedAt
        self.lastFeedAmount = nil; self.lastNappyTime = nil; self.lastNappyType = nil
        self.nextPrediction = nil; self.activeTimer = nil; self.timerStartTime = nil
        self.timerStartMs = nil; self.timerLabel = nil; self.breastSide = nil
        self.showNursing = nil; self.lastBreastSide = nil
    }

    var timerStartDate: Date? {
        if let ms = timerStartMs, ms > 1_000_000_000_000 {
            return Date(timeIntervalSince1970: ms / 1000.0)
        }
        if let ms = timerStartMs, ms > 0 {
            let cal = Calendar.current; let now = Date()
            var comp = cal.dateComponents([.year, .month, .day], from: now)
            comp.hour = Int(ms) / 60; comp.minute = Int(ms) % 60
            if let d = cal.date(from: comp) { return d > now ? cal.date(byAdding: .day, value: -1, to: d) : d }
        }
        if let t = timerStartTime {
            let parts = t.split(separator: ":").compactMap { Int($0) }
            if parts.count >= 2 {
                let cal = Calendar.current; let now = Date()
                var comp = cal.dateComponents([.year, .month, .day], from: now)
                comp.hour = parts[0]; comp.minute = parts[1]
                if let d = cal.date(from: comp) { return d > now ? cal.date(byAdding: .day, value: -1, to: d) : d }
            }
        }
        return nil
    }
}

// ══════════════════════════════════════════════════════════════════
// MARK: - Timeline Provider
// ══════════════════════════════════════════════════════════════════

struct OBubbaTimelineProvider: TimelineProvider {
    private let appGroupId = "group.com.obubba.app"

    func placeholder(in context: Context) -> OBubbaEntry {
        OBubbaEntry(date: Date(), data: WidgetData(
            babyName: "Oliver", feedCount: 4, sleepCount: 2, nappyCount: 3,
            lastFeedTime: "10:30", lastFeedType: "bottle",
            lastSleepTime: "09:15", nextFeedEstimate: "13:30",
            theme: "light", updatedAt: Date().timeIntervalSince1970 * 1000
        ))
    }

    func getSnapshot(in context: Context, completion: @escaping (OBubbaEntry) -> Void) {
        completion(loadEntry())
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<OBubbaEntry>) -> Void) {
        let entry = loadEntry()
        let interval = entry.data.activeTimer != nil ? 1 : 15
        let nextUpdate = Calendar.current.date(byAdding: .minute, value: interval, to: Date())!
        completion(Timeline(entries: [entry], policy: .after(nextUpdate)))
    }

    private func sharedFileURL() -> URL? {
        FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroupId)?
            .appendingPathComponent("widgetData.json")
    }

    private func loadEntry() -> OBubbaEntry {
        let fallback = OBubbaEntry(date: Date(), data: WidgetData(
            babyName: "Baby", feedCount: 0, sleepCount: 0, nappyCount: 0,
            lastFeedTime: nil, lastFeedType: nil, lastSleepTime: nil, nextFeedEstimate: nil,
            theme: "light", updatedAt: Date().timeIntervalSince1970 * 1000
        ))
        if let fileURL = sharedFileURL(), let jsonData = try? Data(contentsOf: fileURL) {
            if let data = try? JSONDecoder().decode(WidgetData.self, from: jsonData) {
                return OBubbaEntry(date: Date(), data: data)
            }
        }
        if let defaults = UserDefaults(suiteName: appGroupId),
           let json = defaults.string(forKey: "widgetData"),
           let jsonData = json.data(using: .utf8),
           let data = try? JSONDecoder().decode(WidgetData.self, from: jsonData) {
            return OBubbaEntry(date: Date(), data: data)
        }
        return fallback
    }
}

struct OBubbaEntry: TimelineEntry {
    let date: Date
    let data: WidgetData
}

// ══════════════════════════════════════════════════════════════════
// MARK: - Reusable Components
// ══════════════════════════════════════════════════════════════════

// ── Stat Ring: circular icon badge with count ────────────────────
struct StatRing: View {
    let icon: String
    let count: Int
    let color: Color
    let size: CGFloat

    init(icon: String, count: Int, color: Color, size: CGFloat = 36) {
        self.icon = icon; self.count = count; self.color = color; self.size = size
    }

    var body: some View {
        VStack(spacing: 3) {
            ZStack {
                Circle()
                    .fill(color.opacity(0.12))
                    .frame(width: size, height: size)
                Image(systemName: icon)
                    .font(.system(size: size * 0.33, weight: .semibold))
                    .foregroundColor(color)
            }
            Text("\(count)")
                .font(.system(size: 15, weight: .bold, design: .rounded))
                .foregroundColor(brandDeep)
        }
    }
}

// ── Action Button for medium widget ──────────────────────────────
struct ActionBtn: View {
    let icon: String
    let label: String
    let color: Color
    let filled: Bool

    init(icon: String, label: String, color: Color, filled: Bool = false) {
        self.icon = icon; self.label = label; self.color = color; self.filled = filled
    }

    var body: some View {
        VStack(spacing: 3) {
            Image(systemName: icon)
                .font(.system(size: 14, weight: .semibold))
            Text(label)
                .font(.system(size: 10, weight: .bold))
        }
        .foregroundColor(filled ? Color.white : color)
        .frame(maxWidth: .infinity)
        .frame(height: 48)
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(filled ? color : color.opacity(0.12))
        )
        .environment(\.colorScheme, .light)
    }
}

// ── Breast side button ───────────────────────────────────────────
struct BreastBtn: View {
    let letter: String
    let isNext: Bool

    var body: some View {
        VStack(spacing: 2) {
            Text(letter)
                .font(.system(size: 16, weight: .black, design: .rounded))
            if isNext {
                Text("next")
                    .font(.system(size: 8, weight: .bold))
                    .textCase(.uppercase)
            }
        }
        .foregroundColor(isNext ? Color.white : brandRose)
        .frame(maxWidth: .infinity)
        .frame(height: 48)
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(isNext ? brandRose : brandRose.opacity(0.12))
        )
        .environment(\.colorScheme, .light)
    }
}

// ══════════════════════════════════════════════════════════════════
// MARK: - Small Widget (2×2)
// ══════════════════════════════════════════════════════════════════

struct OBubbaSmallWidgetView: View {
    let entry: OBubbaEntry
    private var d: WidgetData { entry.data }

    private var hasTimer: Bool {
        guard let timer = d.activeTimer, !timer.isEmpty, let startDate = d.timerStartDate else { return false }
        // Safety: if timer has been running >14 hours, it's orphaned — ignore it
        let elapsed = Date().timeIntervalSince(startDate)
        return elapsed < 14 * 3600
    }

    var body: some View {
        VStack(spacing: 0) {
            // Header
            HStack(spacing: 5) {
                Text("🧸")
                    .font(.system(size: 13))
                Text(d.babyName)
                    .font(.system(size: 14, weight: .bold, design: .rounded))
                    .foregroundColor(brandDeep)
                Spacer()
                if !hasTimer, let pred = d.nextPrediction, !pred.isEmpty {
                    Text(pred)
                        .font(.system(size: 9, weight: .semibold))
                        .foregroundColor(brandPurple)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(brandPurple.opacity(0.1))
                        .clipShape(Capsule())
                }
            }

            Spacer(minLength: 6)

            if hasTimer, let startDate = d.timerStartDate {
                // ── Timer Mode ──
                VStack(spacing: 4) {
                    HStack(spacing: 5) {
                        Circle().fill(brandRose).frame(width: 7, height: 7)
                        Text(d.timerLabel ?? (d.activeTimer ?? "").capitalized)
                            .font(.system(size: 11, weight: .bold))
                            .foregroundColor(brandRose)
                    }
                    Text(startDate, style: .timer)
                        .font(.system(size: 28, weight: .heavy, design: .rounded))
                        .foregroundColor(brandDeep)
                        .monospacedDigit()
                    if let s = d.breastSide {
                        Text(s.capitalized + " side")
                            .font(.system(size: 10, weight: .semibold))
                            .foregroundColor(brandDeep.opacity(0.4))
                    }
                }
            } else {
                // ── Stats Mode ──
                HStack(spacing: 0) {
                    StatRing(icon: "drop.fill", count: d.feedCount, color: brandRose, size: 32)
                    Spacer()
                    StatRing(icon: "moon.zzz.fill", count: d.sleepCount, color: brandPurple, size: 32)
                    Spacer()
                    StatRing(icon: "leaf.fill", count: d.nappyCount, color: brandMint, size: 32)
                }
                .padding(.horizontal, 4)
            }

            Spacer(minLength: 4)

            // Footer — Stop button when timer running, feed time otherwise
            if hasTimer {
                if #available(iOS 17.0, *) {
                    Button(intent: OBWidgetToggleTimerIntent()) {
                        HStack(spacing: 4) {
                            Image(systemName: "stop.fill")
                                .font(.system(size: 9, weight: .bold))
                            Text("Stop")
                                .font(.system(size: 11, weight: .bold))
                        }
                        .foregroundColor(.white)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 6)
                        .background(brandRose)
                        .clipShape(Capsule())
                    }.buttonStyle(.plain)
                }
            } else if !hasTimer {
                if let lf = d.lastFeedTime, !lf.isEmpty {
                    HStack(spacing: 3) {
                        Image(systemName: "drop.fill")
                            .font(.system(size: 7, weight: .semibold))
                            .foregroundColor(brandRose.opacity(0.5))
                        Text("Fed \(lf)")
                            .font(.system(size: 10, weight: .semibold))
                            .foregroundColor(brandDeep.opacity(0.4))
                    }
                }
            }
        }
        .padding(14)
        .containerBackground(for: .widget) {
            ZStack {
                brandBg
                LinearGradient(
                    colors: [Color.white.opacity(0.6), brandWarm.opacity(0.3)],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            }
        }
    }
}

// ══════════════════════════════════════════════════════════════════
// MARK: - Medium Widget (4×2) — Interactive
// ══════════════════════════════════════════════════════════════════

struct OBubbaMediumWidgetView: View {
    let entry: OBubbaEntry
    private var d: WidgetData { entry.data }

    private var hasTimer: Bool {
        guard let timer = d.activeTimer, !timer.isEmpty, let startDate = d.timerStartDate else { return false }
        // Safety: if timer has been running >14 hours, it's orphaned — ignore it
        let elapsed = Date().timeIntervalSince(startDate)
        return elapsed < 14 * 3600
    }

    var body: some View {
        VStack(spacing: 0) {

            // ── ROW 1: Header + Timer/Prediction ──
            HStack(alignment: .center) {
                HStack(spacing: 6) {
                    Text("🧸")
                        .font(.system(size: 15))
                    Text(d.babyName)
                        .font(.system(size: 16, weight: .bold, design: .rounded))
                        .foregroundColor(brandDeep)
                }

                Spacer()

                if hasTimer, let startDate = d.timerStartDate {
                    HStack(spacing: 6) {
                        VStack(alignment: .trailing, spacing: 0) {
                            HStack(spacing: 4) {
                                Circle().fill(brandRose).frame(width: 6, height: 6)
                                Text(d.timerLabel ?? (d.activeTimer ?? "").capitalized)
                                    .font(.system(size: 10, weight: .bold))
                                    .foregroundColor(brandRose)
                            }
                            if let s = d.breastSide {
                                Text(s.capitalized + " side")
                                    .font(.system(size: 9, weight: .medium))
                                    .foregroundColor(brandDeep.opacity(0.4))
                            }
                        }
                        Text(startDate, style: .timer)
                            .font(.system(size: 22, weight: .heavy, design: .rounded))
                            .foregroundColor(brandDeep)
                            .monospacedDigit()
                    }
                    .padding(.horizontal, 10)
                    .padding(.vertical, 5)
                    .background(brandRose.opacity(0.08))
                    .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                } else if let pred = d.nextPrediction, !pred.isEmpty {
                    HStack(spacing: 4) {
                        Image(systemName: "clock")
                            .font(.system(size: 9, weight: .semibold))
                            .foregroundColor(brandPurple)
                        Text(pred)
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundColor(brandDeep.opacity(0.6))
                    }
                    .padding(.horizontal, 10)
                    .padding(.vertical, 5)
                    .background(brandPurple.opacity(0.08))
                    .clipShape(Capsule())
                } else if let lf = d.lastFeedTime, !lf.isEmpty {
                    HStack(spacing: 3) {
                        Image(systemName: "drop.fill")
                            .font(.system(size: 8))
                            .foregroundColor(brandRose.opacity(0.5))
                        Text("Fed \(lf)")
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundColor(brandDeep.opacity(0.45))
                    }
                }
            }

            Spacer(minLength: 5)

            // ── ROW 2: Action Buttons (big, tappable) ──
            if #available(iOS 17.0, *) {
                HStack(spacing: 8) {
                    if d.showNursing == true {
                        let leftIsNext = d.lastBreastSide != "left"
                        Button(intent: OBWidgetBreastLeftIntent()) {
                            BreastBtn(letter: "L", isNext: leftIsNext)
                        }.buttonStyle(.plain)
                        Button(intent: OBWidgetBreastRightIntent()) {
                            BreastBtn(letter: "R", isNext: !leftIsNext)
                        }.buttonStyle(.plain)
                    } else {
                        Button(intent: OBWidgetLogFeedIntent()) {
                            ActionBtn(icon: "drop.fill", label: "Feed", color: brandRose)
                        }.buttonStyle(.plain)
                    }
                    Button(intent: OBWidgetLogNappyIntent()) {
                        ActionBtn(icon: "leaf.fill", label: "Nappy", color: brandMint)
                    }.buttonStyle(.plain)
                    Button(intent: OBWidgetToggleTimerIntent()) {
                        ActionBtn(
                            icon: hasTimer ? "stop.fill" : "play.fill",
                            label: hasTimer ? "Stop" : "Nap",
                            color: hasTimer ? brandRose : brandPurple,
                            filled: hasTimer
                        )
                    }.buttonStyle(.plain)
                }
            }

            Spacer(minLength: 5)

            // ── ROW 3: Stats bar (compact, below buttons) ──
            HStack(spacing: 0) {
                // Feed stat
                HStack(spacing: 4) {
                    Image(systemName: "drop.fill")
                        .font(.system(size: 9, weight: .semibold))
                        .foregroundColor(brandRose)
                    Text("\(d.feedCount)")
                        .font(.system(size: 13, weight: .bold, design: .rounded))
                        .foregroundColor(brandDeep)
                    Text("fed")
                        .font(.system(size: 10, weight: .medium))
                        .foregroundColor(brandDeep.opacity(0.35))
                }
                .frame(maxWidth: .infinity)

                RoundedRectangle(cornerRadius: 1)
                    .fill(brandDeep.opacity(0.08))
                    .frame(width: 1, height: 14)

                // Sleep stat
                HStack(spacing: 4) {
                    Image(systemName: "moon.zzz.fill")
                        .font(.system(size: 9, weight: .semibold))
                        .foregroundColor(brandPurple)
                    Text("\(d.sleepCount)")
                        .font(.system(size: 13, weight: .bold, design: .rounded))
                        .foregroundColor(brandDeep)
                    Text("slept")
                        .font(.system(size: 10, weight: .medium))
                        .foregroundColor(brandDeep.opacity(0.35))
                }
                .frame(maxWidth: .infinity)

                RoundedRectangle(cornerRadius: 1)
                    .fill(brandDeep.opacity(0.08))
                    .frame(width: 1, height: 14)

                // Nappy stat
                HStack(spacing: 4) {
                    Image(systemName: "leaf.fill")
                        .font(.system(size: 9, weight: .semibold))
                        .foregroundColor(brandMint)
                    Text("\(d.nappyCount)")
                        .font(.system(size: 13, weight: .bold, design: .rounded))
                        .foregroundColor(brandDeep)
                    Text("changed")
                        .font(.system(size: 10, weight: .medium))
                        .foregroundColor(brandDeep.opacity(0.35))
                }
                .frame(maxWidth: .infinity)
            }
            .padding(.vertical, 5)
            .padding(.horizontal, 4)
            .background(brandDeep.opacity(0.03))
            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .containerBackground(for: .widget) {
            ZStack {
                brandBg
                LinearGradient(
                    colors: [Color.white.opacity(0.6), brandWarm.opacity(0.3)],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            }
        }
    }
}

// ══════════════════════════════════════════════════════════════════
// MARK: - Lock Screen Widgets
// ══════════════════════════════════════════════════════════════════

@available(iOS 16.0, *)
struct OBubbaLockScreenRectangular: View {
    let entry: OBubbaEntry
    private var d: WidgetData { entry.data }

    var body: some View {
        if let timer = d.activeTimer, !timer.isEmpty, let startDate = d.timerStartDate {
            // Timer active
            HStack(spacing: 8) {
                Image(systemName: timer == "feed" ? "drop.fill" : "moon.zzz.fill")
                    .font(.system(size: 13, weight: .semibold))
                VStack(alignment: .leading, spacing: 1) {
                    Text(d.babyName)
                        .font(.system(size: 12, weight: .bold, design: .rounded))
                    if let s = d.breastSide {
                        Text("\(s.capitalized) side")
                            .font(.system(size: 10))
                            .foregroundColor(.secondary)
                    }
                }
                Spacer()
                Text(startDate, style: .timer)
                    .font(.system(size: 16, weight: .bold, design: .rounded))
                    .monospacedDigit()
            }
        } else {
            // Stats
            HStack(spacing: 10) {
                Text(d.babyName)
                    .font(.system(size: 12, weight: .bold, design: .rounded))

                Spacer()

                HStack(spacing: 3) {
                    Image(systemName: "drop.fill").font(.system(size: 9))
                    Text("\(d.feedCount)").font(.system(size: 13, weight: .bold, design: .rounded))
                }

                HStack(spacing: 3) {
                    Image(systemName: "moon.zzz.fill").font(.system(size: 9))
                    Text("\(d.sleepCount)").font(.system(size: 13, weight: .bold, design: .rounded))
                }

                HStack(spacing: 3) {
                    Image(systemName: "leaf.fill").font(.system(size: 9))
                    Text("\(d.nappyCount)").font(.system(size: 13, weight: .bold, design: .rounded))
                }
            }
        }
    }
}

@available(iOS 16.0, *)
struct OBubbaLockScreenInline: View {
    let entry: OBubbaEntry
    private var d: WidgetData { entry.data }

    var body: some View {
        if let timer = d.activeTimer, !timer.isEmpty, let startDate = d.timerStartDate {
            HStack(spacing: 4) {
                Image(systemName: timer == "feed" ? "drop.fill" : "moon.zzz.fill").font(.caption2)
                Text(startDate, style: .timer)
                    .font(.system(.caption, design: .rounded)).bold()
                    .monospacedDigit()
            }
        } else {
            HStack(spacing: 4) {
                Image(systemName: "drop.fill").font(.caption2)
                Text("\(d.feedCount)").font(.system(.caption, design: .rounded)).bold()
                Text("·").foregroundColor(.secondary)
                Image(systemName: "moon.zzz.fill").font(.caption2)
                Text("\(d.sleepCount)").font(.system(.caption, design: .rounded)).bold()
                Text("·").foregroundColor(.secondary)
                Image(systemName: "leaf.fill").font(.caption2)
                Text("\(d.nappyCount)").font(.system(.caption, design: .rounded)).bold()
            }
        }
    }
}

// ══════════════════════════════════════════════════════════════════
// MARK: - Live Activity
// ══════════════════════════════════════════════════════════════════

struct OBubbaTimerAttributes: ActivityAttributes {
    let timerType: String
    let babyName: String
    struct ContentState: Codable, Hashable {
        let startTime: Date
        let elapsed: Int
        let side: String?
        let nextNap: String?    // e.g. "Nap 2:00pm" or "Bed 7:30pm"
    }
}

struct OBubbaPredictionAttributes: ActivityAttributes {
    let babyName: String
    struct ContentState: Codable, Hashable {
        let targetTime: Date       // The predicted nap/bedtime
        let label: String          // e.g. "Nap 2" or "Bedtime"
        let timeFormatted: String  // e.g. "2:00 pm" or "7:30 pm"
    }
}

@available(iOS 16.1, *)
struct OBubbaTimerLiveActivity: Widget {
    let kind: String = "OBubbaTimer"

    private func timerIcon(_ type: String) -> String {
        type == "feed" ? "drop.fill" : "moon.zzz.fill"
    }
    private func timerLabel(_ type: String) -> String {
        type == "feed" ? "Feed" : "Sleep"
    }

    var body: some WidgetConfiguration {
        ActivityConfiguration(for: OBubbaTimerAttributes.self) { context in
            // ── Lock Screen / Notification Banner (compact) ──
            HStack(spacing: 10) {
                // Left: small icon
                ZStack {
                    Circle()
                        .fill(brandRose.opacity(0.1))
                        .frame(width: 32, height: 32)
                    Image(systemName: timerIcon(context.attributes.timerType))
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundColor(brandRose)
                }

                // Middle: label + optional side
                VStack(alignment: .leading, spacing: 1) {
                    Text("\(context.attributes.babyName)'s \(timerLabel(context.attributes.timerType))")
                        .font(.system(size: 13, weight: .bold, design: .rounded))
                        .foregroundColor(brandDeep)
                        .lineLimit(1)
                    if let side = context.state.side {
                        Text("\(side.capitalized) side")
                            .font(.system(size: 10, weight: .medium))
                            .foregroundColor(brandDeep.opacity(0.4))
                    }
                }

                Spacer()

                // Right: timer + next nap
                VStack(alignment: .trailing, spacing: 1) {
                    Text(context.state.startTime, style: .timer)
                        .font(.system(size: 22, weight: .heavy, design: .rounded))
                        .foregroundColor(brandRose)
                        .monospacedDigit()
                    if let nextNap = context.state.nextNap, !nextNap.isEmpty {
                        Text(nextNap)
                            .font(.system(size: 10, weight: .semibold, design: .rounded))
                            .foregroundColor(brandPurple)
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .background(
                LinearGradient(
                    colors: [brandBg, brandCream],
                    startPoint: .leading,
                    endPoint: .trailing
                )
            )

        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    ZStack {
                        Circle()
                            .fill(brandRose.opacity(0.12))
                            .frame(width: 36, height: 36)
                        Image(systemName: timerIcon(context.attributes.timerType))
                            .foregroundColor(brandRose)
                            .font(.system(size: 16, weight: .semibold))
                    }
                }
                DynamicIslandExpandedRegion(.center) {
                    VStack(spacing: 2) {
                        Text("\(context.attributes.babyName)'s \(timerLabel(context.attributes.timerType))")
                            .font(.system(size: 14, weight: .bold, design: .rounded))
                        if let side = context.state.side {
                            Text("\(side.capitalized) side")
                                .font(.caption2)
                                .foregroundColor(.secondary)
                        }
                    }
                }
                DynamicIslandExpandedRegion(.trailing) {
                    VStack(alignment: .trailing, spacing: 2) {
                        Text(context.state.startTime, style: .timer)
                            .font(.system(size: 20, weight: .bold, design: .rounded))
                            .foregroundColor(brandRose)
                            .monospacedDigit()
                        if let nextNap = context.state.nextNap, !nextNap.isEmpty {
                            Text(nextNap)
                                .font(.system(size: 10, weight: .semibold))
                                .foregroundColor(brandPurple)
                        }
                    }
                }
            } compactLeading: {
                HStack(spacing: 4) {
                    Image(systemName: timerIcon(context.attributes.timerType))
                        .foregroundColor(brandRose)
                        .font(.system(size: 12))
                }
            } compactTrailing: {
                Text(context.state.startTime, style: .timer)
                    .font(.system(.caption, design: .rounded))
                    .foregroundColor(brandRose)
                    .bold()
                    .monospacedDigit()
            } minimal: {
                Image(systemName: timerIcon(context.attributes.timerType))
                    .foregroundColor(brandRose)
                    .font(.system(size: 12))
            }
        }
    }
}

// ══════════════════════════════════════════════════════════════════
// MARK: - Prediction Countdown Live Activity
// ══════════════════════════════════════════════════════════════════

@available(iOS 16.1, *)
struct OBubbaPredictionLiveActivity: Widget {
    let kind: String = "OBubbaPrediction"

    private func predIcon(_ label: String) -> String {
        label.lowercased().contains("bed") ? "moon.stars.fill" : "moon.zzz.fill"
    }

    var body: some WidgetConfiguration {
        ActivityConfiguration(for: OBubbaPredictionAttributes.self) { context in
            // ── Lock Screen / Notification Banner ──
            HStack(spacing: 0) {
                // Left: icon + baby name
                VStack(spacing: 2) {
                    ZStack {
                        Circle()
                            .fill(brandRose.opacity(0.15))
                            .frame(width: 34, height: 34)
                        Image(systemName: predIcon(context.state.label))
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundColor(brandRose)
                    }
                    Text(context.attributes.babyName)
                        .font(.system(size: 9, weight: .bold, design: .rounded))
                        .foregroundColor(brandDeep.opacity(0.5))
                        .lineLimit(1)
                }
                .frame(width: 48)
                .padding(.trailing, 8)

                // Middle: label + target time
                VStack(alignment: .leading, spacing: 1) {
                    Text(context.state.label)
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundColor(brandDeep.opacity(0.45))
                    Text(context.state.timeFormatted)
                        .font(.system(size: 26, weight: .heavy, design: .rounded))
                        .foregroundColor(brandDeep)
                }

                Spacer()

                // Right: countdown — firmly right-aligned
                VStack(alignment: .trailing, spacing: 2) {
                    Text(context.state.label.lowercased().contains("bed") ? "Bedtime in" : "Nap in")
                        .font(.system(size: 10, weight: .medium))
                        .foregroundColor(brandPurple.opacity(0.6))
                    Text(context.state.targetTime, style: .timer)
                        .font(.system(size: 20, weight: .heavy, design: .rounded))
                        .foregroundColor(brandPurple)
                        .monospacedDigit()
                        .frame(minWidth: 70, alignment: .trailing)
                }
                .padding(.leading, 8)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .background(
                LinearGradient(
                    colors: [brandBg, brandCream],
                    startPoint: .leading,
                    endPoint: .trailing
                )
            )

        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    VStack(spacing: 2) {
                        Image(systemName: predIcon(context.state.label))
                            .foregroundColor(brandPurple)
                            .font(.system(size: 16, weight: .semibold))
                        Text(context.attributes.babyName)
                            .font(.system(size: 9, weight: .bold))
                            .foregroundColor(.secondary)
                    }
                }
                DynamicIslandExpandedRegion(.center) {
                    VStack(spacing: 2) {
                        Text(context.state.label)
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundColor(.secondary)
                        Text(context.state.timeFormatted)
                            .font(.system(size: 22, weight: .heavy, design: .rounded))
                    }
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Text(context.state.targetTime, style: .timer)
                        .font(.system(size: 16, weight: .bold, design: .rounded))
                        .foregroundColor(brandPurple)
                        .monospacedDigit()
                }
            } compactLeading: {
                // OBubba icon — rose circle with moon
                ZStack {
                    Circle()
                        .fill(brandRose)
                        .frame(width: 22, height: 22)
                    Image(systemName: predIcon(context.state.label))
                        .foregroundColor(.white)
                        .font(.system(size: 10, weight: .bold))
                }
            } compactTrailing: {
                // Bold predicted time — matches SweetSpot style
                Text(context.state.timeFormatted)
                    .font(.system(size: 14, weight: .heavy, design: .rounded))
                    .foregroundColor(.white)
                    .monospacedDigit()
            } minimal: {
                ZStack {
                    Circle()
                        .fill(brandRose)
                        .frame(width: 22, height: 22)
                    Image(systemName: predIcon(context.state.label))
                        .foregroundColor(.white)
                        .font(.system(size: 10, weight: .bold))
                }
            }
        }
    }
}

// ══════════════════════════════════════════════════════════════════
// MARK: - Widget Configurations
// ══════════════════════════════════════════════════════════════════

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
        .description("Feeds, sleeps, nappies and quick actions at a glance.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

@available(iOS 16.0, *)
struct OBubbaLockScreenAccessoryWidget: Widget {
    let kind: String = "OBubbaLockScreen"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: OBubbaTimelineProvider()) { entry in
            if #available(iOS 16.0, *) {
                OBubbaLockScreenRectangular(entry: entry)
            }
        }
        .configurationDisplayName("Baby Stats")
        .description("Quick baby stats on your Lock Screen.")
        .supportedFamilies([.accessoryRectangular, .accessoryInline])
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
            OBubbaPredictionLiveActivity()
        }
    }
}

// ══════════════════════════════════════════════════════════════════
// MARK: - Color Helper
// ══════════════════════════════════════════════════════════════════

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
