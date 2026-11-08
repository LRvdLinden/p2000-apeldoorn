import SwiftUI
import Observation
import CoreLocation

// Route trail, flight history and smooth movement of the helicopters (GET /v1/helikopters/<id>/spoor and /vluchten).
// The Worker stores the adsb.lol positions (ODbL) itself, 2 hours long.

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

/// How much of the trail to show: the current (or last) flight, the last 30 minutes, or everything kept (2 hours).
enum SpoorBereik: String, CaseIterable, Identifiable, Sendable {
    case vlucht, kort, lang
    var id: String { rawValue }
    var label: String {
        switch self {
        case .vlucht: L("Deze vlucht")
        case .kort: L("30 min")
        case .lang: L("2 uur")
        }
    }
}

extension P2000API {
    func heliSpoor(id: String, bereik: SpoorBereik) async throws -> [HeliSpoorPunt] {
        try await getJSON("/v1/helikopters/\(id)/spoor", query: ["scope": bereik.rawValue], as: SpoorResponse.self).punten
    }
    func heliVluchten(id: String) async throws -> [HeliVlucht] {
        try await getJSON("/v1/helikopters/\(id)/vluchten", as: VluchtenResponse.self).vluchten
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
        didSet { if oldValue != bereik { stopAfspelen(); Task { await load() } } }
    }
    @ObservationIgnored private var task: Task<Void, Never>?

    // MARK: Playback ("Vlucht terugspelen")
    /// 0…1 along the trail while playing back; nil = live.
    var afspeel: Double?
    private(set) var speelt = false
    /// Playback speed: how many seconds of flight per second.
    var snelheid: Double = 60
    @ObservationIgnored private var speelTask: Task<Void, Never>?

    var duur: TimeInterval { guard let a = punten.first?.t, let b = punten.last?.t else { return 0 }; return b.timeIntervalSince(a) }

    func speel() {
        guard punten.count >= 2, duur > 0 else { return }
        if afspeel == nil || (afspeel ?? 0) >= 1 { afspeel = 0 }
        speelt = true
        speelTask?.cancel()
        speelTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .milliseconds(100))
                guard let self, self.speelt else { return }
                let stap = 0.1 * self.snelheid / max(self.duur, 1)
                let volgende = min(1, (self.afspeel ?? 0) + stap)
                self.afspeel = volgende
                if volgende >= 1 { self.speelt = false; return }
            }
        }
    }
    func pauze() { speelt = false; speelTask?.cancel() }
    func stopAfspelen() { pauze(); afspeel = nil }

    /// Moment of the playback position.
    var afspeelMoment: Date? {
        guard let f = afspeel, let a = punten.first?.t else { return nil }
        return a.addingTimeInterval(duur * f)
    }
    /// Interpolated point at the playback position: coordinate and altitude.
    var afspeelPunt: (coordinate: CLLocationCoordinate2D, hoogteFt: Double?)? {
        guard let t = afspeelMoment, punten.count >= 2 else { return nil }
        guard let i = punten.firstIndex(where: { $0.t >= t }) else { return (punten.last!.coordinate, punten.last!.hoogteFt) }
        if i == 0 { return (punten[0].coordinate, punten[0].hoogteFt) }
        let a = punten[i - 1], b = punten[i]
        let span = b.t.timeIntervalSince(a.t)
        let f = span > 0 ? t.timeIntervalSince(a.t) / span : 1
        return (CLLocationCoordinate2D(latitude: a.lat + (b.lat - a.lat) * f, longitude: a.lon + (b.lon - a.lon) * f), a.hoogteFt ?? b.hoogteFt)
    }
    /// Trail up to the playback position.
    var afgespeeldeLijn: [CLLocationCoordinate2D] {
        guard let t = afspeelMoment else { return [] }
        var out = punten.filter { $0.t <= t }.map(\.coordinate)
        if let p = afspeelPunt?.coordinate { out.append(p) }
        return out
    }

    func volg(_ id: String?) {
        guard id != heliID else { return }
        heliID = id
        stopAfspelen()
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
        if let pp, afspeel == nil { punten = pp }
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

// MARK: - Prediction

/// Where a helicopter is probably heading (from the server, based on its course).
struct HeliVoorspelling: Decodable, Hashable, Sendable {
    struct Daarna: Decodable, Hashable, Sendable { let id: String; let naam: String }
    let id: String
    let naam: String
    let soort: String       // "ziekenhuis", "basis" or "melding" (on its way to the alert it was called for)
    let lat: Double
    let lon: Double
    let afstandKm: Double
    let etaMin: Int?
    let zekerheid: Double
    /// soort "melding": the alert, its town, and the hospital it will probably fly to afterwards.
    let guid: String?
    let plaats: String?
    let daarna: Daarna?

    enum CodingKeys: String, CodingKey { case id, naam, soort, lat, lon, zekerheid, guid, plaats, daarna, afstandKm = "afstand_km", etaMin = "eta_min" }
    var coordinate: CLLocationCoordinate2D { CLLocationCoordinate2D(latitude: lat, longitude: lon) }
    var isMelding: Bool { soort == "melding" }
    var tekst: String {
        let eta = etaMin.map { " · ± \($0) min" } ?? ""
        if isMelding {
            let doel = plaats.map { Lf("Onderweg naar de melding in %@", $0.capitalizedPlaats) } ?? L("Onderweg naar de melding")
            return doel + eta + (daarna.map { "\n" + Lf("Daarna waarschijnlijk naar %@", $0.naam) } ?? "")
        }
        return Lf("Waarschijnlijk naar %@", naam) + eta
    }
}

/// "Waarschijnlijk naar Isala · ± 12 min" with a hospital or base icon.
struct VoorspellingRegel: View {
    let voorspelling: HeliVoorspelling
    var body: some View {
        Label {
            Text(voorspelling.tekst).lineLimit(3)
        } icon: {
            Image(systemName: voorspelling.soort == "basis" ? "house.fill" : voorspelling.isMelding ? "light.beacon.max.fill" : "cross.case.fill")
                .foregroundStyle(voorspelling.soort == "basis" ? Color.secondary : Color.red)
        }
        .font(AppFont.body(13, .medium, relativeTo: .footnote))
        .accessibilityLabel(voorspelling.tekst + ". " + L("Voorspelling op basis van de koers."))
    }
}

#if !os(watchOS) && !os(tvOS)
/// Play back the trail shown: play/pause, a slider and the speed.
struct AfspeelBalk: View {
    @Bindable var spoor: HeliSpoorStore

    var body: some View {
        if spoor.punten.count >= 2 {
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 10) {
                    Button {
                        spoor.speelt ? spoor.pauze() : spoor.speel()
                    } label: {
                        Image(systemName: spoor.speelt ? "pause.circle.fill" : "play.circle.fill").font(.title2)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(spoor.speelt ? L("Pauze") : L("Vlucht terugspelen"))
                    Slider(value: Binding(get: { spoor.afspeel ?? 1 }, set: { spoor.pauze(); spoor.afspeel = $0 }), in: 0...1)
                        .accessibilityLabel(L("Afspeelpositie"))
                    Menu {
                        ForEach([30.0, 60, 120, 300], id: \.self) { v in
                            Button("\(Int(v))×") { spoor.snelheid = v }
                        }
                    } label: {
                        Text("\(Int(spoor.snelheid))×").font(AppFont.body(12, .semibold, relativeTo: .caption)).monospacedDigit()
                    }
                    if spoor.afspeel != nil {
                        Button { spoor.stopAfspelen() } label: { Image(systemName: "xmark.circle") }
                            .buttonStyle(.plain)
                            .accessibilityLabel(L("Terug naar live"))
                    }
                }
                if let t = spoor.afspeelMoment {
                    let h = spoor.afspeelPunt?.hoogteFt.map { " · \(Int(($0 * 0.3048 / 10).rounded()) * 10) m" } ?? ""
                    Text(Lf("Terugspelen: %@", t.formatted(date: .omitted, time: .standard)) + h)
                        .font(AppFont.body(11, .regular, relativeTo: .caption2)).foregroundStyle(.secondary).monospacedDigit()
                }
            }
        }
    }
}
#endif

