import Foundation
import SwiftUI

/// Tab Nieuws: police news about our places, an article per KNMI weather warning and a liveblog per
/// Burgernet, AMBER Alert and Vermist Kind Alert (with messages the beheer adds).
/// Police texts come from politie.nl (source named); their photos are never shown: the server gives an A-Alerts image.
struct NieuwsItem: Decodable, Identifiable, Hashable, Sendable {
    enum Soort: String, Decodable, Sendable, CaseIterable { case politie, weer, liveblog, regionaal }

    let id: String
    let soort: Soort
    let bron: String
    let titel: String
    let intro: String?
    let plaats: String?
    let at: Date
    let bijgewerkt: Date?
    let start: Date?
    let status: String?
    let niveau: String?
    let categorie: String?
    let afbeelding: URL?
    let link: URL?
    let bronUrl: URL?
    let waarschuwing: String?
    let aantal: Int?
    /// Set in the beheer: shown as a liveblog (label and banner). Older servers: every Burgernet/AMBER/Vermist Kind item.
    let isLiveblog: Bool
    /// Photographer of the stock photo when it needs a credit ("JS Fotografie").
    let fotoBron: String?

    enum CodingKeys: String, CodingKey {
        case id, soort, bron, titel, intro, plaats, at, bijgewerkt, start, status, niveau, categorie, afbeelding, link, waarschuwing, aantal, liveblog
        case fotoBron = "foto_bron"
        case bronUrl = "bron_url"
    }

    init(from d: Decoder) throws {
        let c = try d.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        soort = try c.decode(Soort.self, forKey: .soort)
        bron = try c.decode(String.self, forKey: .bron)
        titel = try c.decode(String.self, forKey: .titel)
        intro = try c.decodeIfPresent(String.self, forKey: .intro)
        plaats = try c.decodeIfPresent(String.self, forKey: .plaats)
        at = NieuwsItem.datum(try c.decode(String.self, forKey: .at)) ?? Date()
        bijgewerkt = (try c.decodeIfPresent(String.self, forKey: .bijgewerkt)).flatMap(NieuwsItem.datum)
        start = (try? c.decodeIfPresent(String.self, forKey: .start)).flatMap { $0 }.flatMap(NieuwsItem.datum)
        status = try c.decodeIfPresent(String.self, forKey: .status)
        niveau = try c.decodeIfPresent(String.self, forKey: .niveau)
        categorie = try c.decodeIfPresent(String.self, forKey: .categorie)
        afbeelding = (try c.decodeIfPresent(String.self, forKey: .afbeelding)).flatMap(URL.init(string:))
        link = (try c.decodeIfPresent(String.self, forKey: .link)).flatMap(URL.init(string:))
        bronUrl = (try c.decodeIfPresent(String.self, forKey: .bronUrl)).flatMap(URL.init(string:))
        waarschuwing = try c.decodeIfPresent(String.self, forKey: .waarschuwing)
        aantal = try c.decodeIfPresent(Int.self, forKey: .aantal)
        isLiveblog = (try? c.decodeIfPresent(Bool.self, forKey: .liveblog)) ?? (soort == .liveblog)
        fotoBron = (try? c.decodeIfPresent(String.self, forKey: .fotoBron)) ?? nil
    }

    /// Filter chips: "Liveblogs" follows the beheer switch, the others the kind of item.
    func hoortBij(_ filter: Soort?) -> Bool {
        guard let filter else { return true }
        return filter == .liveblog ? isLiveblog : soort == filter
    }

    static func datum(_ s: String) -> Date? {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let d = f.date(from: s) { return d }
        f.formatOptions = [.withInternetDateTime]
        return f.date(from: s)
    }

    var isAfgerond: Bool { status == "afgerond" }
    var isLive: Bool { soort == .liveblog && !isAfgerond }
    var laatste: Date { max(bijgewerkt ?? at, at) }

    /// Label on the photo: "Liveblog · Burgernet", "Politie · Ugchelen", "Weer · Code oranje".
    var label: String { isLiveblog ? "\(L("Liveblog")) · \(basisLabel)" : basisLabel }

    private var basisLabel: String {
        switch soort {
        case .liveblog: return bronNaam
        case .politie: return "\(L("Politie"))\(plaats.map { " · \($0)" } ?? "")"
        case .weer: return "\(L("Weer")) · \(Waarschuwing.codeLabel(niveau))"
        case .regionaal: return "112 Nieuws\(plaats.map { " · \($0)" } ?? "")"
        }
    }

    /// Source line under police and 112 Nieuws articles, with the photo credit when there is one.
    var bronRegel: String? {
        switch soort {
        case .regionaal: return fotoBron.map { Lf("Bron: 112 Nieuws Nederland (112nieuws.net), met toestemming. Foto: %@.", $0) } ?? L("Bron: 112 Nieuws Nederland (112nieuws.net), met toestemming. De foto is een stockfoto.")
        case .politie: return fotoBron.map { Lf("Bron: politie.nl. Foto: %@.", $0) } ?? L("Bron: politie.nl. De afbeelding is een stockfoto.")
        default: return nil
        }
    }

    var bronNaam: String {
        switch bron {
        case "burgernet": return "Burgernet"
        case "amber": return "AMBER Alert"
        case "vermistkind": return L("Vermist Kind")
        case "nlalert": return "NL-Alert"
        case "knmi": return "KNMI"
        case "112nieuws": return "112 Nieuws"
        default: return L("Politie")
        }
    }

