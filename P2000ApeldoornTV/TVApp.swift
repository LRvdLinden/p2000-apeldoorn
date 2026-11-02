import SwiftUI
import UIKit

/// P2000 Apeldoorn for Apple TV: a big-screen "meldkamer" display with the live map,
/// the latest alerts, a full-screen alarm for new alerts and today vs yesterday.
@main
struct P2000ApeldoornTVApp: App {
    @State private var store = MeldingStore.shared
    @State private var settings = AppSettings.shared
    @State private var tv = TVSettings.shared

    var body: some Scene {
        WindowGroup {
            TVRootView()
                .environment(store)
                .environment(settings)
                .environment(tv)
                .preferredColorScheme(.dark)
        }
    }
}

/// Settings that only apply to the Apple TV.
@MainActor
@Observable
final class TVSettings {
    static let shared = TVSettings()
    private let d = UserDefaults.standard

    /// Full-screen alarm when a new alert comes in.
    var alarmScreen: Bool { didSet { d.set(alarmScreen, forKey: "tv.alarm") } }
    /// Only for urgent alerts (A0/A1/P1).
    var alarmOnlyUrgent: Bool { didSet { d.set(alarmOnlyUrgent, forKey: "tv.alarmUrgent") } }
    /// Seconds the alarm stays on screen.
    var alarmSeconds: Int { didSet { d.set(alarmSeconds, forKey: "tv.alarmSeconds") } }
    /// The map flies past the latest alerts by itself.
    var autoTour: Bool { didSet { d.set(autoTour, forKey: "tv.tour") } }
    /// Keep the screen on (no screensaver).
    var keepAwake: Bool { didSet { d.set(keepAwake, forKey: "tv.awake"); UIApplication.shared.isIdleTimerDisabled = keepAwake } }

    private init() {
        alarmScreen = d.object(forKey: "tv.alarm") as? Bool ?? true
        alarmOnlyUrgent = d.object(forKey: "tv.alarmUrgent") as? Bool ?? false
        alarmSeconds = d.object(forKey: "tv.alarmSeconds") as? Int ?? 15
        autoTour = d.object(forKey: "tv.tour") as? Bool ?? true
        keepAwake = d.object(forKey: "tv.awake") as? Bool ?? true
    }
}

struct TVRootView: View {
    @Environment(MeldingStore.self) private var store
    @Environment(AppSettings.self) private var settings
    @Environment(TVSettings.self) private var tv
    @Environment(\.scenePhase) private var scenePhase
    @State private var showSplash = true
    @State private var alarm: Melding?
    @State private var alarmQueue: [Melding] = []
    @State private var tab = 0

    var body: some View {
        ZStack {
            TabView(selection: $tab) {
                MeldkamerView().tabItem { Label(L("Meldkamer"), systemImage: "light.beacon.max") }.tag(0)
                TVStatsView().tabItem { Label(L("Statistieken"), systemImage: "chart.bar.xaxis") }.tag(1)
                TVSettingsView().tabItem { Label(L("Instellingen"), systemImage: "gearshape") }.tag(2)
            }
            if let alarm {
                AlarmOverlay(melding: alarm, seconds: tv.alarmSeconds) { nextAlarm() }
                    .transition(.opacity.combined(with: .scale(scale: 1.04)))
                    .zIndex(5)
            }
            if showSplash {
                SplashView { withAnimation(.easeOut(duration: 0.5)) { showSplash = false } }
                    .transition(.opacity)
                    .zIndex(10)
            }
        }
        .animation(.easeInOut(duration: 0.35), value: alarm?.guid)
        .task {
            UIApplication.shared.isIdleTimerDisabled = tv.keepAwake
            store.onNew = { list in
                InAppAlarm.shared.handle(list)
                let wanted = list.filter { settings.matchesList($0) && (!tv.alarmOnlyUrgent || $0.isUrgent) }
                    .sorted { $0.datum < $1.datum }
                guard tv.alarmScreen, !wanted.isEmpty else { return }
                alarmQueue.append(contentsOf: wanted)
                if alarm == nil { nextAlarm() }
            }
            store.startPolling()
            InstallPing.send()
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active {
                store.startPolling()
                InstallPing.send()
            } else if phase == .background {
                store.stopPolling()
            }
        }
    }

    private func nextAlarm() {
        if alarmQueue.isEmpty { alarm = nil; return }
        alarm = alarmQueue.removeFirst()
    }
}

/// Large live clock used on the TV screens.
struct TVClock: View {
    var size: CGFloat = 64
    var body: some View {
        TimelineView(.periodic(from: .now, by: 1)) { ctx in
            VStack(alignment: .trailing, spacing: 0) {
                Text(ctx.date, format: .dateTime.hour(.twoDigits(amPM: .omitted)).minute(.twoDigits).second(.twoDigits))
                    .font(.system(size: size, weight: .black, design: .rounded).monospacedDigit())
                    .lineLimit(1)
                    .fixedSize()
                Text(ctx.date, format: .dateTime.weekday(.wide).day().month(.wide))
                    .font(.system(size: max(size * 0.38, 15), weight: .semibold))
                    .lineLimit(1)
                    .fixedSize()
                    .foregroundStyle(.secondary)
            }
        }
    }
}

extension Melding {
    /// "3 min geleden", "1 uur geleden" …
    var agoText: String { datum.formatted(.relative(presentation: .named, unitsStyle: .wide)) }
}
