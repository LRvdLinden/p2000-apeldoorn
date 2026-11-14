import SwiftUI

/// Other helicopters at the same spot (not a hospital or a base): probably one large incident.
struct HeliSamen: Decodable, Hashable, Sendable {
    let plaats: String?
    let met: [String]
}

/// GET /v1/helikopters/status: when every known aircraft was last seen, and weather that limits flying.
struct HeliStatusAntwoord: Decodable, Sendable {
    let toestellen: [HeliStatusRegel]
    let weer: HeliWeer?
}

struct HeliStatusRegel: Decodable, Identifiable, Sendable {
    let id: String
    let naam: String
    /// "lucht", "basis", "grond" or "uit_beeld".
    let status: String
    let gezien: String?
    let waar: String?

    var statusTekst: String {
        switch status {
        case "lucht": return waar.map { Lf("In de lucht boven %@", $0) } ?? L("In de lucht")
        case "basis": return waar.map { Lf("Op de basis: %@", $0) } ?? L("Op de basis")
        case "grond": return waar.map { Lf("Op de grond bij %@", $0) } ?? L("Op de grond")
        default:
            guard let g = gezien, let d = Fmt.parseISO(g) else { return L("Uit beeld") }
            return Lf("Uit beeld sinds %@", d.formatted(date: .abbreviated, time: .shortened))
        }
    }

    var kleur: Color {
        switch status {
        case "lucht": return .green
        case "basis", "grond": return .orange
        default: return .secondary
        }
    }
}

struct HeliWeer: Decodable, Hashable, Sendable {
    let reden: String
    let reden_en: String?
    let niveau: String

    var tekst: String {
        let engels = Bundle.main.preferredLocalizations.first == "en"
        let code: String
        switch niveau {
        case "red": code = L("code rood")
        case "orange": code = L("code oranje")
        default: code = L("code geel")
        }
        return Lf("Weinig helikopterinzet te verwachten: %@ (%@).", engels ? (reden_en ?? reden) : reden, code)
    }
}

extension P2000API {
    func heliStatus() async -> HeliStatusAntwoord? {
        try? await getJSON("v1/helikopters/status", as: HeliStatusAntwoord.self)
    }

    /// "Klopt dit toestel niet?": a note about an aircraft for the makers. True when it arrived.
    func meldToestel(id: String, toelichting: String) async -> Bool {
        do {
            try await postJSON("v1/helikopters/\(id)/melden", ["toelichting": toelichting, "platform": "ios"])
            return true
        } catch { return false }
    }
}

/// In the card of an aircraft: where it stands on the ground, the others at the same spot, and limiting weather.
struct HeliExtraRegels: View {
    let heli: Helikopter
    @State private var weer: HeliWeer?

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if heli.opGrond, let plek = heli.plek {
                Text(heli.plekSoort == "basis" ? Lf("Op de basis: %@", plek) : Lf("Op de grond bij %@", plek))
                    .font(AppFont.body(15, .semibold, relativeTo: .subheadline))
            }
            if let s = heli.samen, !s.met.isEmpty {
                Label {
                    Text(s.plaats.map { Lf("Samen met %@ op één plek in %@. Mogelijk een groot incident.", s.met.joined(separator: ", "), $0) }
                         ?? Lf("Samen met %@ op één plek. Mogelijk een groot incident.", s.met.joined(separator: ", ")))
                } icon: {
                    Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(.red)
                }
                .font(AppFont.body(13, .semibold, relativeTo: .footnote))
            }
            if let weer {
                Label(weer.tekst, systemImage: "cloud.fog.fill")
                    .font(AppFont.body(12, .regular, relativeTo: .caption))
                    .foregroundStyle(.secondary)
            }
        }
        .task { weer = await P2000API.shared.heliStatus()?.weer }
    }
}

#if !os(watchOS) && !os(tvOS)
/// "Klopt dit toestel niet?": a short note that arrives in the beheer.
struct HeliMeldKnop: View {
    let heli: Helikopter
    @State private var open = false
    @State private var tekst = ""
    @State private var klaar: Bool?

    var body: some View {
        Button {
            open = true
        } label: {
            Label(klaar == true ? L("Bedankt, je melding is verstuurd") : L("Klopt dit toestel niet?"), systemImage: klaar == true ? "checkmark.circle" : "exclamationmark.bubble")
                .font(AppFont.body(12, .regular, relativeTo: .caption))
        }
        .buttonStyle(.plain)
        .foregroundStyle(.secondary)
        .disabled(klaar == true)
        .alert(L("Klopt dit toestel niet?"), isPresented: $open) {
            TextField(L("Wat klopt er niet?"), text: $tekst)
            Button(L("Verstuur")) {
                let t = tekst.trimmingCharacters(in: .whitespacesAndNewlines)
                guard t.count >= 3 else { return }
                let naam = heli.naam + (heli.registratie.map { " (\($0))" } ?? "")
                Task { klaar = await P2000API.shared.meldToestel(id: heli.id, toelichting: "\(naam): \(t)") }
            }
            Button(L("Annuleer"), role: .cancel) {}
        } message: {
            Text(L("Bijvoorbeeld een verkeerde naam, of een toestel dat ontbreekt."))
        }
    }
}

/// Settings: the followed aircraft with where they are now.
struct HeliVolgStatus: View {
    @Environment(AppSettings.self) private var settings
    @State private var regels: [HeliStatusRegel] = []

    var body: some View {
        ForEach(settings.heliVolg.sorted(), id: \.self) { id in
            let r = regels.first { $0.id == id }
            HStack(spacing: 10) {
                Circle().fill(r?.kleur ?? Color.secondary).frame(width: 9, height: 9)
                VStack(alignment: .leading, spacing: 2) {
                    Text(r?.naam ?? id).font(AppFont.body(15, .semibold, relativeTo: .subheadline))
                    Text(r?.statusTekst ?? L("Nog niet gezien")).font(AppFont.body(12, .regular, relativeTo: .caption)).foregroundStyle(.secondary)
                }
                Spacer(minLength: 0)
                Button {
                    settings.heliVolg.remove(id)
                } label: {
                    Image(systemName: "bell.slash")
                }
                .buttonStyle(.plain)
                .accessibilityLabel(L("Niet meer volgen"))
            }
        }
        .task { regels = await P2000API.shared.heliStatus()?.toestellen ?? [] }
    }
}
#endif
