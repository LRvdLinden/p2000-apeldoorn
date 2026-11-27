import Foundation
import SwiftUI

// Insight into the alerts, from api.a-alerts.nl: the hectometre post the server placed, the explanation of the
// abbreviations in a P2000 text, the figures of the last 28 days (also per place and per unit) and the share image.
// Everything is decoded leniently: a field the server does not (yet) send leaves that part out, never invented.

// MARK: - Hectometre post from the server

/// `hm` of an alert: {"weg":"A50","hm":1234,"zijde":"Re","tekst":"A50 Re hm 123,4"} (hm in hundreds of metres × 10).
struct HmInfo: Codable, Hashable, Sendable {
    var weg: String?
    var hm: Int?
    var zijde: String?
    var tekst: String?

    init(from d: Decoder) throws {
        let c = try d.container(keyedBy: CodingKeys.self)
        weg = try? c.decodeIfPresent(String.self, forKey: .weg)
        hm = c.flexibleDouble(.hm).map { Int($0.rounded()) }
        zijde = try? c.decodeIfPresent(String.self, forKey: .zijde)
        tekst = try? c.decodeIfPresent(String.self, forKey: .tekst)
    }
}

// MARK: - Abbreviations

struct Afkorting: Codable, Hashable, Identifiable, Sendable {
    var term: String
    var uitleg: String
    var uitlegEN: String?
    var dienst: String?
    /// Only in capitals counts ("TS" yes, "ts" no).
    var hoofdletters: Bool

    var id: String { term }
    /// In the language of the app (English when the server has an English text).
    var tekst: String { Config.uiLanguage.hasPrefix("en") ? (uitlegEN?.isEmpty == false ? uitlegEN! : uitleg) : uitleg }

    enum CodingKeys: String, CodingKey { case term, uitleg, uitlegEN = "uitleg_en", dienst, hoofdletters }

    init(from d: Decoder) throws {
        let c = try d.container(keyedBy: CodingKeys.self)
        term = (try? c.decode(String.self, forKey: .term)) ?? ""
        uitleg = (try? c.decode(String.self, forKey: .uitleg)) ?? ""
        uitlegEN = try? c.decodeIfPresent(String.self, forKey: .uitlegEN)
        dienst = try? c.decodeIfPresent(String.self, forKey: .dienst)
        hoofdletters = (try? c.decodeIfPresent(Bool.self, forKey: .hoofdletters)) ?? false
    }
}

struct AfkortingenAntwoord: Codable, Sendable {
    var bijgewerkt: String?
    var items: [Afkorting]
}

/// The list of abbreviations: from the server, kept on the device so it also works offline.
@MainActor
@Observable
final class AfkortingenStore {
    static let shared = AfkortingenStore()
    private(set) var items: [Afkorting] = []
    var error: String?
    private var geladen: Date?
    private let opslagKey = "afkortingen.v1"

    private init() {
        if let data = UserDefaults.standard.data(forKey: opslagKey),
           let a = try? JSONDecoder().decode(AfkortingenAntwoord.self, from: data) {
            items = a.items.filter { !$0.term.isEmpty && !$0.uitleg.isEmpty }
        }
    }

    /// At most every six hours from the server (the list hardly changes).
    func laad(force: Bool = false) async {
        if !force, let geladen, Date().timeIntervalSince(geladen) < 6 * 3600, !items.isEmpty { return }
        do {
            let data = try await P2000API.shared.getData("v1/afkortingen")
            let a = try JSONDecoder().decode(AfkortingenAntwoord.self, from: data)
            let lijst = a.items.filter { !$0.term.isEmpty && !$0.uitleg.isEmpty }
            if !lijst.isEmpty {
                items = lijst
                UserDefaults.standard.set(data, forKey: opslagKey)
            }
            geladen = Date()
            error = nil
        } catch {
            if items.isEmpty { self.error = error.localizedDescription }
        }
    }

    /// The abbreviations in a text, each once, in the order they appear. Whole words only.
    func gevonden(in tekst: String) -> [(range: Range<String.Index>, afkorting: Afkorting)] {
        Self.zoek(in: tekst, items: items)
    }

