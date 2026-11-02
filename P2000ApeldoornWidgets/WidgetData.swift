import WidgetKit
import SwiftUI
import AppIntents

// MARK: - Configuration

enum DisciplineOption: String, AppEnum {
    case alle, brandweer, ambulance, politie, traumaheli

    static var typeDisplayRepresentation = TypeDisplayRepresentation(name: "Discipline")
    static var caseDisplayRepresentations: [DisciplineOption: DisplayRepresentation] = [
        .alle: DisplayRepresentation(title: "Alle disciplines"),
        .brandweer: DisplayRepresentation(title: "Brandweer"),
        .ambulance: DisplayRepresentation(title: "Ambulance"),
        .politie: DisplayRepresentation(title: "Politie"),
        .traumaheli: DisplayRepresentation(title: "Traumaheli"),
    ]

    var dienst: Dienst? { self == .alle ? nil : Dienst(rawValue: rawValue) }
}

struct MeldingWidgetIntent: WidgetConfigurationIntent {
    static var title: LocalizedStringResource = "P2000-meldingen"
    static var description = IntentDescription("Toont de laatste P2000-meldingen in gem. Apeldoorn.")

    @Parameter(title: "Discipline", default: .alle)
    var discipline: DisciplineOption

    @Parameter(title: "Filters uit de app gebruiken", default: true)
    var useAppFilters: Bool

    init() {}

    init(discipline: DisciplineOption, useAppFilters: Bool = true) {
        self.discipline = discipline
        self.useAppFilters = useAppFilters
    }
}

/// "Vernieuw" button in the large widget.
struct RefreshWidgetIntent: AppIntent {
    static var title: LocalizedStringResource = "Vernieuwen"
    static var isDiscoverable = false

    func perform() async throws -> some IntentResult {
        WidgetCenter.shared.reloadAllTimelines()
        return .result()
    }
}

// MARK: - Entry

struct MeldingEntry: TimelineEntry {
    let date: Date
    let meldingen: [Melding]
    let today: Int
    let perDienst: [Dienst: Int]
    var discipline: DisciplineOption = .alle
    var isPlaceholder = false

    var latest: Melding? { meldingen.first }

    static var sample: MeldingEntry {
        MeldingEntry(date: .now, meldingen: Melding.samples, today: 18,
                     perDienst: [.brandweer: 2, .ambulance: 15, .politie: 1, .traumaheli: 0], isPlaceholder: true)
    }
}

// MARK: - Loading

enum WidgetData {
    /// Base44 history + p2000.page live feed, with the app's cache as fallback.
    static func load(fresh: Bool) async -> [Melding] {
        var list = AppGroup.readCache()
        guard fresh else { return list }
        async let liveResult: [Melding]? = try? LiveFeed.shared.apeldoorn()
        let history = try? await P2000API.shared.meldingen(limit: 150)
        let live = await liveResult ?? []
        if let history {
            list = MeldingStore.combine(history: history, live: live)
        } else if !live.isEmpty {
            list = MeldingStore.combine(history: list, live: live)
        }
        if !list.isEmpty { AppGroup.writeCache(list) }
        return list
    }

    static func entry(fresh: Bool, discipline: DisciplineOption = .alle, useAppFilters: Bool = true) async -> MeldingEntry {
        let all = await load(fresh: fresh)
        guard !all.isEmpty else { return .sample }

        let start = Calendar.current.startOfDay(for: .now)
        var per: [Dienst: Int] = [:]
        let todayList = all.filter { $0.datum >= start }
        for m in todayList { per[m.dienst, default: 0] += 1 }

        var shown = all
        if let d = discipline.dienst { shown = shown.filter { $0.dienst == d } }
        if useAppFilters {
            let candidates = shown
            shown = await MainActor.run {
                let settings = AppSettings.shared
                return candidates.filter { settings.matchesList($0) }
            }
        }
        return MeldingEntry(date: .now, meldingen: Array(shown.prefix(10)), today: todayList.count,
                            perDienst: per, discipline: discipline)
    }

    /// WidgetKit allows roughly 40–70 refreshes a day; the app also reloads widgets when new alerts arrive.
    static var nextRefresh: Date { Date.now.addingTimeInterval(15 * 60) }
}

struct MeldingProvider: AppIntentTimelineProvider {
    func placeholder(in context: Context) -> MeldingEntry { .sample }

