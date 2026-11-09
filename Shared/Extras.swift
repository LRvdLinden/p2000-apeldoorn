import SwiftUI
import Observation
import CoreLocation

// A-Alerts extras (build 53): helicopter zones, display settings for the helicopter map, large incidents,
// rain radar and "Klopt deze melding niet?". Shared by all targets, so no UIKit here.

/// A zone for helicopter notifications: a push when a helicopter takes off, lands or flies into it.
struct HeliZone: Codable, Identifiable, Hashable, Sendable {
    static let maximum = 5
    var id: String = UUID().uuidString
    var naam: String
    var lat: Double
    var lon: Double
    /// Radius in km (1–25).
    var km: Double = 5

    var coordinate: CLLocationCoordinate2D { CLLocationCoordinate2D(latitude: lat, longitude: lon) }
}

/// Display choices for helicopters that the shared (Sendable) model reads. Set by AppSettings.
enum HeliWeergave {
    nonisolated(unsafe) static var kleurPerToestel = false
    nonisolated(unsafe) static var luchtvaart = false

    /// Fixed colour per helicopter (same on all platforms and the website).
    static let palet: [String: UInt32] = [
        "lifeliner1": 0xE11D48, "lifeliner2": 0xF59E0B, "lifeliner3": 0x16A34A, "lifeliner4": 0x7C3AED,
        "lifeliner5": 0x0891B2,
    ]
    static func kleur(id: String, soort: String) -> Color? {
        guard kleurPerToestel else { return nil }
        if let hex = palet[id] { return Color(hex: hex) }
        // Police helicopters: shades of blue by number.
        let n = Int(id.filter(\.isNumber)) ?? 0
        let blauw: [UInt32] = [0x1D4ED8, 0x0EA5E9, 0x4F46E5, 0x0284C7, 0x2563EB, 0x6366F1]
        return Color(hex: blauw[n % blauw.count])
    }
}

extension Helikopter {
    /// Height in the chosen unit: "450 m" or "1.500 ft".
    var hoogteTekst: String {
        if opGrond { return L("Op de grond") }
        guard let ft = hoogteFt else { return "–" }
        if HeliWeergave.luchtvaart { return "\(Int((ft / 50).rounded() * 50).formatted()) ft" }
        return hoogteMeter.map { "\($0) m" } ?? "–"
    }
    /// Speed in the chosen unit: "240 km/u" or "130 kn".
    var snelheidTekst: String {
        guard let kt = snelheidKt else { return "–" }
        return HeliWeergave.luchtvaart ? "\(Int(kt.rounded())) kn" : Lf("%lld km/u", Int((kt * 1.852).rounded()))
    }
}

extension Melding {
    /// A large incident (same rule as the server): GRIP, scaling up, a (very) large or medium fire, or 10+ units.
    var isGrootIncident: Bool {
        if let g = grip, let n = Int(g), n > 0 { return true }
        // opschaling = size of the fire ("klein", "middel", "groot", "zeer groot"): only middel and up count.
        if let o = opschaling, o.range(of: "middel|groot|grip", options: [.regularExpression, .caseInsensitive]) != nil { return true }
        let tekst = [title, fullMelding ?? "", categorie ?? ""].joined(separator: " ")
        let pattern = #"\bGRIP\s*[1-5]\b|zeer\s+grote\s+brand|\bgrote\s+brand\b|middel\s*brand|\bopschaling\b|\bramp\b|\bCoPI\b|grootschalig|\bMMA\b|multi\s*trauma"#
        if tekst.range(of: pattern, options: [.regularExpression, .caseInsensitive]) != nil { return true }
        return eenheden.count >= 10
    }
}

// MARK: - Rain radar

/// GET /v1/radar: the KNMI radar image of the Netherlands (refreshed every 5 minutes).
struct RadarInfo: Decodable, Sendable {
    struct BBox: Decodable, Sendable { let west, east, south, north: Double }
    let beschikbaar: Bool
    let bbox: BBox?
    let url: String?
}

@MainActor
@Observable
final class RadarStore {
    static let shared = RadarStore()
    private(set) var info: RadarInfo?
    private(set) var afbeelding: Image?
    private(set) var geladen: Date?
    @ObservationIgnored private var bezig = false

    /// Loads the newest image when the last one is older than 5 minutes.
    func vernieuw() async {
        guard !bezig, geladen.map({ Date.now.timeIntervalSince($0) > 290 }) ?? true else { return }
        bezig = true
        defer { bezig = false }
        guard let info = try? await P2000API.shared.getJSON("/v1/radar", as: RadarInfo.self) else { return }
        self.info = info
        guard info.beschikbaar, let s = info.url, let url = URL(string: s),
              let (data, response) = try? await URLSession.shared.data(from: url),
              (response as? HTTPURLResponse)?.statusCode == 200 else { return }
        #if canImport(UIKit)
        if let ui = UIImage(data: data) { afbeelding = Image(uiImage: ui); geladen = .now }
        #elseif canImport(AppKit)
        if let ns = NSImage(data: data) { afbeelding = Image(nsImage: ns); geladen = .now }
        #endif
    }
}

// MARK: - "Klopt deze melding niet?"

enum FeedbackReden: String, CaseIterable, Identifiable {
    case locatie, dienst, prioriteit, dubbel, test, anders
    var id: String { rawValue }
    var label: String {
        switch self {
        case .locatie: return L("De plek klopt niet")
        case .dienst: return L("Verkeerde hulpdienst")
        case .prioriteit: return L("Verkeerde prioriteit")
        case .dubbel: return L("Dubbele melding")
        case .test: return L("Test- of proefalarm")
        case .anders: return L("Iets anders")
        }
    }
}

extension P2000API {
    func meldingFeedback(guid: String, reden: FeedbackReden, toelichting: String, plek: CLLocationCoordinate2D?) async throws {
        var body: [String: Any] = ["reden": reden.rawValue, "toelichting": toelichting, "platform": Self.platformNaam]
        if let plek { body["lat"] = plek.latitude; body["lon"] = plek.longitude }
        try await postJSON("v1/meldingen/\(guid)/feedback", body)
    }

    static var platformNaam: String {
        #if os(macOS)
        "macos"
        #elseif os(tvOS)
        "tvos"
        #elseif os(watchOS)
        "watchos"
        #else
        "ios"
        #endif
    }
}
