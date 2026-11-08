import Foundation
import SwiftUI
import Observation
import CoreLocation

// MARK: - Model

/// NL-Alert, Burgernet or KNMI warning for the working area, as returned by GET /v1/waarschuwingen.
struct Waarschuwing: Decodable, Identifiable, Hashable, Sendable {
    enum Bron: String, Decodable, Sendable, CaseIterable { case nlalert, burgernet, knmi }

    let id: String
    let bron: Bron
    let titel: String
    let tekst: String?
    let tekstEn: String?
    let plaats: String?
    /// KNMI: "yellow", "orange" or "red".
    let niveau: String?
    /// KNMI weather type ("Mist", "Wind") or Burgernet kind ("Vermissing").
    let soort: String?
    /// "actief", "verwacht" or "beeindigd".
    let status: String
    let start: Date
    let einde: Date?
    let lat: Double?
    let lon: Double?
    let link: String?
    /// Rings of [lon, lat].
    let gebied: [[[Double]]]?
    /// KNMI: what to expect.
    let verwachting: String?
    /// KNMI: what to do.
    let advies: String?
    /// KNMI: headline, description, details and issue time from knmi.nl.
    let knmiKop: String?
    let omschrijving: String?
    let details: String?
    let uitgifte: String?

    enum CodingKeys: String, CodingKey {
        case id, bron, titel, tekst, plaats, niveau, soort, status, start, einde, lat, lon, link, gebied, verwachting, advies, omschrijving, details, uitgifte
        case knmiKop = "kop"
        case tekstEn = "tekst_en"
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        bron = try c.decode(Bron.self, forKey: .bron)
        titel = (try? c.decode(String.self, forKey: .titel)) ?? ""
        tekst = try? c.decodeIfPresent(String.self, forKey: .tekst)
        tekstEn = try? c.decodeIfPresent(String.self, forKey: .tekstEn)
        plaats = try? c.decodeIfPresent(String.self, forKey: .plaats)
        niveau = try? c.decodeIfPresent(String.self, forKey: .niveau)
        soort = try? c.decodeIfPresent(String.self, forKey: .soort)
        status = (try? c.decode(String.self, forKey: .status)) ?? "actief"
        start = (try? c.decode(String.self, forKey: .start)).flatMap(Fmt.parseISO) ?? .now
        einde = (try? c.decodeIfPresent(String.self, forKey: .einde)).flatMap { $0 }.flatMap(Fmt.parseISO)
        lat = try? c.decodeIfPresent(Double.self, forKey: .lat)
        lon = try? c.decodeIfPresent(Double.self, forKey: .lon)
        link = try? c.decodeIfPresent(String.self, forKey: .link)
        gebied = try? c.decodeIfPresent([[[Double]]].self, forKey: .gebied)
        verwachting = (try? c.decodeIfPresent(String.self, forKey: .verwachting)).flatMap { $0 }
        advies = (try? c.decodeIfPresent(String.self, forKey: .advies)).flatMap { $0 }
        knmiKop = (try? c.decodeIfPresent(String.self, forKey: .knmiKop)).flatMap { $0 }
        omschrijving = (try? c.decodeIfPresent(String.self, forKey: .omschrijving)).flatMap { $0 }
        details = (try? c.decodeIfPresent(String.self, forKey: .details)).flatMap { $0 }
        uitgifte = (try? c.decodeIfPresent(String.self, forKey: .uitgifte)).flatMap { $0 }
    }

    var isActief: Bool { status == "actief" }
    /// KNMI has more than the feed's area names (headline, description or advice).
    var heeftKnmiTekst: Bool { bron == .knmi && (knmiKop != nil || omschrijving != nil || verwachting != nil || advies != nil) }
    /// KNMI risks and advice as separate lines (what to expect first, then what to do).
    var knmiAdviesRegels: [String] {
        [verwachting, advies].compactMap { $0 }.flatMap { $0.split(separator: "\n").map { $0.trimmingCharacters(in: .whitespaces) } }.filter { !$0.isEmpty }
    }
    var isBeeindigd: Bool { status == "beeindigd" }
    /// Key for the list filter: "nlalert", "burgernet", "knmi:yellow" …
    var filterKey: String { bron == .knmi ? "knmi:\(niveau ?? "yellow")" : bron.rawValue }
    var selectionTag: String { "w:\(id)" }

