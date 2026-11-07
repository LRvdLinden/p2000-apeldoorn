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
    /// Opened alerts (newest last, max 600) – shown greyed out in the list; synced via iCloud.
    var gelezen: [String] = [] { didSet { save(.gelezen, gelezen) } }
    /// "Verberg bekeken meldingen" (same option as the website).
    var hideRead: Bool = false { didSet { save(.hideRead, hideRead) } }

    // MARK: Warnings (A-Alerts)
    /// List filter for NL-Alert, Burgernet and KNMI ("nlalert", "burgernet", "knmi:yellow" …). Empty = all.
    var waarschuwingFilter: Set<String> = [] { didSet { save(.waarschuwingFilter, Array(waarschuwingFilter).sorted()) } }
    /// Push for new NL-Alerts in the working area.
    var pushNLAlert: Bool = true { didSet { save(.pushNLAlert, pushNLAlert); notificationsChanged() } }
    /// Push for Burgernet calls (optional, off by default).
    var pushBurgernet: Bool = false { didSet { save(.pushBurgernet, pushBurgernet); notificationsChanged() } }
    /// KNMI codes that give a push: "yellow", "orange", "red".
    var pushKnmi: Set<String> = ["orange", "red"] { didSet { save(.pushKnmi, Array(pushKnmi).sorted()); notificationsChanged() } }

    // MARK: Notification profiles (A-Alerts)
    /// Up to five profiles; the first one is mirrored into the older single notification settings.
    var profielen: [MeldingProfiel] = [] { didSet { saveProfielen() } }

    // MARK: Appearance
    /// "systeem", "licht" or "donker".
    var appearance: String = "systeem" { didSet { save(.appearance, appearance) } }
    /// "standard", "satellite" or "hybrid".
    var mapType: String = "standard" { didSet { save(.mapType, mapType) } }
    /// Map layers that are switched on (see KaartLaag).
    var kaartLagen: Set<String> = KaartLaag.standaard { didSet { save(.kaartLagen, Array(kaartLagen).sorted()) } }

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

    // MARK: Radius ("Mijn buurt")
    /// Only show and notify alerts within `radiusKm` of the centre.
    var radiusEnabled: Bool = false { didSet { save(.radiusEnabled, radiusEnabled); notificationsChanged() } }
    var radiusKm: Double = 5 { didSet { save(.radiusKm, radiusKm); notificationsChanged() } }
    /// "huidig" = current location of this device, "vast" = a fixed point chosen on the map.
    var radiusMode: String = "huidig" { didSet { save(.radiusMode, radiusMode); notificationsChanged() } }
    var fixedLat: Double = 0 { didSet { save(.fixedLat, fixedLat); notificationsChanged() } }
    var fixedLon: Double = 0 { didSet { save(.fixedLon, fixedLon); notificationsChanged() } }
    var fixedName: String = "" { didSet { save(.fixedName, fixedName) } }
    /// Last known location of this device (rounded to ~100 m); device-only.
    var currentLat: Double = 0 { didSet { defaults.set(currentLat, forKey: Key.currentLat.rawValue) } }
    var currentLon: Double = 0 { didSet { defaults.set(currentLon, forKey: Key.currentLon.rawValue) } }

    // MARK: Device-only
    var useLocation: Bool = false { didSet { defaults.set(useLocation, forKey: Key.useLocation.rawValue) } }
    var appLock: Bool = false { didSet { defaults.set(appLock, forKey: Key.appLock.rawValue) } }
    var onboardingDone: Bool = false { didSet { defaults.set(onboardingDone, forKey: Key.onboardingDone.rawValue) } }

    /// Called when anything that affects push targeting changes (PushManager re-sends tags).
    @ObservationIgnored var onNotificationSettingsChanged: (() -> Void)?

    enum Key: String, CaseIterable {
        case diensten, plaatsen, prioriteiten, groupByDay, bewaard, gelezen, hideRead, appearance, mapType
        case notificationsEnabled, notifDiensten, notifPlaatsen, notifPrioriteiten, quietMode, quietFrom, quietTo, criticalAlerts
        case radiusEnabled, radiusKm, radiusMode, fixedLat, fixedLon, fixedName
        case useLocation, appLock, onboardingDone, currentLat, currentLon
        case waarschuwingFilter, pushNLAlert, pushBurgernet, pushKnmi, profielen, kaartLagen

        var synced: Bool {
            switch self {
            case .useLocation, .appLock, .onboardingDone, .currentLat, .currentLon: return false
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
        currentLat = defaults.double(forKey: Key.currentLat.rawValue)
        currentLon = defaults.double(forKey: Key.currentLon.rawValue)

        NotificationCenter.default.addObserver(forName: NSUbiquitousKeyValueStore.didChangeExternallyNotification,
                                               object: cloud, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated { self?.pullFromCloud() }
        }
        cloud.synchronize()
        pullFromCloud()
        migrateToProfielen()
    }

    /// A-Alerts: the existing notification choices become the first profile ("Standaard"), so nothing is lost.
    private func migrateToProfielen() {
        guard profielen.isEmpty else { return }
        profielen = [legacyProfiel()]
    }

    private func legacyProfiel() -> MeldingProfiel {
        var p = MeldingProfiel(naam: L("Standaard"))
        p.diensten = notifDiensten
        p.plaatsen = notifPlaatsen
        p.prioriteiten = notifPrioriteiten
        p.nlalert = pushNLAlert
        p.burgernet = pushBurgernet
        p.knmi = pushKnmi
        return p
    }

    private func saveProfielen() {
        if let data = try? JSONEncoder().encode(profielen), let json = String(data: data, encoding: .utf8) {
            save(.profielen, json)
        }
        guard !isLoading else { return }
        // Keep the older settings equal to the first profile (older app versions and servers read those).
        if let p = profielen.first {
            if notifDiensten != p.diensten { notifDiensten = p.diensten }
            if notifPlaatsen != p.plaatsen { notifPlaatsen = p.plaatsen }
            if notifPrioriteiten != p.prioriteiten { notifPrioriteiten = p.prioriteiten }
            if pushNLAlert != profielen.contains(where: { $0.actief && $0.nlalert }) { pushNLAlert.toggle() }
            if pushBurgernet != profielen.contains(where: { $0.actief && $0.burgernet }) { pushBurgernet.toggle() }
            let knmi = Set(profielen.filter(\.actief).flatMap(\.knmi))
            if pushKnmi != knmi { pushKnmi = knmi }
        }
        notificationsChanged()
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
        if let v = source(Key.gelezen.storageKey) as? [String] { gelezen = v }
        if let v = source(Key.hideRead.storageKey) as? Bool { hideRead = v }
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
        if let v = source(Key.radiusEnabled.storageKey) as? Bool { radiusEnabled = v }
        if let v = source(Key.radiusKm.storageKey) as? Double { radiusKm = v }
        if let v = source(Key.radiusMode.storageKey) as? String { radiusMode = v }
        if let v = source(Key.fixedLat.storageKey) as? Double { fixedLat = v }
        if let v = source(Key.fixedLon.storageKey) as? Double { fixedLon = v }
        if let v = source(Key.fixedName.storageKey) as? String { fixedName = v }
        if let v = set(.waarschuwingFilter) { waarschuwingFilter = v }
        if let v = source(Key.pushNLAlert.storageKey) as? Bool { pushNLAlert = v }
        if let v = source(Key.pushBurgernet.storageKey) as? Bool { pushBurgernet = v }
        if let v = set(.pushKnmi) { pushKnmi = v }
        if let v = set(.kaartLagen) {
            // New layer "ziekenhuizen" (build 37): on once for everyone who already chose layers.
            kaartLagen = v.contains("ziekenhuizen") || UserDefaults.standard.bool(forKey: "laag.ziekenhuizen.v1") ? v : v.union(["ziekenhuizen"])
            UserDefaults.standard.set(true, forKey: "laag.ziekenhuizen.v1")
        }
        if let s = source(Key.profielen.storageKey) as? String, let data = s.data(using: .utf8),
           let list = try? JSONDecoder().decode([MeldingProfiel].self, from: data), !list.isEmpty {
            profielen = Array(list.prefix(MeldingProfiel.maximum))
        }
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
        diensten = []; plaatsen = []; prioriteiten = []; groupByDay = true; bewaard = []; gelezen = []; hideRead = false
        appearance = "systeem"; mapType = "standard"
        notificationsEnabled = false; notifDiensten = []; notifPlaatsen = []; notifPrioriteiten = []
        quietMode = false; quietFrom = 23 * 60; quietTo = 7 * 60; criticalAlerts = true
        radiusEnabled = false; radiusKm = 5; radiusMode = "huidig"; fixedLat = 0; fixedLon = 0; fixedName = ""
        waarschuwingFilter = []; pushNLAlert = true; pushBurgernet = false; pushKnmi = ["orange", "red"]
        profielen = [MeldingProfiel(naam: L("Standaard"))]
        kaartLagen = KaartLaag.standaard
        isLoading = false
        onNotificationSettingsChanged?()
    }

    // MARK: - Filtering

    var listFilterActive: Bool {
        !diensten.isEmpty || !plaatsen.isEmpty || !prioriteiten.isEmpty || radiusActive || !waarschuwingFilter.isEmpty
    }

    /// Centre of the radius (current location or fixed point), if known.
    var radiusCenter: (lat: Double, lon: Double)? {
        if radiusMode == "vast" {
            return fixedLat != 0 ? (fixedLat, fixedLon) : nil
        }
        return currentLat != 0 ? (currentLat, currentLon) : nil
    }

    var radiusActive: Bool { radiusEnabled && radiusCenter != nil }

    func withinRadius(_ m: Melding) -> Bool {
        guard radiusEnabled, let c = radiusCenter else { return true }
        guard let lat = m.lat, let lon = m.lon, m.hasCoordinate else { return false }
        return Self.distanceKm(c.lat, c.lon, lat, lon) <= radiusKm
    }

    static func distanceKm(_ lat1: Double, _ lon1: Double, _ lat2: Double, _ lon2: Double) -> Double {
        let r = Double.pi / 180
        let dLat = (lat2 - lat1) * r, dLon = (lon2 - lon1) * r
        let a = sin(dLat / 2) * sin(dLat / 2) + cos(lat1 * r) * cos(lat2 * r) * sin(dLon / 2) * sin(dLon / 2)
        return 6371 * 2 * atan2(sqrt(a), sqrt(1 - a))
    }

    func matchesList(_ m: Melding) -> Bool {
        if !withinRadius(m) { return false }
        if !diensten.isEmpty, !diensten.contains(m.dienst.rawValue) { return false }
        if !Werkgebied.shared.matches(m, selected: plaatsen) { return false }
        if !prioriteiten.isEmpty, !prioriteiten.contains((m.prioriteit ?? "").uppercased()) { return false }
        return true
    }

    /// NL-Alert, Burgernet and KNMI follow the warning filter, the places and the radius.
    func matchesList(_ w: Waarschuwing) -> Bool {
        if !waarschuwingFilter.isEmpty, !waarschuwingFilter.contains(w.filterKey), !waarschuwingFilter.contains(w.bron.rawValue) { return false }
        if !plaatsen.isEmpty, !plaatsen.contains(where: { w.covers(plaats: $0) }) { return false }
        if radiusEnabled, let c = radiusCenter {
            if w.bron == .burgernet || w.gebied == nil {
                guard let lat = w.lat, let lon = w.lon, Self.distanceKm(c.lat, c.lon, lat, lon) <= radiusKm + 2 else { return false }
            } else if !w.contains(lat: c.lat, lon: c.lon),
                      !(w.gebied ?? []).contains(where: { Werkgebied.distanceToRingKm($0, c.lat, c.lon) <= radiusKm }) {
                return false
            }
        }
        return true
    }

    /// Whether this alert should produce a notification right now.
    func matchesNotification(_ m: Melding, at date: Date = .now) -> Bool {
        guard notificationsEnabled, withinRadius(m) else { return false }
        if profielen.isEmpty {
            if !notifDiensten.isEmpty, !notifDiensten.contains(m.dienst.rawValue) { return false }
            if !Werkgebied.shared.matches(m, selected: notifPlaatsen) { return false }
            if !notifPrioriteiten.isEmpty, !notifPrioriteiten.contains((m.prioriteit ?? "").uppercased()) { return false }
        } else if !profielen.contains(where: { $0.geldt(op: date) && $0.matches(m) }) {
            return false
        }
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

    func isRead(_ m: Melding) -> Bool { readSet.contains(m.guid) }

    @ObservationIgnored private var readCache: (count: Int, last: String?, set: Set<String>) = (0, nil, [])
    private var readSet: Set<String> {
        if readCache.count != gelezen.count || readCache.last != gelezen.last {
            readCache = (gelezen.count, gelezen.last, Set(gelezen))
        }
        return readCache.set
    }

    func markRead(_ m: Melding) {
        guard !isRead(m) else { return }
        var list = gelezen
        list.append(m.guid)
        if list.count > 600 { list.removeFirst(list.count - 600) }
        gelezen = list
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
