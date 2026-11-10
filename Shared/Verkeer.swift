import SwiftUI
import Observation
import CoreLocation

// Traffic layer on the map (GET /v1/verkeer): closures, roadworks, accidents, breakdowns and traffic jams in the
// region from the NDW open data (Rijkswaterstaat, provinces and municipalities), and the fixed speed cameras from
// OpenStreetMap. The server reads them from the separate A-Alerts verkeer service.

struct VerkeerItem: Decodable, Identifiable, Hashable, Sendable {
    enum Soort: String, Decodable, Sendable, CaseIterable { case ongeval, afsluiting, file, pech, werk }

    let id: String
    let soort: Soort
    let titel: String
    let opmerking: String?
    let bron: String?
    let start: String?
    let einde: String?
    let lat: Double
    let lon: Double
    let lijn: [[Double]]?
    let vertragingMin: Int?
    let lengteKm: Double?
    let weg: String?
    let plaats: String?
    /// "A1 richting Amersfoort" (or the street), "tussen afrit 22 Twello en afrit 18 Kootwijk".
    let kop: String?
    let traject: String?
    let oorzaak: String?
    let toelichting: [String]
    let rijstrokenOpen: Int?
    let rijstrokenTotaal: Int?
    let maxSnelheid: Int?
    let hinder: Int?
    let omleiding: Bool
    let infoURL: URL?
    let tijdvakken: [[String]]

    struct Rijstroken: Decodable { let open: Int?; let totaal: Int? }
    enum CodingKeys: String, CodingKey {
        case id, soort, titel, opmerking, bron, start, einde, lat, lon, lijn, weg, plaats, kop, traject, oorzaak, toelichting, rijstroken, hinder, omleiding, tijdvakken
        case vertragingMin = "vertraging_min", lengteKm = "lengte_km", maxSnelheid = "max_snelheid", infoURL = "info_url"
    }
    init(from d: Decoder) throws {
        let c = try d.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        soort = (try? c.decode(Soort.self, forKey: .soort)) ?? .werk
        titel = (try? c.decode(String.self, forKey: .titel)) ?? ""
        opmerking = try? c.decodeIfPresent(String.self, forKey: .opmerking)
        bron = try? c.decodeIfPresent(String.self, forKey: .bron)
        start = try? c.decodeIfPresent(String.self, forKey: .start)
        einde = try? c.decodeIfPresent(String.self, forKey: .einde)
        lat = try c.decode(Double.self, forKey: .lat)
        lon = try c.decode(Double.self, forKey: .lon)
        lijn = try? c.decodeIfPresent([[Double]].self, forKey: .lijn)
        vertragingMin = try? c.decodeIfPresent(Int.self, forKey: .vertragingMin)
        lengteKm = try? c.decodeIfPresent(Double.self, forKey: .lengteKm)
        weg = try? c.decodeIfPresent(String.self, forKey: .weg)
        plaats = try? c.decodeIfPresent(String.self, forKey: .plaats)
        kop = try? c.decodeIfPresent(String.self, forKey: .kop)
        traject = try? c.decodeIfPresent(String.self, forKey: .traject)
        oorzaak = try? c.decodeIfPresent(String.self, forKey: .oorzaak)
        toelichting = (try? c.decodeIfPresent([String].self, forKey: .toelichting)) ?? []
        let r = try? c.decodeIfPresent(Rijstroken.self, forKey: .rijstroken)
        rijstrokenOpen = r?.open; rijstrokenTotaal = r?.totaal
        maxSnelheid = try? c.decodeIfPresent(Int.self, forKey: .maxSnelheid)
        hinder = try? c.decodeIfPresent(Int.self, forKey: .hinder)
        omleiding = (try? c.decodeIfPresent(Bool.self, forKey: .omleiding)) ?? false
        infoURL = (try? c.decodeIfPresent(String.self, forKey: .infoURL)).flatMap { URL(string: $0) }
        tijdvakken = (try? c.decodeIfPresent([[String]].self, forKey: .tijdvakken)) ?? []
    }