    func snapshot(for configuration: MeldingWidgetIntent, in context: Context) async -> MeldingEntry {
        if context.isPreview { return .sample }
        return await WidgetData.entry(fresh: false, discipline: configuration.discipline, useAppFilters: configuration.useAppFilters)
    }

    func timeline(for configuration: MeldingWidgetIntent, in context: Context) async -> Timeline<MeldingEntry> {
        let entry = await WidgetData.entry(fresh: true, discipline: configuration.discipline, useAppFilters: configuration.useAppFilters)
        return Timeline(entries: [entry], policy: .after(WidgetData.nextRefresh))
    }

    #if os(watchOS)
    func recommendations() -> [AppIntentRecommendation<MeldingWidgetIntent>] {
        [AppIntentRecommendation(intent: MeldingWidgetIntent(discipline: .alle), description: "Alle meldingen"),
         AppIntentRecommendation(intent: MeldingWidgetIntent(discipline: .brandweer), description: "Brandweer"),
         AppIntentRecommendation(intent: MeldingWidgetIntent(discipline: .ambulance), description: "Ambulance")]
    }
    #endif
}

struct TodayProvider: TimelineProvider {
    func placeholder(in context: Context) -> MeldingEntry { .sample }

    func getSnapshot(in context: Context, completion: @escaping (MeldingEntry) -> Void) {
        if context.isPreview { completion(.sample); return }
        Task { completion(await WidgetData.entry(fresh: false, useAppFilters: false)) }
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<MeldingEntry>) -> Void) {
        Task {
            let entry = await WidgetData.entry(fresh: true, useAppFilters: false)
            // New entry at midnight so "today" resets.
            let midnight = Calendar.current.startOfDay(for: .now.addingTimeInterval(86_400))
            let reset = MeldingEntry(date: midnight, meldingen: entry.meldingen, today: 0, perDienst: [:])
            completion(Timeline(entries: [entry, reset], policy: .after(min(WidgetData.nextRefresh, midnight))))
        }
    }
}

// MARK: - Samples (placeholder / gallery)

extension Melding {
    static var samples: [Melding] {
        let now = Date.now
        let rows: [[String: Any]] = [
            ["guid": "s1", "title": "Ambu 06343 - Apeldoorn Rit 337571", "dienst": "ambulance", "prioriteit": "A1",
             "categorie": "Ambulance spoedurgentie", "stad": "Apeldoorn", "datum_tijd": Fmt.isoString(now.addingTimeInterval(-180))],
            ["guid": "s2", "title": "BON-06 BR container Veenweg Apeldoorn 062631", "dienst": "brandweer", "prioriteit": "P1",
             "categorie": "Afvalcontainer brand", "stad": "Apeldoorn", "locatie": "Veenweg", "datum_tijd": Fmt.isoString(now.addingTimeInterval(-1500))],
            ["guid": "s3", "title": "Ambu 06343 DIA Ugchelen Rit 337500", "dienst": "ambulance", "prioriteit": "A2",
             "categorie": "Directe inzet ambulance", "stad": "Ugchelen", "datum_tijd": Fmt.isoString(now.addingTimeInterval(-2900))],
            ["guid": "s4", "title": "Aanrijding letsel Koedijk Loenen 837791", "dienst": "politie",
             "categorie": "Aanrijding met letsel", "stad": "Loenen", "locatie": "Koedijk", "datum_tijd": Fmt.isoString(now.addingTimeInterval(-5200))],
            ["guid": "s5", "title": "BON-03 CO-melder Vlinderstraat Beekbergen 062941", "dienst": "brandweer", "prioriteit": "P2",
             "categorie": "Rookmelder", "stad": "Beekbergen", "locatie": "Vlinderstraat", "datum_tijd": Fmt.isoString(now.addingTimeInterval(-7400))],
            ["guid": "s6", "title": "Ambu 06122 DIA Beekbergen Rit 337479", "dienst": "ambulance", "prioriteit": "A2",
             "categorie": "Directe inzet ambulance", "stad": "Beekbergen", "datum_tijd": Fmt.isoString(now.addingTimeInterval(-9300))],
        ]
        return rows.compactMap { row in
            guard let data = try? JSONSerialization.data(withJSONObject: row) else { return nil }
            return try? JSONDecoder().decode(Melding.self, from: data)
        }
    }
}
