import Foundation
import Observation
import WidgetKit

/// Keeps the live list of alerts: Base44 history (same as the website) merged with the
/// p2000.page live feed. Polls while the app is active and caches the last result for an instant start.
@MainActor
@Observable
final class MeldingStore {
    static let shared = MeldingStore()

    private(set) var meldingen: [Melding] = []
    private(set) var lastUpdated: Date?
    private(set) var isLoading = false
    private(set) var isOnline = true
    private(set) var errorMessage: String?
    private(set) var maand: MaandStatistiek?
    private(set) var vorigeMaand: MaandStatistiek?

    /// Called with alerts that arrived since the previous refresh (used for local notifications on macOS).
    @ObservationIgnored var onNew: (([Melding]) -> Void)?

    @ObservationIgnored private var pollTask: Task<Void, Never>?
    @ObservationIgnored private var knownIDs: Set<String> = []
    @ObservationIgnored private let api = P2000API.shared
    @ObservationIgnored private var limit = 300
    @ObservationIgnored private var history: [Melding] = []
    @ObservationIgnored private var liveItems: [Melding] = []
    @ObservationIgnored private var lastHistoryLoad: Date = .distantPast
    @ObservationIgnored private var didReloadWidgets = false

    private init() {
        loadCache()
    }

    // MARK: - Loading

    /// Full refresh: Base44 history + p2000.page live feed.
    func refresh() async {
        await load(includeHistory: true)
    }

    /// Live-only refresh (p2000.page); cheap enough to run every 15 seconds.
    func refreshLive() async {
        await load(includeHistory: !LiveFeed.isConfigured)
    }

    private func load(includeHistory: Bool) async {
        guard !isLoading else { return }
        isLoading = true
        defer { isLoading = false }

        async let liveResult: [Melding]? = try? LiveFeed.shared.apeldoorn()
        var historyError: Error?
        if includeHistory {
            do {
                history = try await api.meldingen(limit: limit)
                lastHistoryLoad = .now
            } catch {
                historyError = error
            }
        }
        let live = await liveResult
        if let live { liveItems = mergeLive(live) }

        let merged = merge(history: history, live: liveItems)
        let newOnes = knownIDs.isEmpty ? [] : merged.filter { !knownIDs.contains($0.guid) }
        meldingen = merged
        knownIDs.formUnion(merged.map(\.guid))

        isOnline = (LiveFeed.isConfigured && live != nil) || (includeHistory && historyError == nil)
        if historyError == nil || live != nil {
            lastUpdated = .now
            errorMessage = nil
        } else {
            errorMessage = historyError?.localizedDescription
        }
        saveCache()
        if !newOnes.isEmpty { onNew?(newOnes) }
        if !newOnes.isEmpty || !didReloadWidgets {
            didReloadWidgets = true
            WidgetCenter.shared.reloadAllTimelines()
        }
    }

    /// Keeps live items until Base44 has them (the live feed only holds a few minutes).
    private func mergeLive(_ fresh: [Melding]) -> [Melding] {
        var byID = Dictionary(liveItems.map { ($0.guid, $0) }, uniquingKeysWith: { a, _ in a })
        for m in fresh { byID[m.guid] = m }
        let cutoff = Date.now.addingTimeInterval(-6 * 60 * 60)
        return byID.values.filter { $0.datum > cutoff }
    }

    private func merge(history: [Melding], live: [Melding]) -> [Melding] {
        Self.combine(history: history, live: live)
    }

    /// Base44 records win (they have category, weather and views); live fills the gap.
    nonisolated static func combine(history: [Melding], live: [Melding]) -> [Melding] {
        let known = Set(history.map(\.guid))
        let extra = live.filter { !known.contains($0.guid) }
        return (extra + history).sorted { $0.datum > $1.datum }
    }

    func refreshStats() async {
        let now = Date()
        let prev = Calendar.current.date(byAdding: .month, value: -1, to: now) ?? now
        async let current = try? api.maandStatistiek(key: P2000API.monthKey(now))
        async let previous = try? api.maandStatistiek(key: P2000API.monthKey(prev))
        let (c, p) = await (current, previous)
        if let c = c ?? nil { maand = c }
        if let p = p ?? nil { vorigeMaand = p }
    }

    /// Starts polling; call when the scene becomes active.
    /// Live feed every 15 s, Base44 history every 60 s.
    func startPolling() {
        pollTask?.cancel()
        pollTask = Task { [weak self] in
            await self?.refresh()
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(15))
                guard let self, !Task.isCancelled else { return }
                if Date.now.timeIntervalSince(self.lastHistoryLoad) >= 60 {
                    await self.refresh()
                } else {
                    await self.refreshLive()
                }
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

    func filtered(_ settings: AppSettings, search: String = "", onlyBewaard: Bool = false) -> [Melding] {
        let q = search.trimmingCharacters(in: .whitespaces).lowercased()
        return meldingen.filter { m in
            if onlyBewaard { return settings.bewaard.contains(m.guid) }
            guard settings.matchesList(m) else { return false }
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
        let start = Calendar.current.startOfDay(for: .now)
        let today = meldingen.filter { $0.datum >= start }
        var per: [Dienst: Int] = [:]
        for m in today { per[m.dienst, default: 0] += 1 }
        return (today.count, per)
    }

    // MARK: - Cache


    private func loadCache() {
        let list = AppGroup.readCache()
        guard !list.isEmpty else { return }
        meldingen = list
        history = list.filter { !$0.recordID.hasPrefix("live-") }
        liveItems = list.filter { $0.recordID.hasPrefix("live-") }
        knownIDs = Set(list.map(\.guid))
    }

    private func saveCache() {
        let list = meldingen
        Task.detached(priority: .utility) { AppGroup.writeCache(list) }
    }
}