    /// Small icon next to the label (same images as the warnings).
    var icoon: String? {
        switch bron {
        case "burgernet", "amber", "vermistkind", "knmi", "nlalert": return "icon_\(bron)"
        case "112nieuws":
            switch categorie {
            case "brand": return "icon_brandweer"
            case "traumaheli": return "icon_traumaheli"
            case "politie": return "icon_politie"
            default: return "icon_ambulance"
            }
        default: return "icon_politie"
        }
    }

    var kleur: Color {
        switch bron {
        case "burgernet": return Color(hex: 0x0067B1)
        case "amber": return Color(hex: 0xEC6E24)
        case "vermistkind": return Color(hex: 0x1B265E)
        case "nlalert": return Color(hex: 0x1D1D1F)
        case "knmi": return Waarschuwing.codeColor(niveau ?? "yellow")
        case "112nieuws": return Color(hex: 0xDC2626)
        default: return Color(hex: 0x1E3A8C)
        }
    }
}

struct NieuwsDetail: Decodable, Sendable {
    struct Alinea: Decodable, Hashable, Sendable { let titel: String?; let tekst: String }
    struct Bericht: Decodable, Hashable, Sendable, Identifiable {
        let serverId: Int?
        let at: Date
        let soort: String
        let door: String
        let titel: String?
        let tekst: String
        let plaats: String?
        let foto: URL?
        let url: URL?
        var id: String { "\(serverId.map(String.init) ?? "b")-\(at.timeIntervalSince1970)-\(tekst.hashValue)" }
        /// Added by A-Alerts (beheer) instead of the official source.
        var isEigen: Bool { door == "a-alerts" }

        enum CodingKeys: String, CodingKey { case serverId = "id", at, soort, door, titel, tekst, plaats, foto, url }
        init(from d: Decoder) throws {
            let c = try d.container(keyedBy: CodingKeys.self)
            serverId = try? c.decodeIfPresent(Int.self, forKey: .serverId)
            at = (try c.decodeIfPresent(String.self, forKey: .at)).flatMap(NieuwsItem.datum) ?? Date()
            soort = (try c.decodeIfPresent(String.self, forKey: .soort)) ?? "update"
            door = (try c.decodeIfPresent(String.self, forKey: .door)) ?? ""
            titel = try c.decodeIfPresent(String.self, forKey: .titel)
            tekst = (try c.decodeIfPresent(String.self, forKey: .tekst)) ?? ""
            plaats = try c.decodeIfPresent(String.self, forKey: .plaats)
            foto = (try c.decodeIfPresent(String.self, forKey: .foto)).flatMap(URL.init(string:))
            url = (try c.decodeIfPresent(String.self, forKey: .url)).flatMap(URL.init(string:))
        }
    }

    let item: NieuwsItem
    let alineas: [Alinea]
    let tijdlijn: [Bericht]
    let bronNaam: String?
    /// Weather articles: the content in the layout of knmi.nl (map, headline, code, advice).
    let weer: WeerArtikel?

    enum CodingKeys: String, CodingKey { case alineas, tijdlijn, bronNaam = "bron_naam", weer }
    init(from d: Decoder) throws {
        item = try NieuwsItem(from: d)
        let c = try d.container(keyedBy: CodingKeys.self)
        alineas = (try? c.decodeIfPresent([Alinea].self, forKey: .alineas)) ?? []
        tijdlijn = (try? c.decodeIfPresent([Bericht].self, forKey: .tijdlijn)) ?? []
        bronNaam = try c.decodeIfPresent(String.self, forKey: .bronNaam)
        weer = try? c.decodeIfPresent(WeerArtikel.self, forKey: .weer)
    }
}

/// One item that fails to decode is skipped, never the whole list.
private struct LosNieuws: Decodable {
    let item: NieuwsItem?
    init(from d: Decoder) throws { item = try? NieuwsItem(from: d) }
}

extension P2000API {
    func nieuws(soort: NieuwsItem.Soort? = nil, limit: Int = 60) async throws -> [NieuwsItem] {
        var q = ["limit": String(limit)]
        if let soort { q["soort"] = soort.rawValue }
        return try await getJSON("v1/nieuws", query: q, as: [LosNieuws].self).compactMap(\.item)
    }

    func nieuws(id: String) async throws -> NieuwsDetail {
        try await getJSON("v1/nieuws/\(id)", as: NieuwsDetail.self)
    }
}

/// The list for the tab (kept per app run, refreshed every two minutes while visible).
@MainActor
@Observable
final class NieuwsStore {
    static let shared = NieuwsStore()
    var items: [NieuwsItem] = []
    var loading = false
    var error: String?
    private var lastLoad: Date?

    func load(force: Bool = false) async {
        if !force, let lastLoad, Date().timeIntervalSince(lastLoad) < 60, !items.isEmpty { return }
        loading = items.isEmpty
        defer { loading = false }
        do {
            items = try await P2000API.shared.nieuws()
            error = nil
            lastLoad = Date()
        } catch {
            if items.isEmpty { self.error = error.localizedDescription }
        }
    }
}

extension NieuwsItem {
    /// "zojuist", "12 min geleden", "vandaag 14:05", "gisteren 21:44", "3 nov 09:30".
    static func wanneer(_ d: Date) -> String {
        let s = Date().timeIntervalSince(d)
        if s < 60 { return L("zojuist") }
        if s < 3600 { return Lf("%lld min geleden", Int(s / 60)) }
        let cal = Calendar.current
        let tijd = d.formatted(date: .omitted, time: .shortened)
        if cal.isDateInToday(d) { return "\(L("vandaag")) \(tijd)" }
        if cal.isDateInYesterday(d) { return "\(L("gisteren")) \(tijd)" }
        return "\(d.formatted(.dateTime.day().month(.abbreviated))) \(tijd)"
    }
}
