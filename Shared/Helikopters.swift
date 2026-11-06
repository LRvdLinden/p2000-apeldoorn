import SwiftUI
import Observation
import CoreLocation

/// Live position of a trauma helicopter (Lifeliner) or police helicopter (Zulu), from GET /v1/helikopters.
/// Data: adsb.lol (ODbL). Positions can lag or be missing when a helicopter flies low.
struct Helikopter: Decodable, Identifiable, Hashable, Sendable {
    let id: String
    let naam: String
    let soort: String          // "trauma" or "politie"
    let basis: String?
    let callsign: String?
    let registratie: String?
    let type: String?
    let lat: Double
    let lon: Double
    let koers: Double?
    let hoogteFt: Double?
    let opGrond: Bool
    let snelheidKt: Double?
    let gezien: Date

    enum CodingKeys: String, CodingKey {
        case id, naam, soort, basis, callsign, registratie, type, lat, lon, koers, gezien
        case hoogteFt = "hoogte_ft", opGrond = "op_grond", snelheidKt = "snelheid_kt"
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        naam = try c.decode(String.self, forKey: .naam)
        soort = (try? c.decode(String.self, forKey: .soort)) ?? "trauma"
        basis = try? c.decodeIfPresent(String.self, forKey: .basis)
        callsign = try? c.decodeIfPresent(String.self, forKey: .callsign)
        registratie = try? c.decodeIfPresent(String.self, forKey: .registratie)
        type = try? c.decodeIfPresent(String.self, forKey: .type)
        lat = try c.decode(Double.self, forKey: .lat)
        lon = try c.decode(Double.self, forKey: .lon)
        koers = try? c.decodeIfPresent(Double.self, forKey: .koers)
        hoogteFt = try? c.decodeIfPresent(Double.self, forKey: .hoogteFt)
        opGrond = (try? c.decodeIfPresent(Bool.self, forKey: .opGrond)) ?? false
        snelheidKt = try? c.decodeIfPresent(Double.self, forKey: .snelheidKt)
        let raw = (try? c.decode(String.self, forKey: .gezien)) ?? ""
        gezien = Fmt.parseISO(raw) ?? .now
    }

    var coordinate: CLLocationCoordinate2D { CLLocationCoordinate2D(latitude: lat, longitude: lon) }

    /// Side-view drawing per type: Lifeliner EC135 (yellow), police EC135, police AW139 (Zulu 24–26).
    var afbeelding: String {
        if isTrauma { return "heli_lifeliner_ec135" }
        let t = (type ?? "").uppercased()
        if t == "A139" || ["zulu24", "zulu25", "zulu26"].contains(id) { return "heli_politie_aw139" }
        return "heli_politie_ec135"
    }

    /// The drawings face east (nose right); flying west (heading 180°–360°) mirrors them.
    var vliegtWest: Bool {
        guard let k = koers, !opGrond else { return false }
        let h = (k.truncatingRemainder(dividingBy: 360) + 360).truncatingRemainder(dividingBy: 360)
        return h > 180 && h < 360
    }
    var isTrauma: Bool { soort == "trauma" }
    var color: Color { isTrauma ? Dienst.traumaheli.color : Dienst.politie.color }
    var soortLabel: String { isTrauma ? L("Traumahelikopter") : L("Politiehelikopter") }

    var hoogteMeter: Int? { opGrond ? 0 : hoogteFt.map { Int(($0 * 0.3048 / 10).rounded() * 10) } }
    var snelheidKmh: Int? { snelheidKt.map { Int(($0 * 1.852).rounded()) } }

    var koersTekst: String? {
        guard let k = koers else { return nil }
        let dirs = [L("N"), L("NO"), L("O"), L("ZO"), L("Z"), L("ZW"), L("W"), L("NW")]
        return "\(Int(k))° \(dirs[Int(((k + 22.5).truncatingRemainder(dividingBy: 360)) / 45)])"
    }

    /// Not seen for more than two minutes.
    var isVerouderd: Bool { Date.now.timeIntervalSince(gezien) > 120 }
}

private struct HeliResponse: Decodable {
    let helikopters: [Helikopter]
}

extension P2000API {
    func helikopters() async throws -> [Helikopter] {
        try await getJSON("/v1/helikopters", as: HeliResponse.self).helikopters
    }
}

/// Polls the helicopter positions every 15 seconds while a map with the helicopter layer is visible.
@MainActor
@Observable
final class HeliStore {
    static let shared = HeliStore()

    private(set) var items: [Helikopter] = []
    private(set) var lastUpdated: Date?
    private(set) var failed = false

    @ObservationIgnored private var task: Task<Void, Never>?
    @ObservationIgnored private var users = 0

