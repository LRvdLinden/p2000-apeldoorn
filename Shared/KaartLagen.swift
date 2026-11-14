import SwiftUI
import CoreLocation

/// Map layers that can each be switched on or off (phase 5).
enum KaartLaag: String, CaseIterable, Identifiable {
    case p2000, nlalert, burgernet, kind, knmi, verkeer, flitsers, werkgebied, kazernes, ziekenhuizen, helikopters, buienradar, regio

    var id: String { rawValue }

    /// On by default: everything except the stations, the rain radar and the speed cameras (they make the map busy).
    static let standaard: Set<String> = Set(allCases.filter { ![.kazernes, .buienradar, .flitsers, .regio].contains($0) }.map(\.rawValue))

    var titel: String {
        switch self {
        case .p2000: return L("P2000-meldingen")
        case .nlalert: return "NL-Alert"
        case .burgernet: return "Burgernet"
        case .kind: return L("AMBER Alert en Vermist Kind Alert")
        case .knmi: return L("KNMI-waarschuwingsgebieden")
        case .verkeer: return L("Verkeer (NDW)")
        case .flitsers: return L("Flitsers (vast)")
        case .werkgebied: return L("Grens werkgebied")
        case .kazernes: return L("Kazernes en posten")
        case .ziekenhuizen: return L("Ziekenhuizen en vliegbases")
        case .helikopters: return L("Luchtvaart (live)")
        case .buienradar: return L("Buienradar (KNMI)")
        case .regio: return L("Grens veiligheidsregio")
        }
    }

    var systemImage: String {
        switch self {
        case .p2000: return "light.beacon.max.fill"
        case .nlalert: return "exclamationmark.triangle.fill"
        case .burgernet: return "megaphone.fill"
        case .kind: return "figure.child"
        case .knmi: return "cloud.sun.rain.fill"
        case .verkeer: return "car.side.fill"
        case .flitsers: return "camera.fill"
        case .werkgebied: return "skew"
        case .kazernes: return "building.2.fill"
        case .ziekenhuizen: return "cross.case.fill"
        case .helikopters: return "airplane"
        case .buienradar: return "cloud.rain.fill"
        case .regio: return "map"
        }
    }
}

/// The layers per category, as they are listed under "Kaartlagen".
enum KaartLaagGroep: String, CaseIterable, Identifiable {
    case meldingen, lucht, verkeer, posten, kaart

    var id: String { rawValue }
    var titel: String {
        switch self {
        case .meldingen: return L("Meldingen en alerts")
        case .lucht: return L("Lucht")
        case .verkeer: return L("Verkeer")
        case .posten: return L("Posten en ziekenhuizen")
        case .kaart: return L("Kaart")
        }
    }
    var lagen: [KaartLaag] {
        switch self {
        case .meldingen: return [.p2000, .nlalert, .burgernet, .kind, .knmi]
        case .lucht: return [.helikopters]
        case .verkeer: return [.verkeer, .flitsers]
        case .posten: return [.kazernes, .ziekenhuizen]
        case .kaart: return [.werkgebied, .regio, .buienradar]
        }
    }
}

extension AppSettings {
    func laag(_ l: KaartLaag) -> Bool { kaartLagen.contains(l.rawValue) }
    func setLaag(_ l: KaartLaag, _ on: Bool) {
        if on { kaartLagen.insert(l.rawValue) } else { kaartLagen.remove(l.rawValue) }
    }
}

// MARK: - Border of the safety region

/// The border of the safety region Noord- en Oost-Gelderland (CBS, via PDOK), asked once from the server.
@MainActor
@Observable
final class RegioStore {
    static let shared = RegioStore()
    private(set) var ringen: [[CLLocationCoordinate2D]] = []
    @ObservationIgnored private var bezig = false

    func laad() async {
        guard ringen.isEmpty, !bezig else { return }
        bezig = true
        defer { bezig = false }
        struct Antwoord: Decodable { let ringen: [[[Double]]] }
        guard let a = try? await P2000API.shared.getJSON("v1/veiligheidsregio", as: Antwoord.self) else { return }
        ringen = a.ringen.map { $0.compactMap { $0.count == 2 ? CLLocationCoordinate2D(latitude: $0[0], longitude: $0[1]) : nil } }
    }
}
