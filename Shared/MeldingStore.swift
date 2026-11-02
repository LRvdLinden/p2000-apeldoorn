import Foundation
import Observation
#if canImport(WidgetKit) && !os(tvOS)
import WidgetKit
#endif

/// Keeps the live list of alerts from the app's own API. Polls while the app is active and
/// caches the last result in the App Group (also read by the widgets) for an instant start.
@MainActor
@Observable
final class MeldingStore {
    static let shared = MeldingStore()

    private(set) var meldingen: [Melding] = []
    private(set) var lastUpdated: Date?
    private(set) var isLoading = false
    private(set) var isOnline = true
    private(set) var errorMessage: String?

    /// Called with alerts that arrived since the previous refresh (used for local notifications on macOS).
    @ObservationIgnored var onNew: (([Melding]) -> Void)?

    @ObservationIgnored private var pollTask: Task<Void, Never>?
    @ObservationIgnored private var knownIDs: Set<String> = []
    @ObservationIgnored private let api = P2000API.shared
    @ObservationIgnored private var limit = 500
    @ObservationIgnored private var didReloadWidgets = false

    private init() {
        loadCache()
    }

    // MARK: - Loading

    /// Fetches the latest alerts from the app's own API.
    func refresh() async {
        guard !isLoading else { return }
        isLoading = true
        defer { isLoading = false }
        do {
            let fresh = try await api.meldingen(limit: limit)
            let newOnes = knownIDs.isEmpty ? [] : fresh.filter { !knownIDs.contains($0.guid) }
            meldingen = fresh
            knownIDs.formUnion(fresh.map(\.guid))
            lastUpdated = .now
            isOnline = true
            errorMessage = nil
            saveCache()
            if !newOnes.isEmpty { onNew?(newOnes) }
            #if canImport(WidgetKit) && !os(tvOS)
            if !newOnes.isEmpty || !didReloadWidgets {
                didReloadWidgets = true
                WidgetCenter.shared.reloadAllTimelines()
            }
            #endif
        } catch {
            isOnline = false
            errorMessage = error.localizedDescription
        }
    }

    /// Starts polling every 15 seconds; call when the scene becomes active.
    func startPolling() {
        pollTask?.cancel()
        pollTask = Task { [weak self] in
            while !Task.isCancelled {
                await self?.refresh()
                try? await Task.sleep(for: .seconds(15))
            }
        }
    }

    func stopPolling() {
        pollTask?.cancel()
        pollTask = nil
    }

    /// Finds an alert (e.g. from a push notification), fetching it if it is not in the list.
    func melding(guid: String) async -> Melding? {
        if let m = meldingen.first(where: { $0.guid == guid }) { return m }
        return try? await api.melding(guid: guid)
    }

    func registerView(_ m: Melding) {
        Task { await api.incrementViews(guid: m.guid) }
    }

    // MARK: - Derived

    /// Alerts stay on the timeline for 24 hours.
    nonisolated static let timelineWindow: TimeInterval = 24 * 60 * 60

    func filtered(_ settings: AppSettings, search: String = "", onlyBewaard: Bool = false) -> [Melding] {
        let q = search.trimmingCharacters(in: .whitespaces).lowercased()
        let cutoff = Date.now.addingTimeInterval(-Self.timelineWindow)
        return meldingen.filter { m in
            if onlyBewaard { return settings.bewaard.contains(m.guid) }
            // The timeline only shows the last 24 hours.
            guard m.datum >= cutoff else { return false }
            guard settings.matchesList(m) else { return false }
            if settings.hideRead && settings.isRead(m) { return false }
            guard !q.isEmpty else { return true }
            return [m.title, m.stad ?? "", m.locatie ?? "", m.categorie ?? "", m.capcode ?? "", m.fullMelding ?? ""]
                .contains { $0.lowercased().contains(q) }
        }
    }

    /// Groups by calendar day, newest day first.
    static func groupedByDay(_ list: [Melding]) -> [(day: Date, items: [Melding])] {
        let cal = Calendar.current
        let groups = Dictionary(grouping: list) { cal.startOfDay(for: $0.datum) }
        return groups.keys.sorted(by: >).map { ($0, groups[$0]!.sorted { $0.datum > $1.datum }) }
    }

    /// Today's counts per discipline (same tiles as "P2000 Statistieken" on the website).
    var vandaag: (totaal: Int, perDienst: [Dienst: Int]) {
        let s = statsVandaag
        return (s.totaal, s.perDienst)
    }

    /// Statistics are kept for today and yesterday only, computed from the alerts.
    var statsVandaag: DayStats { DayStats(day: .now, meldingen: meldingen) }
    var statsGisteren: DayStats {
        DayStats(day: Calendar.current.date(byAdding: .day, value: -1, to: .now) ?? .now, meldingen: meldingen)
    }

    // MARK: - Cache


    private func loadCache() {
        let list = AppGroup.readCache()
        guard !list.isEmpty else { return }
        meldingen = list
        knownIDs = Set(list.map(\.guid))
    }

    private func saveCache() {
        let list = meldingen
        Task.detached(priority: .utility) { AppGroup.writeCache(list) }
    }
}