// MARK: - Hospitals and bases

struct Locatie: Decodable, Identifiable, Hashable, Sendable {
    let id: String
    let naam: String
    let lat: Double
    let lon: Double
    let plaats: String?
    let trauma: Bool
    let helipad: Bool
    let isBasis: Bool

    enum CodingKeys: String, CodingKey { case id, naam, lat, lon, plaats, trauma, helipad }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        naam = try c.decode(String.self, forKey: .naam)
        lat = try c.decode(Double.self, forKey: .lat)
        lon = try c.decode(Double.self, forKey: .lon)
        plaats = try? c.decodeIfPresent(String.self, forKey: .plaats)
        trauma = (try? c.decodeIfPresent(Bool.self, forKey: .trauma)) ?? false
        helipad = (try? c.decodeIfPresent(Bool.self, forKey: .helipad)) ?? false
        isBasis = id.hasPrefix("basis-")
    }
    var coordinate: CLLocationCoordinate2D { CLLocationCoordinate2D(latitude: lat, longitude: lon) }
    var soortLabel: String {
        if isBasis { return L("Helikopterbasis / vliegveld") }
        return trauma ? L("Traumacentrum") : (helipad ? L("Ziekenhuis met helipad") : L("Ziekenhuis met SEH"))
    }
}

private struct LocatiesResponse: Decodable { let ziekenhuizen: [Locatie]; let bases: [Locatie] }

/// Hospitals (emergency department, helipad or trauma centre) and helicopter bases, loaded once per launch.
@MainActor
@Observable
final class LocatieStore {
    static let shared = LocatieStore()
    private(set) var items: [Locatie] = []
    @ObservationIgnored private var loading = false

    func load() async {
        guard items.isEmpty, !loading else { return }
        loading = true
        defer { loading = false }
        if let r = try? await P2000API.shared.getJSON("/v1/locaties", as: LocatiesResponse.self) {
            items = r.bases + r.ziekenhuizen
        }
    }
}

/// Map icon for a hospital (white square, red cross; trauma centre with a red border) or a base (helipad "H").
struct LocatieIcon: View {
    let locatie: Locatie
    var size: CGFloat = 24

    var body: some View {
        let kleur: Color = locatie.isBasis ? Dienst.traumaheli.color : .red
        ZStack {
            RoundedRectangle(cornerRadius: size * 0.28, style: .continuous).fill(Color.white)
            if locatie.isBasis {
                Text(verbatim: "H").font(.system(size: size * 0.62, weight: .black, design: .rounded)).foregroundStyle(kleur)
            } else {
                Image(systemName: "cross.fill").font(.system(size: size * 0.5, weight: .bold)).foregroundStyle(kleur)
            }
        }
        .frame(width: size, height: size)
        .overlay(RoundedRectangle(cornerRadius: size * 0.28, style: .continuous)
            .strokeBorder(locatie.trauma || locatie.isBasis ? kleur : Color.gray.opacity(0.5), lineWidth: max(1.5, size * 0.07)))
        .shadow(color: .black.opacity(0.3), radius: 3, y: 2)
        .accessibilityHidden(true)
    }
}
