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

/// Station icon, same as the web meldkamer: a white rounded square with a border in the colour of the
/// service and the service icon inside.
struct KazerneIcon: View {
    let soort: Kazerne.Soort
    var size: CGFloat = 30

    var body: some View {
        let d: Dienst = soort == .brandweer ? .brandweer : soort == .ambulance ? .ambulance : .politie
        ZStack {
            RoundedRectangle(cornerRadius: size * 0.28, style: .continuous)
                .fill(Color.white)
            Image("icon_\(d.rawValue)")
                .resizable()
                .scaledToFit()
                .frame(width: size * 0.72, height: size * 0.72)
        }
        .frame(width: size, height: size)
        .overlay(
            RoundedRectangle(cornerRadius: size * 0.28, style: .continuous).strokeBorder(d.color, lineWidth: max(2, size * 0.07))
        )
        .shadow(color: .black.opacity(0.3), radius: 3, y: 2)
        .accessibilityHidden(true)
    }
}

// MARK: - Alarmed stations with routes (detail page)

/// One alarmed (or nearest) station with its route to the alert and an estimated arrival time.
struct KazerneRoute: Identifiable {
    let kazerne: Kazerne
    /// Named in the call-out (capcode / unit names); otherwise the nearest station of that service.
    let genoemd: Bool
    let km: Double
    /// Driving time with blue lights and siren (a quarter shorter than normal), in minutes.
    let rijMinuten: Double
    let uitrukMinuten: Double
    let polyline: MKPolyline?
    let aankomst: Date
    /// Route over the road (from the A-Alerts API or Apple Maps); empty = straight line.
    var punten: [CLLocationCoordinate2D] = []
    /// Departure after the usual turnout time.
    var vertrek: Date { aankomst.addingTimeInterval(-rijMinuten * 60) }
    var id: String { kazerne.id }

    /// "Onderweg" until the estimated arrival, then "Ter plaatse".
    func terPlaatse(op nu: Date = .now) -> Bool { nu >= aankomst }

    /// Estimated phase, from the alarm time, turnout time and driving time (never a real vehicle position).
    enum Fase: Equatable { case uitrukken(seconden: Int), onderweg(seconden: Int), terPlaatse, geweest }
    func fase(op nu: Date = .now) -> Fase {
        if nu < vertrek { return .uitrukken(seconden: Int(vertrek.timeIntervalSince(nu))) }
        if nu < aankomst { return .onderweg(seconden: Int(aankomst.timeIntervalSince(nu))) }
        return nu.timeIntervalSince(aankomst) < 45 * 60 ? .terPlaatse : .geweest
    }

    /// Where the unit would roughly be by this estimate: along the route, by the share of the driving time.
    func geschattePositie(op nu: Date = .now, doel: CLLocationCoordinate2D) -> CLLocationCoordinate2D? {
        guard case .onderweg = fase(op: nu) else { return nil }
        let lijn = punten.count > 1 ? punten : [kazerne.coordinate, doel]
        let deel = min(1, max(0, nu.timeIntervalSince(vertrek) / max(1, aankomst.timeIntervalSince(vertrek))))
        let stukken = zip(lijn, lijn.dropFirst()).map { MKMapPoint($0.0).distance(to: MKMapPoint($0.1)) }
        var rest = stukken.reduce(0, +) * deel
        for (i, d) in stukken.enumerated() {
            if rest <= d, d > 0 {
                let f = rest / d, a = lijn[i], b = lijn[i + 1]
                return CLLocationCoordinate2D(latitude: a.latitude + (b.latitude - a.latitude) * f, longitude: a.longitude + (b.longitude - a.longitude) * f)
            }
            rest -= d
        }
        return lijn.last
    }

    var rijtijdTekst: String {
        rijMinuten < 1 ? L("rijtijd < 1 min") : Lf("rijtijd %lld min", Int(rijMinuten.rounded()))
    }

    var afstandTekst: String {
        km < 1 ? "\(Int((km * 1000 / 10).rounded() * 10)) m" : Lf("%@ km", km.formatted(.number.precision(.fractionLength(1))))
    }
}

extension Aanrijtijd {
    /// Usual turnout time (alarm → driving): volunteer fire crews need a few minutes, ambulances are on standby.
    static func uitrukMinuten(_ soort: Kazerne.Soort) -> Double {
        switch soort {
        case .brandweer: return 4
        case .ambulance: return 1
        case .politie: return 0
        }
    }

    @MainActor private static var routeCache: [String: [KazerneRoute]] = [:]