    var coordinate: CLLocationCoordinate2D? {
        guard let lat, let lon else { return nil }
        return .init(latitude: lat, longitude: lon)
    }

    /// The area as map rings.
    var rings: [[CLLocationCoordinate2D]] {
        (gebied ?? []).map { ring in ring.compactMap { $0.count == 2 ? CLLocationCoordinate2D(latitude: $0[1], longitude: $0[0]) : nil } }
    }

    func contains(lat: Double, lon: Double) -> Bool {
        (gebied ?? []).contains { Werkgebied.ring($0, contains: lat, lon) }
    }

    /// Whether a place (by name) is in or near this warning (2 km), for the place filter.
    func covers(plaats naam: String) -> Bool {
        if bron == .burgernet { return (plaats ?? "Apeldoorn").plaatsKey == naam.plaatsKey }
        guard let gebied, let p = Werkgebied.shared.plaats(naam) else { return true }
        if gebied.contains(where: { Werkgebied.ring($0, contains: p.lat, p.lon) }) { return true }
        return gebied.contains { ring in Werkgebied.distanceToRingKm(ring, p.lat, p.lon) <= 2 }
    }

    /// Whether a P2000 alert lies in this warning's area around its time window.
    func relates(to m: Melding) -> Bool {
        let from = start.addingTimeInterval(-2 * 3600)
        let to = (einde ?? start.addingTimeInterval(6 * 3600)).addingTimeInterval(3600)
        guard m.datum >= from, m.datum <= to else { return false }
        if bron == .burgernet { return m.dienst == .politie && Werkgebied.shared.plaatsen(for: m).contains(plaats ?? "Apeldoorn") }
        guard m.hasStreet, let lat = m.lat, let lon = m.lon else { return false }
        return contains(lat: lat, lon: lon)
    }

    // MARK: Presentation

    var label: String {
        switch bron {
        case .nlalert: return "NL-Alert"
        case .burgernet: return "Burgernet"
        case .knmi: return Self.codeLabel(niveau)
        }
    }

    /// "Code geel · Mist", "Burgernet · Vermissing", "NL-Alert".
    var kop: String {
        switch bron {
        case .knmi: return [label, soort].compactMap { $0 }.joined(separator: " · ")
        case .burgernet: return [label, soort].compactMap { $0 }.joined(separator: " · ")
        case .nlalert: return label
        }
    }

    var statusLabel: String {
        switch status {
        case "beeindigd": return L("Beëindigd")
        case "verwacht": return L("Verwacht")
        default: return L("Actief")
        }
    }

    var color: Color {
        switch bron {
        case .nlalert: return Color(hex: 0xFFC800)
        case .burgernet: return Color(hex: 0x0067B1)
        case .knmi: return Self.codeColor(niveau)
        }
    }

    /// Text color on top of `color`.
    var onColor: Color {
        switch bron {
        case .nlalert: return .black
        case .burgernet: return .white
        case .knmi: return niveau == "yellow" ? .black : .white
        }
    }

    var systemImage: String {
        switch bron {
        case .nlalert: return "exclamationmark.triangle.fill"
        case .burgernet: return soort == "Vermissing" ? "figure.walk" : soort == "Voertuig" ? "car.fill" : "megaphone.fill"
        case .knmi: return Self.weatherSymbol(soort)
        }
    }

    static func codeLabel(_ niveau: String?) -> String {
        switch niveau {
        case "red": return L("Code rood")
        case "orange": return L("Code oranje")
        default: return L("Code geel")
        }
    }

