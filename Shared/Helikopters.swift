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
    /// How the server recognised it: "callsign", "registratie", "toestel" (same airframe, other callsign) or "operator".
    let herkenning: String?
    /// Where it is probably heading (hospital or its base), worked out by the server from its course.
    let voorspelling: HeliVoorspelling?
    /// Layer "Defensie en overheid" (GET /v1/lucht): the drawing for this type ("chinook", "f35", "kustwacht_dash8" …).
    let icoon: String?
    /// "Now above …": the nearest Dutch place ("Teuge, Voorst"); nil on the ground, above sea or abroad.
    let boven: String?

    enum CodingKeys: String, CodingKey {
        case id, naam, soort, basis, callsign, registratie, type, lat, lon, koers, gezien, herkenning, voorspelling, icoon, boven
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
        herkenning = try? c.decodeIfPresent(String.self, forKey: .herkenning)
        voorspelling = try? c.decodeIfPresent(HeliVoorspelling.self, forKey: .voorspelling)
        icoon = try? c.decodeIfPresent(String.self, forKey: .icoon)
        boven = try? c.decodeIfPresent(String.self, forKey: .boven)
    }

    var coordinate: CLLocationCoordinate2D { CLLocationCoordinate2D(latitude: lat, longitude: lon) }

    /// Side-view drawing per type: Lifeliner EC135 (yellow), police EC135, police AW139 (Zulu 24–26).
    var afbeelding: String {
        if let icoon { return "lucht_" + icoon }
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
    /// Defence, coastguard, Marechaussee or the government aircraft (own map layer).
    var isLucht: Bool { icoon != nil }
    var color: Color {
        if isLucht { return Color(hex: 0x586A33) }
        return HeliWeergave.kleur(id: id, soort: soort) ?? (isTrauma ? Dienst.traumaheli.color : Dienst.politie.color)
    }
    var soortLabel: String {
        if isLucht {
            switch soort {
            case "kustwacht": return L("Kustwacht")
            case "kmar": return L("Koninklijke Marechaussee")
            case "regering": return L("Regering")
            default: return L("Defensie")
            }
        }
        return isTrauma ? L("Traumahelikopter") : L("Politiehelikopter")
    }

    var hoogteMeter: Int? { opGrond ? 0 : hoogteFt.map { Int(($0 * 0.3048 / 10).rounded() * 10) } }
    var snelheidKmh: Int? { snelheidKt.map { Int(($0 * 1.852).rounded()) } }

    var koersTekst: String? {
        guard let k = koers else { return nil }
        let dirs = [L("N"), L("NO"), L("O"), L("ZO"), L("Z"), L("ZW"), L("W"), L("NW")]
        return "\(Int(k))° \(dirs[Int(((k + 22.5).truncatingRemainder(dividingBy: 360)) / 45)])"
    }

    /// Shown when the helicopter was not recognised by its usual callsign.
    var herkenningTekst: String? {
        if isLucht { return callsign.map { Lf("Herkend aan het toestel zelf; vliegt nu als %@", $0) } }
        switch herkenning {
        case "toestel": return Lf("Herkend aan het toestel; vliegt nu als %@", callsign ?? "–")
        case "operator": return L("Herkend aan de eigenaar van het toestel")
        default: return nil
        }
    }

    /// Not seen for more than two minutes.
    var isVerouderd: Bool { Date.now.timeIntervalSince(gezien) > 120 }
}

private struct HeliResponse: Decodable {
    let helikopters: [Helikopter]
}
private struct LuchtResponse: Decodable {
    let toestellen: [Helikopter]
}

