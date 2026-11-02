import Foundation
import Observation

/// All user settings. Stored in UserDefaults and synced between the user's devices
/// through iCloud (NSUbiquitousKeyValueStore). Device-only settings are marked as such.
@MainActor
@Observable
final class AppSettings {
    static let shared = AppSettings()

    // MARK: List filters ("Filteren" on the website)
    var diensten: Set<String> = [] { didSet { save(.diensten, Array(diensten).sorted()) } }
    var plaatsen: Set<String> = [] { didSet { save(.plaatsen, Array(plaatsen).sorted()) } }
    var prioriteiten: Set<String> = [] { didSet { save(.prioriteiten, Array(prioriteiten).sorted()) } }
    var groupByDay: Bool = true { didSet { save(.groupByDay, groupByDay) } }
    var bewaard: Set<String> = [] { didSet { save(.bewaard, Array(bewaard).sorted()) } }

    // MARK: Appearance
    /// "systeem", "licht" or "donker".
    var appearance: String = "systeem" { didSet { save(.appearance, appearance) } }
    /// "standard", "satellite" or "hybrid".
    var mapType: String = "standard" { didSet { save(.mapType, mapType) } }

    // MARK: Notifications
    var notificationsEnabled: Bool = false { didSet { save(.notificationsEnabled, notificationsEnabled); notificationsChanged() } }
    var notifDiensten: Set<String> = [] { didSet { save(.notifDiensten, Array(notifDiensten).sorted()); notificationsChanged() } }
    var notifPlaatsen: Set<String> = [] { didSet { save(.notifPlaatsen, Array(notifPlaatsen).sorted()); notificationsChanged() } }
    var notifPrioriteiten: Set<String> = [] { didSet { save(.notifPrioriteiten, Array(notifPrioriteiten).sorted()); notificationsChanged() } }
    var quietMode: Bool = false { didSet { save(.quietMode, quietMode); notificationsChanged() } }
    /// Minutes after midnight.
    var quietFrom: Int = 23 * 60 { didSet { save(.quietFrom, quietFrom); notificationsChanged() } }
    var quietTo: Int = 7 * 60 { didSet { save(.quietTo, quietTo); notificationsChanged() } }
    /// "Kritieke meldingen": A0/A1/P1 still come through in quiet mode.
    var criticalAlerts: Bool = true { didSet { save(.criticalAlerts, criticalAlerts); notificationsChanged() } }

    // MARK: Device-only
    var useLocation: Bool = false { didSet { defaults.set(useLocation, forKey: Key.useLocation.rawValue) } }
    var appLock: Bool = false { didSet { defaults.set(appLock, forKey: Key.appLock.rawValue) } }
    var onboardingDone: Bool = false { didSet { defaults.set(onboardingDone, forKey: Key.onboardingDone.rawValue) } }

    /// Called when anything that affects push targeting changes (PushManager re-sends tags).
    @ObservationIgnored var onNotificationSettingsChanged: (() -> Void)?

    enum Key: String, CaseIterable {
        case diensten, plaatsen, prioriteiten, groupByDay, bewaard, appearance, mapType
        case notificationsEnabled, notifDiensten, notifPlaatsen, notifPrioriteiten, quietMode, quietFrom, quietTo, criticalAlerts
        case useLocation, appLock, onboardingDone

        var synced: Bool {
            switch self {
            case .useLocation, .appLock, .onboardingDone: return false
            default: return true
            }
        }
        var storageKey: String { "settings.\(rawValue)" }
    }

    /// App Group defaults so the widgets see the same filters.
    @ObservationIgnored private let defaults = AppGroup.defaults
    @ObservationIgnored private let cloud = NSUbiquitousKeyValueStore.default
    @ObservationIgnored private var isLoading = false

    private init() {
        Self.migrateFromStandardDefaults()
        load(from: { self.defaults.object(forKey: $0) })
        useLocation = defaults.bool(forKey: Key.useLocation.rawValue)
        appLock = defaults.bool(forKey: Key.appLock.rawValue)
        onboardingDone = defaults.bool(forKey: Key.onboardingDone.rawValue)

        NotificationCenter.default.addObserver(forName: NSUbiquitousKeyValueStore.didChangeExternallyNotification,
                                               object: cloud, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated { self?.pullFromCloud() }
        }
        cloud.synchronize()
        pullFromCloud()
    }

    /// Build 1 stored settings in UserDefaults.standard; move them into the App Group once.
    private static func migrateFromStandardDefaults() {
        let group = AppGroup.defaults
        guard group !== UserDefaults.standard, !group.bool(forKey: "settings.migrated") else { return }
        for key in Key.allCases {
            for name in [key.storageKey, key.rawValue] {
                if let value = UserDefaults.standard.object(forKey: name), group.object(forKey: name) == nil {
                    group.set(value, forKey: name)
                }
            }
        }
        group.set(true, forKey: "settings.migrated")
    }

