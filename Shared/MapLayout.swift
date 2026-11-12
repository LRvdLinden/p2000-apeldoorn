import Foundation
import CoreLocation

/// One alert on the map at its own spot.
struct MapPin: Identifiable {
    let melding: Melding
    let coordinate: CLLocationCoordinate2D
    var id: String { melding.guid }
}

/// Alerts without a street name (the dispatcher only sent the town). They are all geocoded to the town centre,
/// so instead of a ring of identical pins we show one marker per town with the number of alerts.
struct PlaatsCluster: Identifiable {
    let plaats: String
    let meldingen: [Melding]          // newest first
    let coordinate: CLLocationCoordinate2D
    /// True when these are several alerts at one address (not alerts without a street in one town).
    var adres = false
    var sleutel: String? = nil
    var id: String { adres ? "adres-" + (sleutel ?? plaats) : "plaats-" + plaats }
    /// The marker on top: trauma helicopter first, then police, otherwise the service with the most alerts.
    var hoofdDienst: Dienst {
        if meldingen.contains(where: { $0.dienst == .traumaheli }) { return .traumaheli }
        if meldingen.contains(where: { $0.dienst == .politie }) { return .politie }
        return Dictionary(grouping: meldingen, by: \.dienst).max { $0.value.count < $1.value.count }?.key ?? .ambulance
    }
    var diensten: [Dienst] { Dienst.selectable.filter { d in meldingen.contains { $0.dienst == d } } }
}

enum MapLayout {
    /// Splits alerts into exact pins (with a street) and one cluster per town for alerts without a street.
    /// Exact pins at the same spot become one marker with a number, like the website.
    static func build(_ list: [Melding]) -> (pins: [MapPin], clusters: [PlaatsCluster]) {
        let withCoord = list.filter(\.hasCoordinate)
        let exact = withCoord.filter(\.hasStreet)
        let loose = withCoord.filter { !$0.hasStreet }

        var pins: [MapPin] = []
        let groups = Dictionary(grouping: exact) { m in
            "\(Int(((m.lat ?? 0) * 1000).rounded())),\(Int(((m.lon ?? 0) * 1000).rounded()))"
        }
        // Several alerts at one address: one marker with the number on top (no ring of pins).
        var adressen: [PlaatsCluster] = []
        for (key, group) in groups {
            let sorted = group.sorted { $0.datum > $1.datum }
            guard sorted.count > 1, let m = sorted.first else {
                for m in sorted { pins.append(MapPin(melding: m, coordinate: CLLocationCoordinate2D(latitude: m.lat ?? 0, longitude: m.lon ?? 0))) }
                continue
            }
            let naam = [m.locatie, m.plaatsNaam].compactMap { $0 }.joined(separator: ", ")
            adressen.append(PlaatsCluster(plaats: naam, meldingen: sorted,
                                          coordinate: CLLocationCoordinate2D(latitude: m.lat ?? 0, longitude: m.lon ?? 0), adres: true, sleutel: key))
        }
        pins.sort { $0.melding.datum < $1.melding.datum } // newest on top

        let clusters = Dictionary(grouping: loose, by: \.plaatsNaam).map { plaats, items -> PlaatsCluster in
            let sorted = items.sorted { $0.datum > $1.datum }
            let lat = sorted.compactMap(\.lat).reduce(0, +) / Double(sorted.count)
            let lon = sorted.compactMap(\.lon).reduce(0, +) / Double(sorted.count)
            return PlaatsCluster(plaats: plaats, meldingen: sorted, coordinate: CLLocationCoordinate2D(latitude: lat, longitude: lon))
        }
        .sorted { $0.meldingen.count < $1.meldingen.count }
        return (pins, clusters + adressen)
    }
}
