import SwiftUI
import MapKit

/// Fire stations, ambulance posts and police stations in and around the working area (phase 8).
/// Data: OpenStreetMap (© OpenStreetMap contributors, ODbL), checked by hand; see tools/geodata/kazernes.json.
struct Kazerne: Codable, Identifiable, Hashable {
    enum Soort: String, Codable, CaseIterable { case brandweer, ambulance, politie }
    let id: String
    let naam: String
    let soort: Soort
    let plaats: String
    let lat: Double
    let lon: Double
    /// Words that identify this station in unit names of an alert (e.g. "Beekbergen", "Apeldoorn-Noord").
    var aliassen: [String]?

    var coordinate: CLLocationCoordinate2D { CLLocationCoordinate2D(latitude: lat, longitude: lon) }
    var dienst: Dienst {
        switch soort {
        case .brandweer: return .brandweer
        case .ambulance: return .ambulance
        case .politie: return .politie
        }
    }
    var soortLabel: String {
        switch soort {
        case .brandweer: return L("Brandweerkazerne")
        case .ambulance: return L("Ambulancepost")
        case .politie: return L("Politiebureau")
        }
    }
}

enum Kazernes {
    static let all: [Kazerne] = {
        guard let url = Bundle.main.url(forResource: "Kazernes", withExtension: "json"),
              let data = try? Data(contentsOf: url),
              let list = try? JSONDecoder().decode([Kazerne].self, from: data) else { return [] }
        return list
    }()

    static func soort(for d: Dienst) -> Kazerne.Soort? {
        switch d {
        case .brandweer: return .brandweer
        case .ambulance: return .ambulance
        case .politie: return .politie
        default: return nil
        }
    }
}

/// Estimated arrival time for an alert: driving time over the road from the station. Always an estimate.
enum Aanrijtijd {
    struct Schatting: Hashable {
        let kazerne: Kazerne
        let minuten: Int
        let km: Double
        let viaRoute: Bool
        /// Why this station: named in the alert, or simply the nearest.
        let herkomst: String
    }

    @MainActor private static var cache: [String: Schatting] = [:]

    @MainActor
    static func schat(voor m: Melding) async -> Schatting? {
        if let hit = cache[m.guid] { return hit }
        guard m.hasStreet, m.hasCoordinate, let lat = m.lat, let lon = m.lon,
              let soort = Kazernes.soort(for: m.dienst) else { return nil }
        let kandidaten = Kazernes.all.filter { $0.soort == soort }
        guard !kandidaten.isEmpty else { return nil }

        // A station named in the units of the alert wins; otherwise the nearest one.
        let namen = m.eenheden.compactMap(\.naam).map { $0.lowercased() } + [m.fullMelding?.lowercased() ?? ""]
        let genoemd = kandidaten.first { k in
            (k.aliassen ?? []).contains { alias in
                let pattern = "\\b" + NSRegularExpression.escapedPattern(for: alias.lowercased()) + "\\b"
                return namen.contains { $0.range(of: pattern, options: .regularExpression) != nil }
            }
        }
        let kazerne = genoemd ?? kandidaten.min {
            Werkgebied.distanceKm($0.lat, $0.lon, lat, lon) < Werkgebied.distanceKm($1.lat, $1.lon, lat, lon)
        }!
        let herkomst = genoemd != nil ? L("Genoemd in de oproep") : L("Dichtstbijzijnde volgens de kaart")
        let rechtKm = Werkgebied.distanceKm(kazerne.lat, kazerne.lon, lat, lon)
        guard rechtKm < 40 else { return nil }

        var result: Schatting
        #if os(iOS) || os(macOS)
        let request = MKDirections.Request()
        request.source = MKMapItem(placemark: MKPlacemark(coordinate: kazerne.coordinate))
        request.destination = MKMapItem(placemark: MKPlacemark(coordinate: CLLocationCoordinate2D(latitude: lat, longitude: lon)))
        request.transportType = .automobile
        if let route = try? await MKDirections(request: request).calculate().routes.first {
            result = Schatting(kazerne: kazerne, minuten: max(1, Int((route.expectedTravelTime / 60).rounded())),
                               km: route.distance / 1000, viaRoute: true, herkomst: herkomst)
        } else {
            result = fallback(kazerne, rechtKm, herkomst)
        }
        #else
        result = fallback(kazerne, rechtKm, herkomst)
        #endif
        cache[m.guid] = result
        return result
    }

    /// Without a route: 1.3 × the straight line at an average of 50 km/h.
    private static func fallback(_ k: Kazerne, _ rechtKm: Double, _ herkomst: String) -> Schatting {
        let km = rechtKm * 1.3
        return Schatting(kazerne: k, minuten: max(1, Int((km / 50 * 60).rounded())), km: km, viaRoute: false, herkomst: herkomst)
    }
}

/// Round station icon in the colour of the service, with a building glyph.
struct KazerneIcon: View {
    let soort: Kazerne.Soort
    var size: CGFloat = 30

    var body: some View {
        let d: Dienst = soort == .brandweer ? .brandweer : soort == .ambulance ? .ambulance : .politie
        ZStack {
            RoundedRectangle(cornerRadius: size * 0.28, style: .continuous)
                .fill(d.color)
            Image(systemName: soort == .brandweer ? "flame.fill" : soort == .ambulance ? "cross.fill" : "shield.lefthalf.filled")
                .font(.system(size: size * 0.46, weight: .bold))
                .foregroundStyle(soort == .ambulance ? Color.black : Color.white)
        }
        .frame(width: size, height: size)
        .overlay(
            RoundedRectangle(cornerRadius: size * 0.28, style: .continuous).strokeBorder(.white, lineWidth: max(1.5, size * 0.06))
        )
        .shadow(color: .black.opacity(0.25), radius: 2, y: 1)
        .accessibilityHidden(true)
    }
}