    nonisolated static func zoek(in tekst: String, items: [Afkorting]) -> [(range: Range<String.Index>, afkorting: Afkorting)] {
        var uit: [(range: Range<String.Index>, afkorting: Afkorting)] = []
        // Longest terms first, so "OvD-B" wins from "OvD".
        for a in items.sorted(by: { $0.term.count > $1.term.count }) {
            let escaped = NSRegularExpression.escapedPattern(for: a.term)
            let patroon = #"(?<![\p{L}\p{N}])"# + escaped + #"(?![\p{L}\p{N}])"#
            guard let re = try? NSRegularExpression(pattern: patroon, options: a.hoofdletters ? [] : [.caseInsensitive]) else { continue }
            for m in re.matches(in: tekst, range: NSRange(tekst.startIndex..., in: tekst)) {
                guard let r = Range(m.range, in: tekst) else { continue }
                if uit.contains(where: { $0.range.overlaps(r) }) { continue }
                uit.append((r, a))
            }
        }
        return uit.sorted { $0.range.lowerBound < $1.range.lowerBound }
    }
}

// MARK: - Statistics (GET /v1/statistiek)

struct Statistiek: Decodable, Hashable, Sendable {
    struct Dag: Decodable, Hashable, Sendable {
        var datum: String
        var totaal: Int
        var perDienst: [String: Int]
        enum CodingKeys: String, CodingKey { case datum, totaal, perDienst = "per_dienst" }
        init(from d: Decoder) throws {
            let c = try d.container(keyedBy: CodingKeys.self)
            datum = (try? c.decode(String.self, forKey: .datum)) ?? ""
            totaal = Int(c.flexibleDouble(.totaal) ?? 0)
            perDienst = (try? c.decodeIfPresent([String: Int].self, forKey: .perDienst)) ?? [:]
        }
        var date: Date? { Statistiek.dagFormat.date(from: String(datum.prefix(10))) }
    }
    struct Plaats: Decodable, Hashable, Sendable { var plaats: String; var aantal: Int }
    struct Eenheid: Decodable, Hashable, Sendable {
        var code: String?
        var naam: String?
        var dienst: String?
        var aantal: Int
        var titel: String { naam?.isEmpty == false ? naam! : (code ?? "–") }
    }
    struct Gisteren: Decodable, Hashable, Sendable { var totaal: Int?; var gemiddeld: Double? }
    struct Toestel: Decodable, Hashable, Sendable { var naam: String; var aantal: Int }
    struct Helis: Decodable, Hashable, Sendable {
        var inzetten: Int?
        var perToestel: [Toestel]
        enum CodingKeys: String, CodingKey { case inzetten, perToestel = "per_toestel" }
        init(from d: Decoder) throws {
            let c = try d.container(keyedBy: CodingKeys.self)
            inzetten = c.flexibleDouble(.inzetten).map { Int($0) }
            perToestel = (try? c.decodeIfPresent([Toestel].self, forKey: .perToestel)) ?? []
        }
    }

    var bijgewerkt: Date?
    var dagen: Int
    var totaal: Int
    /// 0…23.
    var perUur: [Int]
    /// Monday…Sunday.
    var perWeekdag: [Int]
    var perDienst: [String: Int]
    var perPrioriteit: [String: Int]
    var perDag: [Dag]
    var topPlaatsen: [Plaats]
    var topEenheden: [Eenheid]
    var gisteren: Gisteren?
    var helikopters: Helis?

    enum CodingKeys: String, CodingKey {
        case bijgewerkt, dagen, totaal, perUur = "per_uur", perWeekdag = "per_weekdag", perDienst = "per_dienst"
        case perPrioriteit = "per_prioriteit", perDag = "per_dag", topPlaatsen = "top_plaatsen", topEenheden = "top_eenheden"
        case gisteren, helikopters
    }

    init(from d: Decoder) throws {
        let c = try d.container(keyedBy: CodingKeys.self)
        bijgewerkt = ((try? c.decodeIfPresent(String.self, forKey: .bijgewerkt)) ?? nil).flatMap { Fmt.parseISO($0) }
        dagen = Int(c.flexibleDouble(.dagen) ?? 28)
        totaal = Int(c.flexibleDouble(.totaal) ?? 0)
        let uur = (try? c.decodeIfPresent([Int].self, forKey: .perUur)) ?? []
        perUur = uur.count == 24 ? uur : Array(repeating: 0, count: 24)
        let wd = (try? c.decodeIfPresent([Int].self, forKey: .perWeekdag)) ?? []
        perWeekdag = wd.count == 7 ? wd : Array(repeating: 0, count: 7)
        perDienst = (try? c.decodeIfPresent([String: Int].self, forKey: .perDienst)) ?? [:]
        perPrioriteit = (try? c.decodeIfPresent([String: Int].self, forKey: .perPrioriteit)) ?? [:]
        perDag = (try? c.decodeIfPresent([Dag].self, forKey: .perDag)) ?? []
        topPlaatsen = (try? c.decodeIfPresent([Plaats].self, forKey: .topPlaatsen)) ?? []
        topEenheden = (try? c.decodeIfPresent([Eenheid].self, forKey: .topEenheden)) ?? []
        gisteren = try? c.decodeIfPresent(Gisteren.self, forKey: .gisteren)
        helikopters = try? c.decodeIfPresent(Helis.self, forKey: .helikopters)
    }

