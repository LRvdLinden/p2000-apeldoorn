import SwiftUI
import MapKit

/// Weather article in the tab Nieuws, built like the warning on knmi.nl: map of the Netherlands with the areas in the
/// colour of their code, the date and time window on the map, the KNMI headline, the code, the description, the issue
/// time, "Risico's en advies" and the details. The server sends it as "weer" in GET /v1/nieuws/:id.
struct WeerArtikel: Decodable, Sendable {
    struct Vak: Decodable, Hashable, Sendable { let niveau: String?; let code: String; let tekst: String }
    struct Gebied: Decodable, Sendable { let niveau: String?; let gebied: [[[Double]]]? }

    let kop: String
    let code: String
    let niveau: String?
    let soort: String?
    let omschrijving: String?
    let uitgifte: String?
    let details: String?
    let adviezen: [String]
    let opgeheven: Bool
    let tijdvak: String?
    let datumKop: String?
    let vanafTot: String?
    let tijdvakken: [Vak]?
    let gebieden: [Gebied]

    enum CodingKeys: String, CodingKey { case kop, code, niveau, soort, omschrijving, uitgifte, details, adviezen, opgeheven, tijdvak, datumKop, vanafTot, tijdvakken, gebieden }
    init(from d: Decoder) throws {
        let c = try d.container(keyedBy: CodingKeys.self)
        kop = (try? c.decode(String.self, forKey: .kop)) ?? ""
        code = (try? c.decode(String.self, forKey: .code)) ?? ""
        niveau = try? c.decodeIfPresent(String.self, forKey: .niveau)
        soort = try? c.decodeIfPresent(String.self, forKey: .soort)
        omschrijving = try? c.decodeIfPresent(String.self, forKey: .omschrijving)
        uitgifte = try? c.decodeIfPresent(String.self, forKey: .uitgifte)
        details = try? c.decodeIfPresent(String.self, forKey: .details)
        adviezen = (try? c.decodeIfPresent([String].self, forKey: .adviezen)) ?? []
        opgeheven = (try? c.decodeIfPresent(Bool.self, forKey: .opgeheven)) ?? false
        tijdvak = try? c.decodeIfPresent(String.self, forKey: .tijdvak)
        datumKop = try? c.decodeIfPresent(String.self, forKey: .datumKop)
        vanafTot = try? c.decodeIfPresent(String.self, forKey: .vanafTot)
        tijdvakken = try? c.decodeIfPresent([Vak].self, forKey: .tijdvakken)
        gebieden = (try? c.decodeIfPresent([Gebied].self, forKey: .gebieden)) ?? []
    }

    var kleur: Color { Waarschuwing.codeColor(opgeheven ? "green" : niveau) }
    /// Dark text on yellow, white on the other codes (like knmi.nl).
    var opKleur: Color { (opgeheven ? "green" : niveau) == "yellow" || niveau == nil ? Color(hex: 0x1D1D1F) : .white }
    var symbool: String { Waarschuwing.weatherSymbol(soort) }

    /// Every area as rings for MapPolygon, with its code.
    var vlakken: [(niveau: String?, ring: [CLLocationCoordinate2D])] {
        var uit: [(niveau: String?, ring: [CLLocationCoordinate2D])] = []
        for g in gebieden {
            for ring in g.gebied ?? [] {
                let punten = ring.compactMap { $0.count == 2 ? CLLocationCoordinate2D(latitude: $0[1], longitude: $0[0]) : nil }
                if punten.count > 2 { uit.append((niveau: g.niveau, ring: punten)) }
            }
        }
        return uit
    }

    /// The Netherlands, from the Wadden Islands to South Limburg.
    static let nederland: MKMapRect = {
        let a = MKMapPoint(CLLocationCoordinate2D(latitude: 53.62, longitude: 3.30))
        let b = MKMapPoint(CLLocationCoordinate2D(latitude: 50.70, longitude: 7.25))
        return MKMapRect(x: min(a.x, b.x), y: min(a.y, b.y), width: abs(b.x - a.x), height: abs(b.y - a.y))
    }()
}

/// The map of the Netherlands with the date, the icon and the time window, like the map on knmi.nl.
struct WeerKaart: View {
    let weer: WeerArtikel
    var hoogte: CGFloat = 380
    var interactief = true
    @State private var positie: MapCameraPosition = .rect(WeerArtikel.nederland)

