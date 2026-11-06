import SwiftUI

/// Map layers that can each be switched on or off (phase 5).
enum KaartLaag: String, CaseIterable, Identifiable {
    case p2000, nlalert, burgernet, knmi, werkgebied, kazernes, helikopters

    var id: String { rawValue }

    /// On by default: everything except the stations (they make the map busy).
    static let standaard: Set<String> = Set(allCases.filter { $0 != .kazernes }.map(\.rawValue))

    var titel: String {
        switch self {
        case .p2000: return L("P2000-meldingen")
        case .nlalert: return "NL-Alert"
        case .burgernet: return "Burgernet"
        case .knmi: return L("KNMI-waarschuwingsgebieden")
        case .werkgebied: return L("Grens werkgebied")
        case .kazernes: return L("Kazernes en posten")
        case .helikopters: return L("Helikopters (live)")
        }
    }

    var systemImage: String {
        switch self {
        case .p2000: return "light.beacon.max.fill"
        case .nlalert: return "exclamationmark.triangle.fill"
        case .burgernet: return "megaphone.fill"
        case .knmi: return "cloud.sun.rain.fill"
        case .werkgebied: return "skew"
        case .kazernes: return "building.2.fill"
        case .helikopters: return "helicopter.fill"
        }
    }
}

extension AppSettings {
    func laag(_ l: KaartLaag) -> Bool { kaartLagen.contains(l.rawValue) }
    func setLaag(_ l: KaartLaag, _ on: Bool) {
        if on { kaartLagen.insert(l.rawValue) } else { kaartLagen.remove(l.rawValue) }
    }
}