extension P2000API {
    func helikopters() async throws -> [Helikopter] {
        try await getJSON("/v1/helikopters", as: HeliResponse.self).helikopters
    }
    /// Layer "Defensie en overheid": defence, coastguard, Marechaussee and the government aircraft above the Netherlands.
    func lucht() async throws -> [Helikopter] {
        try await getJSON("/v1/lucht", as: LuchtResponse.self).toestellen
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

/// The kinds of aircraft someone can choose to see in the layer Luchtvaart.
struct LuchtSoort: Identifiable, Hashable {
    let id: String          // "trauma", "politie" or the drawing of a defence/government aircraft
    let titel: String
    let afbeelding: String

    static let standaard: Set<String> = ["trauma", "politie"]
    static var alle: [LuchtSoort] {
        [LuchtSoort(id: "trauma", titel: "Lifeliner", afbeelding: "heli_lifeliner_ec135"),
         LuchtSoort(id: "politie", titel: L("Zulu (politie)"), afbeelding: "heli_politie_ec135"),
         LuchtSoort(id: "chinook", titel: "Chinook", afbeelding: "lucht_chinook"),
         LuchtSoort(id: "apache", titel: "Apache", afbeelding: "lucht_apache"),
         LuchtSoort(id: "cougar", titel: "Cougar", afbeelding: "lucht_cougar"),
         LuchtSoort(id: "nh90", titel: "NH90", afbeelding: "lucht_nh90"),
         LuchtSoort(id: "heli", titel: L("Overige helikopter (Defensie)"), afbeelding: "lucht_heli"),
         LuchtSoort(id: "f35", titel: L("Straaljager"), afbeelding: "lucht_f35"),
         LuchtSoort(id: "hercules", titel: L("Transportvliegtuig"), afbeelding: "lucht_hercules"),
         LuchtSoort(id: "les", titel: L("Lesvliegtuig"), afbeelding: "lucht_les"),
         LuchtSoort(id: "vliegtuig", titel: L("Overig vliegtuig (Defensie)"), afbeelding: "lucht_vliegtuig"),
         LuchtSoort(id: "kustwacht_dash8", titel: L("Kustwacht vliegtuig"), afbeelding: "lucht_kustwacht_dash8"),
         LuchtSoort(id: "kustwacht_aw189", titel: L("Kustwacht helikopter"), afbeelding: "lucht_kustwacht_aw189"),
         LuchtSoort(id: "kmar", titel: L("Koninklijke Marechaussee"), afbeelding: "lucht_kmar"),
         LuchtSoort(id: "phgov", titel: L("Regeringsvliegtuig PH-GOV"), afbeelding: "lucht_phgov")]
    }
    /// True when something other than Lifeliner and Zulu is chosen (then the defence and government aircraft are fetched).
    static func meerDanHelis(_ keuze: Set<String>) -> Bool { !keuze.subtracting(standaard).isEmpty }
}

extension Helikopter {
    /// The kind this aircraft counts as in the list of choices.
    var luchtSoort: String { icoon ?? soort }
}

/// Polls the defence and government aircraft every 15 seconds, only while the layer Luchtvaart shows any of them.
@MainActor
@Observable
final class LuchtStore {
    static let shared = LuchtStore()
    private(set) var items: [Helikopter] = []
    @ObservationIgnored private var task: Task<Void, Never>?

    func zet(_ aan: Bool) {
        if !aan { task?.cancel(); task = nil; items = []; return }
        guard task == nil else { return }
        task = Task { [weak self] in
            while !Task.isCancelled {
                if let list = try? await P2000API.shared.lucht() { self?.items = list }
                try? await Task.sleep(for: .seconds(15))
            }
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
    /// Route trail and flight history (map screen); nil hides that part.
    var spoor: HeliSpoorStore?
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
                #if os(iOS)
                HeliBel(heli: heli)
                #endif
                if let onClose {
                    Button(action: onClose) {
                        Image(systemName: "xmark.circle.fill").font(.title3).foregroundStyle(.secondary)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(L("Sluit"))
                }
            }
            if !heli.opGrond {
                // "Now above Teuge, Voorst · 25 min in the air"
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text(heli.boven.map { Lf("Nu boven %@", $0) } ?? L("Nu boven zee of over de grens"))
                        .font(AppFont.body(15, .semibold, relativeTo: .subheadline))
                    if let v = spoor?.vlucht, v.onderweg {
                        Text(v.inDeLucht).font(AppFont.body(12, .semibold, relativeTo: .caption)).foregroundStyle(.green)
                    }
                    Spacer(minLength: 0)
                }
            }
            HStack(spacing: 8) {
                waarde(L("Koers"), heli.opGrond ? "–" : (heli.koersTekst ?? "–"), "location.north.line.fill", koers: heli.opGrond ? nil : heli.koers)
                waarde(L("Hoogte"), heli.hoogteTekst, "arrow.up.and.down", tweede: heli.hoogteTweede)
                waarde(L("Snelheid"), heli.snelheidTekst, "speedometer", tweede: heli.snelheidTweede)
            }
            .fixedSize(horizontal: false, vertical: true)
            if let v = heli.voorspelling { VoorspellingRegel(voorspelling: v) }
            #if !os(watchOS)
            if let spoor {
                @Bindable var s = spoor
                Picker(L("Routespoor"), selection: $s.bereik) {
                    ForEach(SpoorBereik.allCases) { Text($0.label).tag($0) }
                }
                .pickerStyle(.segmented)
                #if !os(tvOS)
                AfspeelBalk(spoor: spoor)
                #endif
                HeliPlaatsenLijst(plaatsen: spoor.plaatsen, onderweg: spoor.vlucht?.onderweg ?? false)
                HeliVluchtenLijst(vluchten: spoor.vluchten, aantal: 3)
            }
            #endif
            if let h = heli.herkenningTekst {
                Label(h, systemImage: "info.circle").font(AppFont.body(11, .regular, relativeTo: .caption2)).foregroundStyle(.secondary)
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

    /// One value; `tweede` is the same value in the other unit (feet next to metres), `koers` draws a small compass.
    private func waarde(_ titel: String, _ value: String, _ icon: String, tweede: String? = nil, koers: Double? = nil) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Label(titel, systemImage: icon)
                .font(AppFont.body(11, .medium, relativeTo: .caption2))
                .foregroundStyle(.secondary)
            HStack(spacing: 6) {
                if let koers {
                    Image(systemName: "location.north.fill")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundStyle(.red)
                        .rotationEffect(.degrees(koers))
                        .frame(width: 20, height: 20)
                        .background(Circle().stroke(Color.secondary.opacity(0.35), lineWidth: 1.5))
                        .accessibilityHidden(true)
                }
                Text(value).font(AppFont.body(15, .semibold, relativeTo: .subheadline)).monospacedDigit().lineLimit(1).minimumScaleFactor(0.7)
            }
            if let tweede {
                Text(tweede).font(AppFont.body(11, .medium, relativeTo: .caption2)).foregroundStyle(.secondary).monospacedDigit().lineLimit(1)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .padding(10)
        .background(Color.secondary.opacity(0.1), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
    }
}

// MARK: - Helicopter of an alert

/// The helicopter that belongs to an alert: the Lifeliner (or Zulu) named in the call-out ("Traumaheli LifeLiner 3"),
/// or for a trauma alert without a number the trauma helicopter in the air closest to it.
enum HeliKoppeling {
    private static func eerste(_ pattern: String, in tekst: String) -> String? {
        guard let re = try? NSRegularExpression(pattern: pattern, options: .caseInsensitive),
              let m = re.firstMatch(in: tekst, range: NSRange(tekst.startIndex..., in: tekst)),
              let r = Range(m.range(at: 1), in: tekst) else { return nil }
        return String(tekst[r])
    }

    /// Helicopter id named in the alert ("lifeliner3", "zulu05").
    static func genoemd(_ m: Melding) -> String? {
        let tekst = (m.eenheden.compactMap(\.naam) + [m.fullMelding ?? "", m.title]).joined(separator: " ")
        if let n = eerste("life\\s*liner\\s*0?([1-4])", in: tekst) { return "lifeliner\(n)" }
        if let n = eerste("zulu\\s*0?(\\d{1,2})", in: tekst), let i = Int(n) { return String(format: "zulu%02d", i) }
        return nil
    }

    static func naam(_ id: String) -> String {
        id.hasPrefix("lifeliner") ? "Lifeliner \(id.dropFirst(9))" : id.hasPrefix("zulu") ? "Zulu \(id.dropFirst(4))" : id
    }

    /// Whether the detail page should follow helicopters for this alert.
    static func relevant(_ m: Melding) -> Bool { m.dienst == .traumaheli || genoemd(m) != nil }

    static func heli(voor m: Melding, in helis: [Helikopter]) -> Helikopter? {
        if let id = genoemd(m) { return helis.first { $0.id == id } }
        guard m.dienst == .traumaheli, let lat = m.lat, let lon = m.lon else { return nil }
        return helis.filter(\.isTrauma)
            .min { Werkgebied.distanceKm($0.lat, $0.lon, lat, lon) < Werkgebied.distanceKm($1.lat, $1.lon, lat, lon) }
            .flatMap { Werkgebied.distanceKm($0.lat, $0.lon, lat, lon) < 120 ? $0 : nil }
    }
}


// MARK: - Both units, the bell and the places of a flight

extension Helikopter {
    /// The altitude in the other unit than `hoogteTekst` (feet next to metres, or the other way round).
    var hoogteTweede: String? {
        guard !opGrond, let ft = hoogteFt else { return nil }
        if HeliWeergave.luchtvaart { return hoogteMeter.map { "\($0) m" } }
        return "\(Int((ft / 25).rounded() * 25).formatted()) ft"
    }
    /// The speed in the other unit than `snelheidTekst`.
    var snelheidTweede: String? {
        guard let kt = snelheidKt else { return nil }
        return HeliWeergave.luchtvaart ? Lf("%lld km/u", Int((kt * 1.852).rounded())) : "\(Int(kt.rounded())) kn"
    }
}

extension HeliVlucht {
    /// "25 min in de lucht" / "1 u 05 min in de lucht".
    var inDeLucht: String {
        if duurMin < 1 { return L("Net opgestegen") }
        if duurMin < 60 { return Lf("%lld min in de lucht", duurMin) }
        return Lf("%lld u %@ min in de lucht", duurMin / 60, String(format: "%02d", duurMin % 60))
    }
}

#if os(iOS)
/// The bell on one aircraft: a push when it takes off, wherever that is.
struct HeliBel: View {
    let heli: Helikopter
    @Environment(AppSettings.self) private var settings

    var body: some View {
        let aan = settings.heliVolg.contains(heli.id)
        Button {
            if aan { settings.heliVolg.remove(heli.id) } else if settings.heliVolg.count < 40 { settings.heliVolg.insert(heli.id) }
        } label: {
            Image(systemName: aan ? "bell.fill" : "bell")
                .font(.title3)
                .foregroundStyle(aan ? Color.orange : Color.secondary)
                .frame(width: 36, height: 36)
        }
        .buttonStyle(.plain)
        .sensoryFeedback(.selection, trigger: aan)
        .accessibilityLabel(aan ? Lf("Geen melding meer als %@ opstijgt", heli.naam) : Lf("Melding als %@ opstijgt", heli.naam))
    }
}
#endif

#if !os(watchOS)
/// The flight as a list of places, newest first: "14:12–14:16  Teuge (Voorst)".
struct HeliPlaatsenLijst: View {
    let plaatsen: [SpoorPlaats]
    let onderweg: Bool
    var aantal = 6

    var body: some View {
        if !plaatsen.isEmpty {
            VStack(alignment: .leading, spacing: 5) {
                Text(L("Waar geweest")).font(AppFont.body(12, .semibold, relativeTo: .caption)).foregroundStyle(.secondary)
                ForEach(Array(plaatsen.prefix(aantal).enumerated()), id: \.element.id) { i, p in
                    let nu = i == 0 && onderweg
                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                        Text(nu ? Fmt.time(p.van) : "\(Fmt.time(p.van))–\(Fmt.time(p.tot))")
                            .font(AppFont.body(12, .regular, relativeTo: .caption)).monospacedDigit().foregroundStyle(.secondary)
                            .frame(width: 86, alignment: .leading)
                        if let plaats = p.plaats {
                            Text(plaats).font(AppFont.body(13, .semibold, relativeTo: .footnote)).foregroundStyle(nu ? Color.green : Color.primary)
                            if let g = p.gemeente, g != plaats {
                                Text(g).font(AppFont.body(12, .regular, relativeTo: .caption)).foregroundStyle(.secondary).lineLimit(1)
                            }
                        } else {
                            Text(L("Boven zee of over de grens")).font(AppFont.body(13, .regular, relativeTo: .footnote)).italic().foregroundStyle(.secondary)
                        }
                        Spacer(minLength: 0)
                    }
                }
            }
        }
    }
}
#endif