    /// Takes the iCloud values (another device changed something).
    func pullFromCloud() {
        let hasCloudValues = Key.allCases.contains { $0.synced && cloud.object(forKey: $0.storageKey) != nil }
        guard hasCloudValues else {
            pushAllToCloud()
            return
        }
        load(from: { self.cloud.object(forKey: $0) })
        onNotificationSettingsChanged?()
    }

    private func pushAllToCloud() {
        for key in Key.allCases where key.synced {
            if let value = defaults.object(forKey: key.storageKey) { cloud.set(value, forKey: key.storageKey) }
        }
        cloud.synchronize()
    }

    private func load(from source: (String) -> Any?) {
        isLoading = true
        defer { isLoading = false }
        func set(_ key: Key) -> Set<String>? { (source(key.storageKey) as? [String]).map(Set.init) }
        if let v = set(.diensten) { diensten = v }
        if let v = set(.plaatsen) { plaatsen = v }
        if let v = set(.prioriteiten) { prioriteiten = v }
        if let v = source(Key.groupByDay.storageKey) as? Bool { groupByDay = v }
        if let v = set(.bewaard) { bewaard = v }
        if let v = source(Key.appearance.storageKey) as? String { appearance = v }
        if let v = source(Key.mapType.storageKey) as? String { mapType = v }
        if let v = source(Key.notificationsEnabled.storageKey) as? Bool { notificationsEnabled = v }
        if let v = set(.notifDiensten) { notifDiensten = v }
        if let v = set(.notifPlaatsen) { notifPlaatsen = v }
        if let v = set(.notifPrioriteiten) { notifPrioriteiten = v }
        if let v = source(Key.quietMode.storageKey) as? Bool { quietMode = v }
        if let v = source(Key.quietFrom.storageKey) as? Int { quietFrom = v }
        if let v = source(Key.quietTo.storageKey) as? Int { quietTo = v }
        if let v = source(Key.criticalAlerts.storageKey) as? Bool { criticalAlerts = v }
    }

    private func save(_ key: Key, _ value: Any) {
        defaults.set(value, forKey: key.storageKey)
        guard !isLoading, key.synced else { return }
        cloud.set(value, forKey: key.storageKey)
        cloud.synchronize()
    }

    private func notificationsChanged() {
        guard !isLoading else { return }
        onNotificationSettingsChanged?()
    }

    /// Wipes everything synced (used by "Account verwijderen").
    func resetAll() {
        for key in Key.allCases {
            defaults.removeObject(forKey: key.storageKey)
            cloud.removeObject(forKey: key.storageKey)
        }
        cloud.synchronize()
        isLoading = true
        diensten = []; plaatsen = []; prioriteiten = []; groupByDay = true; bewaard = []
        appearance = "systeem"; mapType = "standard"
        notificationsEnabled = false; notifDiensten = []; notifPlaatsen = []; notifPrioriteiten = []
        quietMode = false; quietFrom = 23 * 60; quietTo = 7 * 60; criticalAlerts = true
        isLoading = false
        onNotificationSettingsChanged?()
    }

    // MARK: - Filtering

    var listFilterActive: Bool { !diensten.isEmpty || !plaatsen.isEmpty || !prioriteiten.isEmpty }

    func matchesList(_ m: Melding) -> Bool {
        if !diensten.isEmpty, !diensten.contains(m.dienst.rawValue) { return false }
        if !plaatsen.isEmpty, !plaatsen.contains(where: { $0.plaatsKey == (m.stad ?? "").plaatsKey }) { return false }
        if !prioriteiten.isEmpty, !prioriteiten.contains((m.prioriteit ?? "").uppercased()) { return false }
        return true
    }

    /// Whether this alert should produce a notification right now.
    func matchesNotification(_ m: Melding, at date: Date = .now) -> Bool {
        guard notificationsEnabled else { return false }
        if !notifDiensten.isEmpty, !notifDiensten.contains(m.dienst.rawValue) { return false }
        if !notifPlaatsen.isEmpty, !notifPlaatsen.contains(where: { $0.plaatsKey == (m.stad ?? "").plaatsKey }) { return false }
        if !notifPrioriteiten.isEmpty, !notifPrioriteiten.contains((m.prioriteit ?? "").uppercased()) { return false }
        if isQuiet(at: date) && !(criticalAlerts && m.isUrgent) { return false }
        return true
    }

    func isQuiet(at date: Date) -> Bool {
        guard quietMode else { return false }
        let c = Calendar.current.dateComponents([.hour, .minute], from: date)
        let now = (c.hour ?? 0) * 60 + (c.minute ?? 0)
        if quietFrom == quietTo { return true }
        return quietFrom < quietTo ? (now >= quietFrom && now < quietTo) : (now >= quietFrom || now < quietTo)
    }

    func toggleBewaard(_ m: Melding) {
        if bewaard.contains(m.guid) { bewaard.remove(m.guid) } else { bewaard.insert(m.guid) }
    }

    /// Summary like the website: "Alles", "Brandweer" or "2 geselecteerd".
    static func summary(_ set: Set<String>, label: (String) -> String) -> String {
        switch set.count {
        case 0: return L("Alles")
        case 1: return label(set.first!)
        default: return Lf("%lld geselecteerd", set.count)
        }
    }
}