    /// All stations named in the alert (or, when none is named, the nearest one), with route and estimate.
    @MainActor
    static func routes(voor m: Melding) async -> [KazerneRoute] {
        if let hit = routeCache[m.guid] { return hit }
        // 1. The A-Alerts API: the same route and estimate in every app and on the website.
        if let api = await P2000API.shared.routes(guid: m.guid), !api.kazernes.isEmpty {
            let result: [KazerneRoute] = api.kazernes.compactMap { r in
                let k = Kazernes.all.first { $0.id == r.id }
                    ?? Kazerne(id: r.id, naam: r.naam, soort: Kazerne.Soort(rawValue: r.soort) ?? .brandweer, plaats: "", lat: r.lat, lon: r.lon, aliassen: nil)
                let pts = r.route.compactMap { $0.count == 2 ? CLLocationCoordinate2D(latitude: $0[0], longitude: $0[1]) : nil }
                guard let aankomst = Fmt.parseISO(r.aankomst) else { return nil }
                return KazerneRoute(kazerne: k, genoemd: r.genoemd, km: r.km, rijMinuten: r.rijMin, uitrukMinuten: r.uitrukMin,
                                    polyline: pts.count > 1 ? MKPolyline(coordinates: pts, count: pts.count) : nil, aankomst: aankomst, punten: pts)
            }
            if !result.isEmpty { routeCache[m.guid] = result; return result }
        }
        // 2. Fallback: Apple Maps on the device.
        guard m.hasStreet, m.hasCoordinate, let lat = m.lat, let lon = m.lon,
              let soort = Kazernes.soort(for: m.dienst) else { return [] }
        let kandidaten = Kazernes.all.filter { $0.soort == soort }
        let namen = m.eenheden.compactMap(\.naam).map { $0.lowercased() } + [m.fullMelding?.lowercased() ?? ""]
        var gekozen = kandidaten.filter { k in
            (k.aliassen ?? []).contains { alias in
                let pattern = "\\b" + NSRegularExpression.escapedPattern(for: alias.lowercased()) + "\\b"
                return namen.contains { $0.range(of: pattern, options: .regularExpression) != nil }
            }
        }
        let genoemd = !gekozen.isEmpty
        if gekozen.isEmpty, let dichtst = kandidaten.min(by: {
            Werkgebied.distanceKm($0.lat, $0.lon, lat, lon) < Werkgebied.distanceKm($1.lat, $1.lon, lat, lon)
        }) { gekozen = [dichtst] }
        gekozen = Array(gekozen.filter { Werkgebied.distanceKm($0.lat, $0.lon, lat, lon) < 40 }.prefix(5))

        let doel = CLLocationCoordinate2D(latitude: lat, longitude: lon)
        // Lights and siren only for A0/A1/P1 (A2/P2 drive with the traffic), as the server does.
        let spoed = m.isUrgent
        var result: [KazerneRoute] = []
        for k in gekozen {
            var km = Werkgebied.distanceKm(k.lat, k.lon, lat, lon) * 1.3
            var rij = km / 50 * 60
            var line: MKPolyline?
            #if os(iOS) || os(macOS)
            let request = MKDirections.Request()
            request.source = MKMapItem(placemark: MKPlacemark(coordinate: k.coordinate))
            request.destination = MKMapItem(placemark: MKPlacemark(coordinate: doel))
            request.transportType = .automobile
            if let route = try? await MKDirections(request: request).calculate().routes.first {
                km = route.distance / 1000
                rij = route.expectedTravelTime / 60
                line = route.polyline
            }
            #endif
            if spoed { rij *= 0.75 }
            let uitruk = uitrukMinuten(k.soort)
            var pts: [CLLocationCoordinate2D] = []
            if let line { pts = Array(UnsafeBufferPointer(start: line.points(), count: line.pointCount)).map(\.coordinate) }
            result.append(KazerneRoute(kazerne: k, genoemd: genoemd, km: km, rijMinuten: rij, uitrukMinuten: uitruk,
                                       polyline: line, aankomst: m.datum.addingTimeInterval((uitruk + rij) * 60), punten: pts))
        }
        result.sort { $0.aankomst < $1.aankomst }
        routeCache[m.guid] = result
        return result
    }
}


/// GET /v1/meldingen/:guid/routes (computed once by the server with Apple Maps, the same for every app).
struct RoutesAntwoord: Decodable, Sendable {
    struct Route: Decodable, Sendable {
        let id: String, naam: String, soort: String
        let lat: Double, lon: Double
        let genoemd: Bool
        let km: Double
        let rijMin: Double, uitrukMin: Double
        let aankomst: String
        let route: [[Double]]
        enum CodingKeys: String, CodingKey { case id, naam, soort, lat, lon, genoemd, km, aankomst, route, rijMin = "rij_min", uitrukMin = "uitruk_min" }
    }
    let kazernes: [Route]
}