    /// Busiest hour (nil without alerts).
    var druksteUur: Int? { perUur.max().flatMap { $0 > 0 ? perUur.firstIndex(of: $0) : nil } }
    /// Busiest weekday, 0 = Monday.
    var druksteWeekdag: Int? { perWeekdag.max().flatMap { $0 > 0 ? perWeekdag.firstIndex(of: $0) : nil } }

    nonisolated static let dagFormat: DateFormatter = {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone(identifier: "Europe/Amsterdam")
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    /// "ma", "di" … in the language of the app, Monday first.
    static var weekdagKort: [String] {
        let namen = Calendar.current.shortWeekdaySymbols // Sunday first
        return Array(namen[1...]) + [namen[0]]
    }
}

/// What a list of alerts is filtered on: a place or a unit (capcode).
enum MeldingFilter: Hashable, Identifiable, Sendable {
    case plaats(String)
    case eenheid(code: String, naam: String?)

    var id: String {
        switch self {
        case .plaats(let p): return "p:" + p
        case .eenheid(let c, _): return "e:" + c
        }
    }
    var titel: String {
        switch self {
        case .plaats(let p): return p
        case .eenheid(let c, let n): return n?.isEmpty == false ? n! : c
        }
    }
    var query: [String: String] {
        switch self {
        case .plaats(let p): return ["plaats": p]
        case .eenheid(let c, _): return ["eenheid": c]
        }
    }
}

/// Share image formats of GET /v1/meldingen/{guid}/afbeelding.png.
enum AfbeeldingFormaat: String, CaseIterable, Identifiable, Sendable {
    case og, vierkant, staand
    var id: String { rawValue }
    var label: String {
        switch self {
        case .og: return L("Liggend")
        case .vierkant: return L("Vierkant")
        case .staand: return L("Staand")
        }
    }
    var uitleg: String {
        switch self {
        case .og: return L("Voor berichten en X (1200 × 630)")
        case .vierkant: return L("Voor een Instagram-bericht (1080 × 1350)")
        case .staand: return L("Voor een story (1080 × 1920)")
        }
    }
}

extension P2000API {
    /// Raw body of a GET (abbreviations are kept as they came).
    func getData(_ path: String, query: [String: String] = [:]) async throws -> Data {
        var comps = URLComponents(url: Config.apiBase.appendingPathComponent(path), resolvingAgainstBaseURL: false)!
        if !query.isEmpty { comps.queryItems = query.sorted { $0.key < $1.key }.map { URLQueryItem(name: $0.key, value: $0.value) } }
        var request = URLRequest(url: comps.url!)
        request.setValue("A-Alerts-Apple/\(Config.version)", forHTTPHeaderField: "X-App-Client")
        if let token = Config.apiToken() { request.setValue(token, forHTTPHeaderField: "X-AAlerts-Token") }
        request.cachePolicy = .reloadIgnoringLocalCacheData
        request.timeoutInterval = 25
        let (data, response) = try await URLSession.shared.data(for: request)
        if let http = response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) { throw APIError.badStatus(http.statusCode) }
        return data
    }

    func statistiek(dagen: Int = 28, filter: MeldingFilter? = nil) async throws -> Statistiek {
        var q = ["dagen": String(dagen)]
        if let filter { q.merge(filter.query) { $1 } }
        return try await getJSON("v1/statistiek", query: q, as: Statistiek.self)
    }

    /// Alerts of one place or one unit, newest first.
    func meldingen(_ filter: MeldingFilter, limit: Int = 100) async throws -> [Melding] {
        var q = filter.query
        q["limit"] = String(limit)
        return try await getJSON("v1/meldingen", query: q, as: [Melding].self)
    }

    /// The share image as a PNG file in the temporary folder (ready for the share sheet).
    func afbeelding(guid: String, formaat: AfbeeldingFormaat) async throws -> URL {
        let data = try await getData("v1/meldingen/\(guid)/afbeelding.png", query: ["formaat": formaat.rawValue])
        guard data.count > 100, data.starts(with: [0x89, 0x50, 0x4E, 0x47]) else { throw APIError.badStatus(415) }
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("A-Alerts-\(guid.suffix(12))-\(formaat.rawValue).png")
        try data.write(to: url, options: .atomic)
        return url
    }
}