    static func codeColor(_ niveau: String?) -> Color {
        switch niveau {
        case "red": return Color(hex: 0xE3001B)
        case "orange": return Color(hex: 0xF28C28)
        default: return Color(hex: 0xF7C600)
        }
    }

    static func weatherSymbol(_ soort: String?) -> String {
        let s = (soort ?? "").lowercased()
        if s.contains("onweer") || s.contains("thunder") { return "cloud.bolt.rain.fill" }
        if s.contains("wind") || s.contains("storm") { return "wind" }
        if s.contains("sneeuw") || s.contains("snow") { return "cloud.snow.fill" }
        if s.contains("glad") || s.contains("ijzel") || s.contains("ice") { return "thermometer.snowflake" }
        if s.contains("mist") || s.contains("fog") { return "cloud.fog.fill" }
        if s.contains("regen") || s.contains("rain") { return "cloud.heavyrain.fill" }
        if s.contains("hitte") || s.contains("heat") { return "sun.max.fill" }
        if s.contains("kou") || s.contains("vorst") || s.contains("cold") { return "snowflake" }
        return "exclamationmark.triangle.fill"
    }
}

/// GET /v1/waarschuwingen/:id: the warning plus P2000 alerts in its area around its time.
struct WaarschuwingDetail: Decodable, Sendable {
    let waarschuwing: Waarschuwing
    let meldingen: [Melding]
    /// guid → "grip-in-gebied" or "in-gebied-rond-tijdstip".
    let relaties: [String: String]

    private struct Rel: Decodable { let guid: String; let relatie: String? }
    private enum Keys: String, CodingKey { case meldingen }

    init(from decoder: Decoder) throws {
        waarschuwing = try Waarschuwing(from: decoder)
        let c = try decoder.container(keyedBy: Keys.self)
        meldingen = (try? c.decode([Melding].self, forKey: .meldingen)) ?? []
        let rels = (try? c.decode([Rel].self, forKey: .meldingen)) ?? []
        relaties = Dictionary(rels.map { ($0.guid, $0.relatie ?? "in-gebied-rond-tijdstip") }, uniquingKeysWith: { a, _ in a })
    }
}

extension P2000API {
    func waarschuwingen() async throws -> [Waarschuwing] {
        try await getJSON("v1/waarschuwingen", as: [Waarschuwing].self)
    }

    func waarschuwing(id: String) async throws -> WaarschuwingDetail {
        // appendingPathComponent escapes what is needed; ids only contain letters, digits, ":", "-", "." and "T".
        try await getJSON("v1/waarschuwingen/\(id)", as: WaarschuwingDetail.self)
    }

    /// NL-Alert, Burgernet and KNMI of the last `days` days (the server keeps up to 14).
    func waarschuwingen(days: Int) async throws -> [Waarschuwing] {
        try await getJSON("v1/waarschuwingen", query: ["days": String(days)], as: [Waarschuwing].self)
    }

    /// Weather at the place and time of the warning (WeatherKit via the Worker, like an alert).
    func waarschuwingWeather(id: String) async -> AlertWeather? {
        try? await getJSON("v1/waarschuwingen/\(id)/weather", as: AlertWeather.self)
    }
}

// MARK: - Store

/// NL-Alert, Burgernet and KNMI for the working area; polls every minute while the app is active.
@MainActor
@Observable
final class WaarschuwingStore {
    static let shared = WaarschuwingStore()

    private(set) var items: [Waarschuwing] = []
    private(set) var lastUpdated: Date?
    @ObservationIgnored private var pollTask: Task<Void, Never>?

    func refresh() async {
        guard let list = try? await P2000API.shared.waarschuwingen() else { return }
        items = list
        lastUpdated = .now
    }

    func startPolling() {
        pollTask?.cancel()
        pollTask = Task { [weak self] in
            while !Task.isCancelled {
                await self?.refresh()
                try? await Task.sleep(for: .seconds(60))
            }
        }
    }