    var body: some View {
        Map(position: $positie, interactionModes: interactief ? [.zoom, .pan] : []) {
            ForEach(Array(weer.vlakken.enumerated()), id: \.offset) { _, v in
                let k = Waarschuwing.codeColor(weer.opgeheven ? "green" : v.niveau)
                MapPolygon(coordinates: v.ring).foregroundStyle(k.opacity(0.55)).stroke(k, lineWidth: 1)
            }
        }
        .mapStyle(.standard(pointsOfInterest: .excludingAll))
        .environment(\.colorScheme, .light)
        .frame(height: hoogte)
        .overlay(alignment: .topLeading) {
            VStack(alignment: .leading, spacing: 10) {
                if let dag = weer.datumKop {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(dag).font(AppFont.heading(hoogte > 300 ? 22 : 16)).foregroundStyle(Color(hex: 0x163E6E))
                        if let v = weer.vanafTot { Text(v).font(AppFont.body(hoogte > 300 ? 16 : 13)).foregroundStyle(Color(hex: 0x163E6E)) }
                    }
                    .padding(.horizontal, 10).padding(.vertical, 6)
                    .background(.white.opacity(0.75), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                }
                RoundedRectangle(cornerRadius: 12, style: .continuous).fill(Color(hex: 0x1D1D1F))
                    .frame(width: hoogte > 300 ? 64 : 46, height: hoogte > 300 ? 64 : 46)
                    .overlay {
                        RoundedRectangle(cornerRadius: 9, style: .continuous).fill(weer.kleur).padding(7)
                            .overlay { Image(systemName: weer.symbool).font(.system(size: hoogte > 300 ? 22 : 16, weight: .semibold)).foregroundStyle(weer.opKleur) }
                    }
                    .accessibilityHidden(true)
            }
            .padding(14)
        }
        .overlay(alignment: .bottom) {
            if let t = weer.tijdvak, !t.isEmpty { tijdChip(t).padding(.bottom, 14) }
        }
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text([weer.code, weer.soort, weer.tijdvak].compactMap { $0 }.joined(separator: ", ")))
    }

    /// "maandag" small, "23:30 tot dinsdag 12:00" bold, with a bar in the code colour.
    private func tijdChip(_ t: String) -> some View {
        let delen = t.split(separator: " ", maxSplits: 1).map(String.init)
        return HStack(spacing: 0) {
            Rectangle().fill(weer.kleur).frame(width: 4)
            VStack(spacing: 2) {
                if delen.count == 2 {
                    Text(delen[0]).font(AppFont.body(hoogte > 300 ? 14 : 11))
                    Text(delen[1]).font(AppFont.body(hoogte > 300 ? 17 : 13, .bold))
                } else {
                    Text(t).font(AppFont.body(hoogte > 300 ? 17 : 13, .bold))
                }
            }
            .foregroundStyle(.white).padding(.horizontal, 16).padding(.vertical, 8)
        }
        .fixedSize()
        .background(Color(hex: 0x23272F), in: RoundedRectangle(cornerRadius: 6, style: .continuous))
    }
}

/// The text part of the weather article, below the map.
struct WeerTekst: View {
    let weer: WeerArtikel
    var schaal: CGFloat = 1

    var body: some View {
        VStack(alignment: .leading, spacing: 14 * schaal) {
            Text(weer.kop).font(AppFont.heading(28 * schaal)).fixedSize(horizontal: false, vertical: true)
            HStack(spacing: 8) {
                Text(weer.opgeheven ? L("Code groen") : weer.code).font(AppFont.body(17 * schaal, .semibold)).foregroundStyle(weer.opKleur)
                    .padding(.horizontal, 12 * schaal).padding(.vertical, 6 * schaal)
                    .background(weer.kleur, in: RoundedRectangle(cornerRadius: 6, style: .continuous))
                if weer.opgeheven { Text(L("Opgeheven")).font(AppFont.body(15 * schaal, .semibold)).foregroundStyle(.secondary) }
            }
            if let vakken = weer.tijdvakken, vakken.count > 1 {
                VStack(alignment: .leading, spacing: 6) {
                    ForEach(vakken, id: \.self) { v in
                        HStack(spacing: 8) {
                            Circle().fill(Waarschuwing.codeColor(v.niveau)).frame(width: 10 * schaal, height: 10 * schaal)
                            Text("\(v.code): \(v.tekst)").font(AppFont.body(15 * schaal))
                        }
                    }
                }
            }
            if let o = weer.omschrijving, !o.isEmpty {
                Text(o).font(AppFont.body(18 * schaal)).lineSpacing(4).fixedSize(horizontal: false, vertical: true)
            }
            if let u = weer.uitgifte, !u.isEmpty {
                Text(Lf("Uitgifte: %@", u)).font(AppFont.body(14 * schaal)).foregroundStyle(.secondary)
            }
            if !weer.adviezen.isEmpty {
                HStack(spacing: 0) {
                    Rectangle().fill(Theme.red).frame(width: 4)
                    VStack(alignment: .leading, spacing: 12 * schaal) {
                        Text(L("Risico's en advies")).font(AppFont.heading(21 * schaal)).foregroundStyle(Theme.red)
                        ForEach(weer.adviezen, id: \.self) { a in
                            HStack(alignment: .firstTextBaseline, spacing: 10) {
                                Image(systemName: "chevron.right").font(.system(size: 13 * schaal, weight: .bold)).foregroundStyle(Theme.red)
                                Text(a).font(AppFont.body(17 * schaal)).lineSpacing(3).fixedSize(horizontal: false, vertical: true)
                            }
                        }
                    }
                    .padding(18 * schaal)
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                .background(Color.secondary.opacity(0.12))
            }
            if let d = weer.details, !d.isEmpty { WeerDetails(tekst: d, schaal: schaal) }
        }
        .textSelectionIfAvailable()
    }
}

private struct WeerDetails: View {
    let tekst: String
    let schaal: CGFloat
    @State private var open = false
    var body: some View {
        #if os(tvOS) || os(watchOS)
        VStack(alignment: .leading, spacing: 8) {
            Text(L("Details")).font(AppFont.heading(21 * schaal))
            Text(tekst).font(AppFont.body(16 * schaal)).fixedSize(horizontal: false, vertical: true)
        }
        #else
        DisclosureGroup(isExpanded: $open) {
            Text(tekst).font(AppFont.body(16 * schaal)).lineSpacing(3).fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading).padding(.top, 8)
        } label: {
            Text(L("Details")).font(AppFont.heading(21 * schaal)).foregroundStyle(Theme.red)
        }
        .tint(Theme.red)
        #endif
    }
}

private extension View {
    @ViewBuilder func textSelectionIfAvailable() -> some View {
        #if os(iOS) || os(macOS)
        self.textSelection(.enabled)
        #else
        self
        #endif
    }
}