    /// Road and direction, or the street, or the kind.
    var kopTekst: String { kop ?? weg ?? titelLokaal }
    /// "Rijstrook dicht voor werkzaamheden · tussen … en …"
    var watTekst: String? {
        let w = [kop != nil || weg != nil ? titelLokaal : nil, traject, plaats].compactMap { $0?.isEmpty == false ? $0 : nil }
        return w.isEmpty ? nil : w.joined(separator: " · ")
    }
    /// "1 van 2 rijstroken open · max. 70 km/u · omleiding ingesteld"
    var detailTekst: String? {
        var d: [String] = []
        if let f = fileTekst { d.append(f) }
        if let o = rijstrokenOpen, let t = rijstrokenTotaal, o < t { d.append(Lf("%lld van %lld rijstroken open", o, t)) }
        if let m = maxSnelheid { d.append(Lf("max. %lld km/u", m)) }
        if omleiding && soort == .afsluiting { d.append(L("omleiding ingesteld")) }
        return d.isEmpty ? nil : d.joined(separator: " · ")
    }
    var hinderTekst: String? { switch hinder { case 1: L("weinig hinder"); case 2: L("hinder"); case 3: L("veel hinder"); default: nil } }
    /// "do 12 nov 20:00–05:00"
    var tijdvakTeksten: [String] {
        tijdvakken.compactMap { p in
            guard p.count == 2, let a = Self.datum(p[0]), let e = Self.datum(p[1]) else { return nil }
            return "\(a.formatted(.dateTime.weekday(.abbreviated).day().month(.abbreviated))) \(a.formatted(date: .omitted, time: .shortened))–\(e.formatted(date: .omitted, time: .shortened))"
        }
    }
    private static func datum(_ s: String) -> Date? { ISO8601DateFormatter.verkeer.date(from: s) ?? ISO8601DateFormatter().date(from: s) }

    var coordinate: CLLocationCoordinate2D { CLLocationCoordinate2D(latitude: lat, longitude: lon) }
    /// The route as coordinates (the server sends [lon, lat]).
    var route: [CLLocationCoordinate2D] {
        (lijn ?? []).compactMap { $0.count == 2 ? CLLocationCoordinate2D(latitude: $0[1], longitude: $0[0]) : nil }
    }
    /// The titles the server sends (Dutch); listed here so they get an English translation in Localizable.xcstrings.
    static let titels = ["Ongeval", "Ongeval, weg afgesloten", "Ongeval, rijstrook dicht", "Pijlwagen bij werk of incident",
                         "Voertuig met pech", "Stilstaand voertuig", "Lading of vloeistof op de weg", "Obstakel op de weg",
                         "Stilstaand verkeer", "File", "Langzaam rijdend verkeer", "Werkzaamheden", "Afgesloten voor evenement",
                         "Afgesloten voor werkzaamheden", "Weg afgesloten", "Voertuig met pech, rijstrook dicht", "Rijstrook dicht",
                         "Rijstrook dicht voor werkzaamheden", "Versmalde rijstroken", "Rijstroken verlegd", "Afrit dicht", "Oprit dicht", "Verbindingsweg dicht"]
    var titelLokaal: String { L(titel) }
    var startDatum: Date? { start.flatMap { ISO8601DateFormatter.verkeer.date(from: $0) ?? ISO8601DateFormatter().date(from: $0) } }
    var eindDatum: Date? { einde.flatMap { ISO8601DateFormatter.verkeer.date(from: $0) ?? ISO8601DateFormatter().date(from: $0) } }
    /// "2,4 km · +4 min"
    var fileTekst: String? {
        var d: [String] = []
        if let l = lengteKm { d.append("\(l.formatted(.number.precision(.fractionLength(0...1)))) km") }
        if let v = vertragingMin, v > 0 { d.append(Lf("+%lld min", v)) }
        return d.isEmpty ? nil : d.joined(separator: " · ")
    }
}

extension VerkeerItem.Soort {
    /// Accidents and breakdowns are a spot: a pin. Closures, jams and roadworks: a round icon on the stretch.
    var isMarker: Bool { self == .ongeval || self == .pech }
    var label: String {
        switch self {
        case .ongeval: return L("Ongeval")
        case .afsluiting: return L("Afsluiting")
        case .file: return L("File")
        case .pech: return L("Pech of obstakel")
        case .werk: return L("Werkzaamheden")
        }
    }
    var kleur: Color {
        switch self {
        case .ongeval: return Color(hex: 0xE3001B)
        case .afsluiting: return Color(hex: 0xC4001A)
        case .file: return Color(hex: 0xB0002E)
        case .pech: return Color(hex: 0xF08C00)
        case .werk: return Color(hex: 0xF5B400)
        }
    }
    var symbool: String {
        switch self {
        case .ongeval: return "car.side.rear.and.collision.and.car.side.front"
        case .afsluiting: return "minus"
        case .file: return "car.2.fill"
        case .pech: return "exclamationmark"
        case .werk: return "hammer.fill"
        }
    }
}

extension ISO8601DateFormatter {
    static let verkeer: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()
}