    func stopPolling() {
        pollTask?.cancel()
        pollTask = nil
    }

    func item(id: String) -> Waarschuwing? { items.first { $0.id == id } }

    /// Warnings for the pager: NL-Alert and Burgernet of the last 24 hours (or still active), with the user's filters.
    func pager(_ s: AppSettings, search: String = "") -> [Waarschuwing] {
        let cutoff = Date.now.addingTimeInterval(-MeldingStore.timelineWindow)
        let q = search.trimmingCharacters(in: .whitespaces).lowercased()
        return items.filter { w in
            guard w.bron != .knmi else { return false }
            guard !w.isBeeindigd || (w.einde ?? w.start) >= cutoff || w.start >= cutoff else { return false }
            guard s.matchesList(w) else { return false }
            guard !q.isEmpty else { return true }
            return [w.titel, w.tekst ?? "", w.plaats ?? "", w.label].contains { $0.lowercased().contains(q) }
        }
    }

    /// Active or upcoming KNMI warnings for the bar at the top of the pager (highest code first).
    func knmiBanner(_ s: AppSettings) -> [Waarschuwing] {
        let order = ["red": 0, "orange": 1, "yellow": 2]
        return items.filter { $0.bron == .knmi && !$0.isBeeindigd && s.matchesList($0) }
            .sorted { (order[$0.niveau ?? ""] ?? 3, $0.start) < (order[$1.niveau ?? ""] ?? 3, $1.start) }
    }

    /// Area warnings that cover a P2000 alert (for the "Waarschuwingen" block on its detail page).
    func related(to m: Melding) -> [Waarschuwing] {
        items.filter { $0.relates(to: m) }
    }
}

// MARK: - Icon

/// Square icon with the warning colour and symbol (list rows, detail header).
struct WaarschuwingIcon: View {
    let waarschuwing: Waarschuwing
    var size: CGFloat = 38

    var body: some View {
        if waarschuwing.bron != .knmi {
            // Léon's own artwork (NL-Alert triangle, Burgernet house), like the discipline icons.
            Image(waarschuwing.bron == .nlalert ? "icon_nlalert" : "icon_burgernet")
                .resizable()
                .scaledToFit()
                .frame(width: size, height: size)
                .opacity(waarschuwing.isBeeindigd ? 0.75 : 1)
                .accessibilityLabel(Text(verbatim: waarschuwing.kop))
        } else {
            tile
        }
    }

    private var tile: some View {
        ZStack {
            RoundedRectangle(cornerRadius: size * 0.24, style: .continuous)
                .fill(waarschuwing.bron == .nlalert ? Color.black : waarschuwing.color)
            Image(systemName: waarschuwing.systemImage)
                .font(.system(size: size * 0.48, weight: .bold))
                .foregroundStyle(waarschuwing.bron == .nlalert ? waarschuwing.color
                                 : waarschuwing.bron == .burgernet ? Color(hex: 0xF39200) : waarschuwing.onColor)
        }
        .frame(width: size, height: size)
        .opacity(waarschuwing.isBeeindigd ? 0.75 : 1)
        .accessibilityLabel(Text(verbatim: waarschuwing.kop))
    }
}

/// Map pin for a warning: NL-Alert and Burgernet use their own marker artwork, KNMI the icon.
struct WaarschuwingMarker: View {
    let waarschuwing: Waarschuwing
    var size: CGFloat = 40

    var body: some View {
        if waarschuwing.bron != .knmi {
            Image(waarschuwing.bron == .nlalert ? "marker_nlalert" : "marker_burgernet")
                .resizable()
                .scaledToFit()
                .frame(width: size * 0.82, height: size)
                .shadow(color: .black.opacity(0.3), radius: 3, y: 2)
                .accessibilityLabel(Text(verbatim: waarschuwing.kop))
        } else {
            WaarschuwingIcon(waarschuwing: waarschuwing, size: size * 0.8)
                .shadow(radius: 3)
        }
    }
}
