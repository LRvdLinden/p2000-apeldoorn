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
    var id: String { "plaats-" + plaats }
    /// The service with the most alerts in this group, used for the marker colour.
    var hoofdDienst: Dienst {
        Dictionary(grouping: meldingen, by: \.dienst).max { $0.value.count < $1.value.count }?.key ?? .ambulance
    }
    var diensten: [Dienst] { Dienst.selectable.filter { d in meldingen.contains { $0.dienst == d } } }
}

enum MapLayout {
    /// Splits alerts into exact pins (with a street) and one cluster per town for alerts without a street.
    /// Exact pins at the same spot are spread in a small circle, like the website.
    static func build(_ list: [Melding]) -> (pins: [MapPin], clusters: [PlaatsCluster]) {
        let withCoord = list.filter(\.hasCoordinate)
        let exact = withCoord.filter(\.hasStreet)
        let loose = withCoord.filter { !$0.hasStreet }

        var pins: [MapPin] = []
        let groups = Dictionary(grouping: exact) { m in
            "\(Int(((m.lat ?? 0) * 1000).rounded())),\(Int(((m.lon ?? 0) * 1000).rounded()))"
        }
        for (_, group) in groups {
            let sorted = group.sorted { $0.datum < $1.datum }
            for (i, m) in sorted.enumerated() {
                var lat = m.lat ?? 0, lon = m.lon ?? 0
                if sorted.count > 1 {
                    let angle = Double(i) / Double(sorted.count) * .pi * 2
                    let r = min(0.0003 + Double(sorted.count) * 0.00004, 0.0008)
                    lat += cos(angle) * r
                    lon += sin(angle) * r / cos(lat * .pi / 180)
                }
                pins.append(MapPin(melding: m, coordinate: CLLocationCoordinate2D(latitude: lat, longitude: lon)))
            }
        }
        pins.sort { $0.melding.datum < $1.melding.datum } // newest on top

        let clusters = Dictionary(grouping: loose, by: \.plaatsNaam).map { plaats, items -> PlaatsCluster in
            let sorted = items.sorted { $0.datum > $1.datum }
            let lat = sorted.compactMap(\.lat).reduce(0, +) / Double(sorted.count)
            let lon = sorted.compactMap(\.lon).reduce(0, +) / Double(sorted.count)
            return PlaatsCluster(plaats: plaats, meldingen: sorted, coordinate: CLLocationCoordinate2D(latitude: lat, longitude: lon))
        }
        .sorted { $0.meldingen.count < $1.meldingen.count }
        return (pins, clusters)
    }
}
