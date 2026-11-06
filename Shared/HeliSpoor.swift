import SwiftUI
import Observation
import CoreLocation

// Route trail, flight history and smooth movement of the helicopters (GET /v1/helikopters/<id>/spoor and /vluchten).
// The Worker stores the adsb.lol positions (ODbL) itself, 3 days long.

struct HeliSpoorPunt: Decodable, Hashable, Sendable {
    let t: Date
    let lat: Double
    let lon: Double
    let hoogteFt: Double?
    let grond: Bool

    enum CodingKeys: String, CodingKey { case t, lat, lon, grond, hoogteFt = "hoogte_ft" }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        t = Fmt.parseISO((try? c.decode(String.self, forKey: .t)) ?? "") ?? .now
        lat = try c.decode(Double.self, forKey: .lat)
        lon = try c.decode(Double.self, forKey: .lon)
        hoogteFt = try? c.decodeIfPresent(Double.self, forKey: .hoogteFt)
        grond = (try? c.decodeIfPresent(Bool.self, forKey: .grond)) ?? false
    }
    var coordinate: CLLocationCoordinate2D { CLLocationCoordinate2D(latitude: lat, longitude: lon) }
}

struct HeliVlucht: Decodable, Hashable, Identifiable, Sendable {
    let start: Date
    let einde: Date?
    let onderweg: Bool
    let duurMin: Int
    let afstandKm: Double
    let maxHoogteFt: Double
    var id: Date { start }

    enum CodingKeys: String, CodingKey {
        case start, einde, onderweg
        case duurMin = "duur_min", afstandKm = "afstand_km", maxHoogteFt = "max_hoogte_ft"
    }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        start = Fmt.parseISO((try? c.decode(String.self, forKey: .start)) ?? "") ?? .now
        einde = (try? c.decodeIfPresent(String.self, forKey: .einde)).flatMap { $0.flatMap(Fmt.parseISO) }
        onderweg = (try? c.decode(Bool.self, forKey: .onderweg)) ?? false
        duurMin = (try? c.decode(Int.self, forKey: .duurMin)) ?? 0
        afstandKm = (try? c.decode(Double.self, forKey: .afstandKm)) ?? 0
        maxHoogteFt = (try? c.decode(Double.self, forKey: .maxHoogteFt)) ?? 0
    }
}

private struct SpoorResponse: Decodable { let punten: [HeliSpoorPunt] }
private struct VluchtenResponse: Decodable { let vluchten: [HeliVlucht] }

/// How much of the trail to show: the current (or last) flight, the last 30 minutes, or today.
enum SpoorBereik: String, CaseIterable, Identifiable, Sendable {
    case vlucht, kort, vandaag
    var id: String { rawValue }
    var label: String {
        switch self {
        case .vlucht: L("Deze vlucht")
        case .kort: L("30 min")
        case .vandaag: L("Vandaag")
        }
    }
}

extension P2000API {
    func heliSpoor(id: String, bereik: SpoorBereik) async throws -> [HeliSpoorPunt] {
        try await getJSON("/v1/helikopters/\(id)/spoor", query: ["scope": bereik.rawValue], as: SpoorResponse.self).punten
    }
    func heliVluchten(id: String) async throws -> [HeliVlucht] {
        try await getJSON("/v1/helikopters/\(id)/vluchten", query: ["days": "2"], as: VluchtenResponse.self).vluchten
    }
}

extension Helikopter {
    /// Dead reckoning: where the helicopter is now, from its last position, speed and heading (at most 90 s ahead,
    /// never on the ground). Makes the marker move smoothly between two updates.
    func geschat(op moment: Date = .now) -> CLLocationCoordinate2D {
        guard !opGrond, let kt = snelheidKt, kt > 20, let k = koers else { return coordinate }
        let dt = min(max(moment.timeIntervalSince(gezien), 0), 90)
        let km = kt * 1.852 * dt / 3600
        let rad = k * .pi / 180
        let dLat = km * cos(rad) / 110.574
        let dLon = km * sin(rad) / (111.320 * cos(lat * .pi / 180))
        return CLLocationCoordinate2D(latitude: lat + dLat, longitude: lon + dLon)
    }
}

