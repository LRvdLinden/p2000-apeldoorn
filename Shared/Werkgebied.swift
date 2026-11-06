import Foundation
import CoreLocation

/// The A-Alerts working area: the municipality of Apeldoorn plus its 26 places (Teuge included).
/// Data lives in Werkgebied.json (same file as the Worker uses), built by tools/geodata.
///
/// Matching a P2000 alert to places:
/// - Official woonplaatsen match on the town name the dispatcher sends ("Beekbergen", "Wenum Wiesel").
/// - Buurtschappen are never sent as a town name (an alert in Assel arrives as "Hoog Soeren" or "Apeldoorn"),
///   so they match on the coordinate: inside the CBS neighbourhood area or within a small radius of the hamlet.
///   That only works for alerts with a street; without one the coordinate is just the town centre.
struct Werkgebied: Decodable, Sendable {
    struct Gemeente: Decodable, Sendable {
        let naam: String
        let code: String
        let bron: String
        /// Rings of [lon, lat].
        let gebied: [[[Double]]]
    }

    struct Plaats: Decodable, Identifiable, Hashable, Sendable {
        let naam: String
        /// "plaats" (places and villages) or "buurtschap" (hamlets), as in Léon's list.
        let groep: String
        /// Official BAG woonplaats: P2000 sends this name as the town.
        let woonplaats: Bool
        let lat: Double
        let lon: Double
        let bron: String
        let straalKm: Double?
        let gebied: [[[Double]]]?
        let aliassen: [String]?
        var id: String { naam }

        var keys: Set<String> { Set(([naam] + (aliassen ?? [])).map(\.plaatsKey)) }
        var coordinate: CLLocationCoordinate2D { .init(latitude: lat, longitude: lon) }

        /// Whether a coordinate lies in this place's area (buurtschappen and Teuge).
        func contains(lat: Double, lon: Double) -> Bool {
            if let gebied, gebied.contains(where: { Werkgebied.ring($0, contains: lat, lon) }) { return true }
            if let straalKm { return Werkgebied.distanceKm(lat, lon, self.lat, self.lon) <= straalKm }
            return false
        }
    }

    let versie: Int
    let gemeente: Gemeente
    let plaatsen: [Plaats]

    static let shared: Werkgebied = {
        guard let url = Bundle.main.url(forResource: "Werkgebied", withExtension: "json"),
              let data = try? Data(contentsOf: url),
              let w = try? JSONDecoder().decode(Werkgebied.self, from: data) else {
            // Fallback (should not happen): the 13 places of P2000 Apeldoorn 1.0.
            let names = ["Apeldoorn", "Beekbergen", "Beemte-Broekland", "Hoenderloo", "Hoog Soeren", "Klarenbeek",
                         "Lieren", "Loenen", "Radio Kootwijk", "Teuge", "Uddel", "Ugchelen", "Wenum-Wiesel"]
            return Werkgebied(versie: 0, gemeente: .init(naam: "Apeldoorn", code: "GM0200", bron: "", gebied: []),
                              plaatsen: names.map { .init(naam: $0, groep: "plaats", woonplaats: true, lat: 52.2112, lon: 5.9699,
                                                          bron: "", straalKm: nil, gebied: nil, aliassen: nil) })
        }
        return w
    }()

    var namen: [String] { plaatsen.map(\.naam) }
    func plaats(_ naam: String) -> Plaats? { plaatsen.first { $0.keys.contains(naam.plaatsKey) } }

    /// All places an alert belongs to: its town, plus any hamlet whose area holds the alert's street location.
    func plaatsen(for m: Melding) -> Set<String> {
        var result: Set<String> = []
        let stad = (m.stad ?? "").plaatsKey
        if let p = plaatsen.first(where: { $0.woonplaats && $0.keys.contains(stad) }) { result.insert(p.naam) }
        if m.hasStreet, let lat = m.lat, let lon = m.lon {
            for p in plaatsen where !p.woonplaats || p.gebied != nil || p.straalKm != nil {
                if p.contains(lat: lat, lon: lon) { result.insert(p.naam) }
            }
        }
        return result
    }

    /// True when the alert belongs to at least one of the chosen places (empty choice = all places).
    func matches(_ m: Melding, selected: Set<String>) -> Bool {
        guard !selected.isEmpty else { return true }
        let chosen = Set(selected.map(\.plaatsKey))
        let own = plaatsen(for: m)
        if own.contains(where: { chosen.contains($0.plaatsKey) }) { return true }
        // An older choice that is not (yet) in the list: compare the raw town name, as in 1.0.
        return chosen.contains((m.stad ?? "").plaatsKey)
    }

    /// Inside the municipality, or in one of the places around it (Teuge, De Jonas). Used for warnings and helicopters.
    func contains(lat: Double, lon: Double, toleranceKm: Double = 0.5) -> Bool {
        if gemeente.gebied.contains(where: { Self.ring($0, contains: lat, lon) }) { return true }
        if plaatsen.contains(where: { $0.contains(lat: lat, lon: lon) }) { return true }
        // The boundary is simplified: also accept points just outside it.
        return gemeente.gebied.contains { Self.distanceToRingKm($0, lat, lon) <= toleranceKm }
    }

    /// Shortest distance from a point to the edge of a ring (flat approximation, fine at this scale).
    static func distanceToRingKm(_ ring: [[Double]], _ lat: Double, _ lon: Double) -> Double {
        let kx = 111.32 * cos(lat * .pi / 180), ky = 110.57
        var best = Double.infinity
        var j = ring.count - 1
        for i in ring.indices {
            let ax = (ring[j][0] - lon) * kx, ay = (ring[j][1] - lat) * ky
            let bx = (ring[i][0] - lon) * kx, by = (ring[i][1] - lat) * ky
            let dx = bx - ax, dy = by - ay
            let len = dx * dx + dy * dy
            let t = len > 0 ? max(0, min(1, -(ax * dx + ay * dy) / len)) : 0
            let px = ax + t * dx, py = ay + t * dy
            best = min(best, (px * px + py * py).squareRoot())
            j = i
        }
        return best
    }

    // MARK: Geometry

    /// Ray casting on a ring of [lon, lat].
    static func ring(_ ring: [[Double]], contains lat: Double, _ lon: Double) -> Bool {
        var inside = false
        var j = ring.count - 1
        for i in ring.indices {
            let xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1]
            if (yi > lat) != (yj > lat), lon < (xj - xi) * (lat - yi) / (yj - yi) + xi { inside.toggle() }
            j = i
        }
        return inside
    }

    static func distanceKm(_ lat1: Double, _ lon1: Double, _ lat2: Double, _ lon2: Double) -> Double {
        let r = Double.pi / 180
        let dLat = (lat2 - lat1) * r, dLon = (lon2 - lon1) * r
        let a = sin(dLat / 2) * sin(dLat / 2) + cos(lat1 * r) * cos(lat2 * r) * sin(dLon / 2) * sin(dLon / 2)
        return 6371 * 2 * atan2(sqrt(a), sqrt(1 - a))
    }
}
