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

    enum CodingKeys: String, CodingKey {
        case id, soort, titel, opmerking, bron, start, einde, lat, lon, lijn, weg, plaats
        case vertragingMin = "vertraging_min", lengteKm = "lengte_km"
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
    }

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
                         "Rijstrook dicht voor werkzaamheden", "Versmalde rijstroken", "Rijstroken verlegd"]
    var titelLokaal: String { L(titel) }
    /// "Anklaarseweg, Apeldoorn"
    var waar: String? {
        let w = [weg, plaats].compactMap { $0?.isEmpty == false ? $0 : nil }
        return w.isEmpty ? nil : w.joined(separator: ", ")
    }
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

/// Map icon in the style of the traffic apps: a coloured rounded square with a white symbol; a closure is a red circle
/// with a white bar (no entry), a speed camera a dark square with a camera.
struct VerkeerIcon: View {
    let soort: VerkeerItem.Soort
    var size: CGFloat = 24

    var body: some View {
        ZStack {
            if soort == .afsluiting {
                Circle().fill(Color.white)
                Circle().fill(soort.kleur).padding(size * 0.08)
                RoundedRectangle(cornerRadius: size * 0.06).fill(Color.white).frame(width: size * 0.56, height: size * 0.16)
            } else {
                RoundedRectangle(cornerRadius: size * 0.26, style: .continuous).fill(Color.white)
                RoundedRectangle(cornerRadius: size * 0.2, style: .continuous).fill(soort.kleur).padding(size * 0.08)
                Image(systemName: soort.symbool)
                    .font(.system(size: size * (soort == .ongeval ? 0.36 : 0.46), weight: .bold))
                    .foregroundStyle(soort == .werk ? Color(hex: 0x1D1D1F) : .white)
            }
        }
        .frame(width: size, height: size)
        .shadow(color: .black.opacity(0.25), radius: 2, y: 1)
    }
}

struct FlitserIcon: View {
    let flitser: Flitser
    var size: CGFloat = 22
    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: size * 0.26, style: .continuous).fill(Color.white)
            RoundedRectangle(cornerRadius: size * 0.2, style: .continuous).fill(Color(hex: 0x1D1D1F)).padding(size * 0.08)
            Image(systemName: flitser.isTraject ? "point.topleft.down.to.point.bottomright.curvepath.fill" : "camera.fill")
                .font(.system(size: size * 0.42, weight: .bold)).foregroundStyle(.white)
        }
        .frame(width: size, height: size)
        .shadow(color: .black.opacity(0.25), radius: 2, y: 1)
    }
}

/// Details of a traffic item (sheet on the map).
struct VerkeerDetail: View {
    let item: VerkeerItem
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 12) {
                VerkeerIcon(soort: item.soort, size: 40)
                VStack(alignment: .leading, spacing: 2) {
                    Text(item.soort.label.uppercased()).font(AppFont.body(11, .bold)).foregroundStyle(item.soort.kleur)
                    Text(item.titelLokaal).font(AppFont.heading(20)).fixedSize(horizontal: false, vertical: true)
                }
            }
            if let w = item.waar { Label(w, systemImage: "road.lanes").font(AppFont.body(16)) }
            if let f = item.fileTekst { Label(f, systemImage: "clock").font(AppFont.body(16, .semibold)).foregroundStyle(item.soort.kleur) }
            if let o = item.opmerking, !o.isEmpty { Text(o).font(AppFont.body(16)).fixedSize(horizontal: false, vertical: true) }
            VStack(alignment: .leading, spacing: 4) {
                if let s = item.startDatum { Text(Lf("Sinds %@", s.formatted(.dateTime.day().month(.abbreviated).hour().minute()))) }
                if let e = item.eindDatum { Text(Lf("Tot %@", e.formatted(.dateTime.day().month(.abbreviated).hour().minute()))) }
                if let b = item.bron { Text(Lf("Bron: %@ via NDW", b)) }
            }
            .font(AppFont.body(13)).foregroundStyle(.secondary)
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}