/// Trail and flights of one selected helicopter, refreshed every 20 seconds while it is shown.
@MainActor
@Observable
final class HeliSpoorStore {
    private(set) var punten: [HeliSpoorPunt] = []
    private(set) var vluchten: [HeliVlucht] = []
    private(set) var heliID: String?
    var bereik: SpoorBereik = .vlucht {
        didSet { if oldValue != bereik { Task { await load() } } }
    }
    @ObservationIgnored private var task: Task<Void, Never>?

    func volg(_ id: String?) {
        guard id != heliID else { return }
        heliID = id
        punten = []; vluchten = []
        task?.cancel()
        guard id != nil else { return }
        task = Task { [weak self] in
            while !Task.isCancelled {
                await self?.load()
                try? await Task.sleep(for: .seconds(20))
            }
        }
    }

    func load() async {
        guard let id = heliID else { return }
        async let p = try? P2000API.shared.heliSpoor(id: id, bereik: bereik)
        async let v = try? P2000API.shared.heliVluchten(id: id)
        let (pp, vv) = await (p, v)
        guard id == heliID else { return }
        if let pp { punten = pp }
        if let vv { vluchten = vv }
    }

    /// Coordinates for the map: thinned out to at most ~400 points, plus the live (estimated) position at the end.
    func coordinates(live: CLLocationCoordinate2D?) -> [CLLocationCoordinate2D] {
        let step = max(1, punten.count / 400)
        var out = stride(from: 0, to: punten.count, by: step).map { punten[$0].coordinate }
        if let last = punten.last?.coordinate, out.last.map({ $0.latitude != last.latitude || $0.longitude != last.longitude }) ?? false { out.append(last) }
        if let live { out.append(live) }
        return out
    }
}

/// The last flights of a helicopter (take-off, landing, duration, distance).
struct HeliVluchtenLijst: View {
    let vluchten: [HeliVlucht]
    var aantal = 4

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(L("Vluchten")).font(AppFont.body(12, .semibold, relativeTo: .caption)).foregroundStyle(.secondary)
            if vluchten.isEmpty {
                Text(L("Nog geen vluchten opgeslagen.")).font(AppFont.body(12, .regular, relativeTo: .caption)).foregroundStyle(.secondary)
            }
            ForEach(vluchten.prefix(aantal)) { v in
                HStack(spacing: 8) {
                    Image(systemName: v.onderweg ? "airplane.departure" : "airplane.arrival")
                        .foregroundStyle(v.onderweg ? Color.green : Color.secondary)
                        .frame(width: 18)
                    Text(tijden(v)).font(AppFont.body(13, .semibold, relativeTo: .footnote)).monospacedDigit()
                    Spacer()
                    Text("\(v.duurMin) min · \(v.afstandKm.formatted(.number.precision(.fractionLength(0)))) km")
                        .font(AppFont.body(12, .regular, relativeTo: .caption)).foregroundStyle(.secondary).monospacedDigit()
                }
            }
        }
    }

    private func tijden(_ v: HeliVlucht) -> String {
        let f = Date.FormatStyle(date: Calendar.current.isDateInToday(v.start) ? .omitted : .abbreviated, time: .shortened)
        let start = v.start.formatted(f)
        if v.onderweg { return Lf("%@ – nog in de lucht", start) }
        return "\(start) – \(v.einde?.formatted(date: .omitted, time: .shortened) ?? "?")"
    }
}

/// Trails of all helicopters in the air (last 30 minutes), for the overview maps (Apple TV control room).
@MainActor
@Observable
final class HeliSporen {
    private(set) var lijnen: [String: [CLLocationCoordinate2D]] = [:]

    func refresh(_ helis: [Helikopter]) async {
        var out: [String: [CLLocationCoordinate2D]] = [:]
        for h in helis.filter({ !$0.opGrond }).prefix(6) {
            if let p = try? await P2000API.shared.heliSpoor(id: h.id, bereik: .kort) {
                out[h.id] = p.map(\.coordinate)
            }
        }
        lijnen = out
    }

    func lijn(_ h: Helikopter, nu: Date) -> [CLLocationCoordinate2D] {
        guard let l = lijnen[h.id], !l.isEmpty else { return [] }
        return l + [h.geschat(op: nu)]
    }
}