struct Flitser: Decodable, Identifiable, Hashable, Sendable {
    let id: String
    let lat: Double
    let lon: Double
    let max: Int?
    let soort: String?
    var coordinate: CLLocationCoordinate2D { CLLocationCoordinate2D(latitude: lat, longitude: lon) }
    var isTraject: Bool { soort == "trajectcontrole" }
}

struct VerkeerResponse: Decodable, Sendable {
    let items: [VerkeerItem]
    let flitsers: [Flitser]
    let bijgewerkt: String?
    enum CodingKeys: String, CodingKey { case items, flitsers, bijgewerkt }
    init(from d: Decoder) throws {
        let c = try d.container(keyedBy: CodingKeys.self)
        items = (try? c.decode([VerkeerItem].self, forKey: .items)) ?? []
        flitsers = (try? c.decode([Flitser].self, forKey: .flitsers)) ?? []
        bijgewerkt = try? c.decodeIfPresent(String.self, forKey: .bijgewerkt)
    }
}

/// Loaded while the map shows the traffic or speed camera layer, every minute.
@MainActor
@Observable
final class VerkeerStore {
    static let shared = VerkeerStore()
    private(set) var items: [VerkeerItem] = []
    private(set) var flitsers: [Flitser] = []
    private(set) var bijgewerkt: Date?

    func vernieuw() async {
        guard let r = try? await P2000API.shared.getJSON("/v1/verkeer", as: VerkeerResponse.self) else { return }
        items = r.items
        flitsers = r.flitsers
        bijgewerkt = r.bijgewerkt.flatMap { ISO8601DateFormatter.verkeer.date(from: $0) ?? ISO8601DateFormatter().date(from: $0) }
    }
}

/// Map icon: a pin for a spot (accident, breakdown, speed camera: the point is the place), a round icon for things
/// along a stretch of road (closure, jam, roadworks: the line on the map shows the stretch). Own drawings, in SharedAssets.
struct VerkeerIcon: View {
    let soort: VerkeerItem.Soort
    var size: CGFloat = 24

    var body: some View {
        Image("verkeer_\(soort.rawValue)").resizable().scaledToFit()
            .frame(width: size, height: soort.isMarker ? size * 1.25 : size)
            .shadow(color: .black.opacity(0.3), radius: 2, y: 1)
    }
}

struct FlitserIcon: View {
    let flitser: Flitser
    var size: CGFloat = 22
    var body: some View {
        Image("verkeer_flitser").resizable().scaledToFit()
            .frame(width: size, height: size * 1.25)
            .shadow(color: .black.opacity(0.3), radius: 2, y: 1)
    }
}

/// Details of a traffic item (sheet on the map): road and direction, stretch, lanes, speed, cause, comments, time slots.
struct VerkeerDetail: View {
    let item: VerkeerItem
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 12) {
                VerkeerIcon(soort: item.soort, size: 40)
                VStack(alignment: .leading, spacing: 2) {
                    Text(item.soort.label.uppercased()).font(AppFont.body(11, .bold)).foregroundStyle(item.soort.kleur)
                    Text(item.kopTekst).font(AppFont.heading(20)).fixedSize(horizontal: false, vertical: true)
                }
            }
            if let w = item.watTekst { Text(w).font(AppFont.body(16)).fixedSize(horizontal: false, vertical: true) }
            if let d = item.detailTekst { Text(d).font(AppFont.body(16, .semibold)).foregroundStyle(item.soort.kleur).fixedSize(horizontal: false, vertical: true) }
            ForEach([item.oorzaak].compactMap { $0 } + item.toelichting, id: \.self) { t in
                Text(t).font(AppFont.body(15)).fixedSize(horizontal: false, vertical: true)
            }
            if !item.tijdvakTeksten.isEmpty {
                Label(item.tijdvakTeksten.joined(separator: " · "), systemImage: "calendar.badge.clock").font(AppFont.body(14))
            }
            VStack(alignment: .leading, spacing: 4) {
                if let s = item.startDatum { Text(Lf("Sinds %@", s.formatted(.dateTime.day().month(.abbreviated).hour().minute()))) }
                if let e = item.eindDatum { Text(Lf("Tot %@", e.formatted(.dateTime.day().month(.abbreviated).hour().minute()))) }
                if let h = item.hinderTekst { Text(h) }
                if let b = item.bron { Text(Lf("Bron: %@ via NDW", b)) }
            }
            .font(AppFont.body(13)).foregroundStyle(.secondary)
            if let u = item.infoURL { Link(L("Meer informatie"), destination: u).font(AppFont.body(14, .semibold)) }
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}