    func start() {
        users += 1
        guard task == nil else { return }
        task = Task { [weak self] in
            while !Task.isCancelled {
                await self?.refresh()
                try? await Task.sleep(for: .seconds(15))
            }
        }
    }

    func stop() {
        users = max(0, users - 1)
        guard users == 0 else { return }
        task?.cancel()
        task = nil
    }

    func refresh() async {
        do {
            items = try await P2000API.shared.helikopters()
            lastUpdated = .now
            failed = false
        } catch {
            failed = true
        }
    }
}

/// Map marker: a rotated helicopter in the colour of the service, with its name underneath.
struct HeliMarker: View {
    let heli: Helikopter
    /// Height of the helicopter drawing in points (it is about 2.8× as wide).
    var size: CGFloat = 38
    var selected = false
    /// Turn the drawing with the direction of flight (side view: nose left when flying west).
    var volgtKoers = true

    var body: some View {
        VStack(spacing: 2) {
            Image(heli.afbeelding)
                .resizable()
                .scaledToFit()
                .frame(width: size * 2.8, height: size)
                .scaleEffect(x: volgtKoers && heli.vliegtWest ? -1 : 1, y: 1)
                .shadow(color: .black.opacity(0.35), radius: 3, y: 2)
                .padding(4)
                .background {
                    if selected {
                        Capsule().fill(heli.color.opacity(0.25))
                            .overlay(Capsule().strokeBorder(heli.color, lineWidth: 2))
                    }
                }
            Text(heli.naam)
                .font(AppFont.body(10, .bold, relativeTo: .caption2))
                .padding(.horizontal, 6).padding(.vertical, 2)
                .background(.regularMaterial, in: Capsule())
        }
        .opacity(heli.isVerouderd ? 0.55 : 1)
        .scaleEffect(selected ? 1.12 : 1)
        .animation(.spring(duration: 0.25), value: selected)
        .animation(.easeInOut(duration: 0.3), value: heli.vliegtWest)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(heli.naam), \(heli.soortLabel)")
    }
}

/// Speed, altitude and heading in a compact card.
struct HeliInfoKaart: View {
    let heli: Helikopter
    var afstandKm: Double?
    var onClose: (() -> Void)?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 12) {
                Image(heli.afbeelding)
                    .resizable()
                    .scaledToFit()
                    .frame(width: 84, height: 30)
                    .scaleEffect(x: heli.vliegtWest ? -1 : 1, y: 1)
                VStack(alignment: .leading, spacing: 2) {
                    Text(heli.naam).font(AppFont.heading(22))
                    Text([heli.soortLabel, heli.registratie, heli.basis.map { Lf("basis %@", $0) }].compactMap { $0 }.joined(separator: " · "))
                        .font(AppFont.body(12, .regular, relativeTo: .caption))
                        .foregroundStyle(.secondary)
                }
                Spacer()
                if let onClose {
                    Button(action: onClose) {
                        Image(systemName: "xmark.circle.fill").font(.title3).foregroundStyle(.secondary)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(L("Sluit"))
                }
            }
            HStack(spacing: 8) {
                waarde(L("Koers"), heli.opGrond ? "–" : (heli.koersTekst ?? "–"), "location.north.line.fill")
                waarde(L("Hoogte"), heli.opGrond ? L("Op de grond") : (heli.hoogteMeter.map { "\($0) m" } ?? "–"), "arrow.up.and.down")
                waarde(L("Snelheid"), heli.snelheidKmh.map { "\($0) km/u" } ?? "–", "speedometer")
            }
            HStack(spacing: 6) {
                if let afstandKm {
                    Text(Lf("%@ km van je af", afstandKm.formatted(.number.precision(.fractionLength(1)))))
                    Text(verbatim: "·")
                }
                Text(Lf("Positie van %@", heli.gezien.formatted(date: .omitted, time: .standard)))
                if heli.isVerouderd { Text(L("(verouderd)")) }
            }
            .font(AppFont.body(11, .regular, relativeTo: .caption2))
            .foregroundStyle(.secondary)
        }
        .padding(14)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .shadow(color: .black.opacity(0.15), radius: 10, y: 4)
    }

    private func waarde(_ titel: String, _ value: String, _ icon: String) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Label(titel, systemImage: icon)
                .font(AppFont.body(11, .medium, relativeTo: .caption2))
                .foregroundStyle(.secondary)
            Text(value).font(AppFont.body(15, .semibold, relativeTo: .subheadline)).monospacedDigit().lineLimit(1).minimumScaleFactor(0.7)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(10)
        .background(Color.secondary.opacity(0.1), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
    }
}
