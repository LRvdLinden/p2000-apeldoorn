import SwiftUI
import MapKit
#if canImport(UIKit)
import UIKit
#elseif canImport(AppKit)
import AppKit
#endif

// MARK: - Top bar (glass): back · place + street · route, bookmark, share

struct DetailTopBar: View {
    let titel: String
    let subtitel: String
    var showsBack: Bool
    var isBewaard: Bool
    var onBack: () -> Void
    var onRoute: () -> Void
    var onBewaar: () -> Void
    var onShare: () -> Void

    var body: some View {
        HStack(spacing: 10) {
            if showsBack {
                Button(action: onBack) {
                    Image(systemName: "chevron.left")
                        .font(.system(size: 18, weight: .semibold))
                        .frame(width: 46, height: 46)
                }
                .buttonStyle(.plain)
                .glassCircle()
                .accessibilityLabel(L("Terug"))
            }
            VStack(spacing: 1) {
                Text(titel).font(.headline).lineLimit(1)
                Text(subtitel).font(.footnote).foregroundStyle(.secondary).lineLimit(1)
            }
            .frame(maxWidth: .infinity)
            .padding(.horizontal, 14)
            .frame(height: 50)
            .glassCapsule()
            .accessibilityElement(children: .combine)
            HStack(spacing: 2) {
                barButton("arrow.triangle.turn.up.right.diamond", L("Route"), action: onRoute)
                barButton(isBewaard ? "bookmark.fill" : "bookmark", isBewaard ? L("Niet meer bewaren") : L("Bewaar"), action: onBewaar)
                barButton("square.and.arrow.up", L("Deel"), action: onShare)
            }
            .padding(.horizontal, 4)
            .frame(height: 50)
            .glassCapsule()
        }
        .padding(.horizontal, 14)
    }

    private func barButton(_ symbol: String, _ label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.system(size: 17, weight: .semibold))
                .foregroundStyle(Theme.red)
                .frame(width: 40, height: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }
}

extension View {
    /// Liquid-glass look on iOS 26, material on older systems.
    @ViewBuilder func glassCapsule() -> some View {
        if #available(iOS 26.0, macOS 26.0, *) {
            self.glassEffect(.regular.interactive(), in: Capsule())
        } else {
            self.background(.regularMaterial, in: Capsule())
                .overlay(Capsule().strokeBorder(.white.opacity(0.25)))
        }
    }

    @ViewBuilder func glassCircle() -> some View {
        if #available(iOS 26.0, macOS 26.0, *) {
            self.glassEffect(.regular.interactive(), in: Circle())
        } else {
            self.background(.regularMaterial, in: Circle())
                .overlay(Circle().strokeBorder(.white.opacity(0.25)))
        }
    }
}

/// Round control on the map (my location, 3D, enlarge).
struct MapControlButton: View {
    let symbol: String
    var text: String? = nil
    var active = false
    let label: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Group {
                if let text {
                    Text(text).font(.system(size: 17, weight: .bold))
                } else {
                    Image(systemName: symbol).font(.system(size: 18, weight: .semibold))
                }
            }
            .foregroundStyle(active ? Color.white : Theme.red)
            .frame(width: 48, height: 48)
            .background(active ? Theme.red : Color.clear, in: Circle())
        }
        .buttonStyle(.plain)
        .glassCircle()
        .accessibilityLabel(label)
        .accessibilityAddTraits(active ? .isSelected : [])
    }
}

// MARK: - Address helpers

extension Melding {
    /// "Kayersdijk en Johan de Wittstraat" or "Locatie niet bekend".
    var straatTekst: String {
        guard hasStreet, let loc = locatie?.trimmingCharacters(in: .whitespaces), !loc.isEmpty else { return L("Specifieke locatie niet bekend") }
        return loc
    }

    var adresTekst: String {
        hasStreet ? "\(locatie ?? ""), \(plaatsNaam)" : plaatsNaam
    }

    /// The alert on the website: a-alerts.nl/melding/<dienst>/<guid>. Opens the app when it is installed,
    /// otherwise the live pager; link previews show the banner of the service.
    var webLink: URL {
        Config.website.appendingPathComponent("melding").appendingPathComponent(dienst.rawValue).appendingPathComponent(guid)
    }

    var deelTekst: String {
        "\(fullMelding ?? title)\n\(plaatsText) · \(Fmt.dayTime(datum))\n\(webLink.absoluteString)"
    }
}

enum Klembord {
    static func kopieer(_ text: String) {
        #if canImport(UIKit)
        UIPasteboard.general.string = text
        #else
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(text, forType: .string)
        #endif
    }
}

// MARK: - Sheet building blocks

struct SheetKop: View {
    let symbol: String
    let kleur: Color
    var vorm: AnyShape = AnyShape(Circle())
    let titel: String
    let subtitel: String

    var body: some View {
        VStack(spacing: 8) {
            Image(systemName: symbol)
                .font(.system(size: 26, weight: .semibold))
                .foregroundStyle(.white)
                .frame(width: 60, height: 60)
                .background(kleur, in: vorm)
            Text(titel).font(.headline)
            Text(subtitel).font(.subheadline).foregroundStyle(.secondary).multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 8)
    }
}

/// The real app icon of a route app when its image is in the asset catalog (routeapp_applemaps / routeapp_googlemaps,
/// the official icons from the press kits), else an SF Symbol in the app's colour.
struct RouteAppIcoon: View {
    let asset: String
    let symbol: String
    let kleur: Color

    private var heeftAfbeelding: Bool {
        #if canImport(UIKit)
        UIImage(named: asset) != nil
        #else
        NSImage(named: asset) != nil
        #endif
    }

    var body: some View {
        if heeftAfbeelding {
            Image(asset)
                .resizable()
                .scaledToFit()
                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).strokeBorder(.black.opacity(0.08), lineWidth: 0.5))
        } else {
            Image(systemName: symbol).font(.title2).foregroundStyle(kleur)
        }
    }
}

struct SheetOptie<Icon: View>: View {
    let titel: String
    let subtitel: String
    var chevron = true
    @ViewBuilder var icon: Icon

    var body: some View {
        HStack(spacing: 14) {
            icon
                .frame(width: 48, height: 48)
                .background(Color.secondary.opacity(0.1), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            VStack(alignment: .leading, spacing: 2) {
                Text(titel).font(.subheadline.weight(.semibold)).foregroundStyle(.primary)
                Text(subtitel).font(.footnote).foregroundStyle(.secondary)
            }
            Spacer(minLength: 8)
            if chevron { Image(systemName: "chevron.right").font(.footnote.weight(.semibold)).foregroundStyle(.tertiary) }
        }
        .padding(14)
        .background(Color.detailCard, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .contentShape(Rectangle())
    }
}

struct Chip: View {
    let symbol: String
    let tekst: String
    var body: some View {
        Label(tekst, systemImage: symbol)
            .font(.subheadline.weight(.medium))
            .foregroundStyle(.secondary)
            .padding(.horizontal, 12).padding(.vertical, 7)
            .background(Color.secondary.opacity(0.12), in: Capsule())
    }
}

// MARK: - Route sheet

struct RouteSheet: View {
    let melding: Melding
    @Environment(LocationManager.self) private var location
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL
    @State private var rijMinuten: Int?
    @State private var rijKm: Double?
    @State private var gekopieerd = false

    private var coordinate: CLLocationCoordinate2D {
        CLLocationCoordinate2D(latitude: melding.lat ?? Config.center.lat, longitude: melding.lon ?? Config.center.lon)
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                SheetKop(symbol: "arrow.turn.up.right", kleur: .blue, vorm: AnyShape(RoundedRectangle(cornerRadius: 12).rotation(.degrees(45))),
                         titel: L("Route naar incident"), subtitel: melding.adresTekst)
                HStack(spacing: 8) {
                    if let km = rijKm ?? location.distance(to: melding).map({ $0 / 1000 }) {
                        Chip(symbol: "location.fill", tekst: Lf("%@ km", km.formatted(.number.precision(.fractionLength(1)))))
                    }
                    if let m = rijMinuten { Chip(symbol: "car.fill", tekst: Lf("± %lld min rijden", m)) }
                }
                if !melding.hasStreet {
                    Text(L("De meldkamer gaf geen straat door: de route gaat naar het midden van de plaats."))
                        .font(.footnote).foregroundStyle(.secondary).multilineTextAlignment(.center)
                }
                VStack(spacing: 12) {
                    Button { openAppleMaps() } label: {
                        SheetOptie(titel: L("Apple Kaarten"), subtitel: L("Route met de auto in Kaarten")) {
                            RouteAppIcoon(asset: "routeapp_applemaps", symbol: "map.fill", kleur: .blue)
                        }
                    }
                    Button { openGoogleMaps() } label: {
                        SheetOptie(titel: "Google Maps", subtitel: L("Route met de auto in Google Maps")) {
                            RouteAppIcoon(asset: "routeapp_googlemaps", symbol: "mappin.and.ellipse", kleur: .green)
                        }
                    }
                    Button {
                        Klembord.kopieer(melding.adresTekst)
                        withAnimation { gekopieerd = true }
                    } label: {
                        SheetOptie(titel: gekopieerd ? L("Gekopieerd") : L("Kopieer adres"), subtitel: L("Om zelf in een andere app te plakken"), chevron: false) {
                            Image(systemName: gekopieerd ? "checkmark" : "doc.on.doc").font(.title3).foregroundStyle(.secondary)
                        }
                    }
                }
                .buttonStyle(.plain)
            }
            .padding(20)
        }
        .background(Color.pageBackground)
        .task { await berekenRoute() }
    }

    private func berekenRoute() async {
        #if os(iOS) || os(macOS)
        guard melding.hasCoordinate else { return }
        let request = MKDirections.Request()
        request.source = MKMapItem.forCurrentLocation()
        request.destination = MKMapItem(placemark: MKPlacemark(coordinate: coordinate))
        request.transportType = .automobile
        if let route = try? await MKDirections(request: request).calculate().routes.first {
            rijMinuten = max(1, Int((route.expectedTravelTime / 60).rounded()))
            rijKm = route.distance / 1000
        }
        #endif
    }

    private func openAppleMaps() {
        let item = MKMapItem(placemark: MKPlacemark(coordinate: coordinate))
        item.name = melding.adresTekst
        item.openInMaps(launchOptions: [MKLaunchOptionsDirectionsModeKey: MKLaunchOptionsDirectionsModeDriving])
        dismiss()
    }

    private func openGoogleMaps() {
        let dest = "\(coordinate.latitude),\(coordinate.longitude)"
        #if os(iOS)
        if let app = URL(string: "comgooglemaps://?daddr=\(dest)&directionsmode=driving"), UIApplication.shared.canOpenURL(app) {
            openURL(app)
            dismiss()
            return
        }
        #endif
        var c = URLComponents(string: "https://www.google.com/maps/dir/")!
        c.queryItems = [URLQueryItem(name: "api", value: "1"), URLQueryItem(name: "destination", value: dest),
                        URLQueryItem(name: "travelmode", value: "driving")]
        if let url = c.url { openURL(url) }
        dismiss()
    }
}

// MARK: - Share sheet

struct DeelSheet: View {
    let melding: Melding
    @State private var gekopieerd: String?

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                SheetKop(symbol: "square.and.arrow.up", kleur: Theme.red, titel: L("Melding delen"),
                         subtitel: L("De ontvanger opent de melding op a-alerts.nl, ook zonder de app."))
                HStack(alignment: .top, spacing: 12) {
                    DienstIcon(dienst: melding.dienst, size: 40)
                    VStack(alignment: .leading, spacing: 3) {
                        Text(melding.title).font(.subheadline.weight(.semibold)).lineLimit(3)
                        Text("\(melding.plaatsText) · \(Fmt.dayTime(melding.datum))").font(.footnote).foregroundStyle(.secondary).lineLimit(1)
                        Text(verbatim: "a-alerts.nl").font(.footnote).foregroundStyle(.tertiary)
                    }
                    Spacer(minLength: 0)
                }
                .padding(14)
                .background(Color.detailCard, in: RoundedRectangle(cornerRadius: 18, style: .continuous))

                VStack(spacing: 12) {
                    ShareLink(item: melding.webLink, subject: Text(melding.title), message: Text(melding.deelTekst)) {
                        SheetOptie(titel: L("Deel via…"), subtitel: L("Berichten, WhatsApp, Mail en meer")) {
                            Image(systemName: "square.and.arrow.up").font(.title3).foregroundStyle(Theme.red)
                        }
                    }
                    Button { kopieer(melding.webLink.absoluteString, "link") } label: {
                        SheetOptie(titel: gekopieerd == "link" ? L("Gekopieerd") : L("Kopieer link"), subtitel: "a-alerts.nl", chevron: false) {
                            Image(systemName: gekopieerd == "link" ? "checkmark" : "link").font(.title3).foregroundStyle(.secondary)
                        }
                    }
                    Button { kopieer(melding.deelTekst, "tekst") } label: {
                        SheetOptie(titel: gekopieerd == "tekst" ? L("Gekopieerd") : L("Kopieer melding"), subtitel: L("De P2000-tekst met de link eronder"), chevron: false) {
                            Image(systemName: gekopieerd == "tekst" ? "checkmark" : "doc.on.doc").font(.title3).foregroundStyle(.secondary)
                        }
                    }
                }
                .buttonStyle(.plain)
            }
            .padding(20)
        }
        .background(Color.pageBackground)
    }

    private func kopieer(_ s: String, _ soort: String) {
        Klembord.kopieer(s)
        withAnimation { gekopieerd = soort }
    }
}

// MARK: - Verloop (phase 4: possible link, as a timeline)

struct VerloopKaart: View {
    let melding: Melding
    @Environment(MeldingStore.self) private var store

    var body: some View {
        let verbanden = Verband.gekoppeld(aan: melding, in: store.metVerloop, max: 8)
        if !verbanden.isEmpty {
            let lijst = ([melding] + verbanden.map(\.melding)).sorted { $0.datum < $1.datum }
            let eerste = lijst.first?.datum ?? melding.datum
            let spanMin = Int(((lijst.last?.datum ?? eerste).timeIntervalSince(eerste) / 60).rounded())
            VStack(alignment: .leading, spacing: 10) {
                HStack(alignment: .firstTextBaseline) {
                    Text(L("Verloop")).font(AppFont.heading(18))
                    Spacer()
                    Text(spanMin < 1 ? Lf("%lld meldingen binnen een minuut", lijst.count) : Lf("%lld meldingen binnen %lld min", lijst.count, spanMin))
                        .font(.footnote).foregroundStyle(.secondary)
                }
                .padding(.horizontal, 4)
                VStack(spacing: 0) {
                    ForEach(Array(lijst.enumerated()), id: \.element.guid) { index, m in
                        let reden = verbanden.first { $0.melding.guid == m.guid }?.redenen
                        // "↑ Opgeschaald naar Middelbrand": this alert is a step up from the one before it.
                        if index > 0, let op = Verband.opschaling(van: lijst[index - 1], naar: m) {
                            Label(Lf("Opgeschaald naar %@", op), systemImage: "arrow.up.circle.fill")
                                .font(.footnote.weight(.semibold)).foregroundStyle(.orange)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding(.leading, 82).padding(.vertical, 2)
                        }
                        rij(m, eerste: eerste, isHuidig: m.guid == melding.guid, isLaatste: index == lijst.count - 1, redenen: reden)
                    }
                }
                .padding(.vertical, 8)
                .background(Color.detailCard, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                Text(verbanden.allSatisfy(\.zeker) ? L("Meldingen van dezelfde inzet.") : L("Meldingen van dezelfde inzet, en meldingen die er volgens tijd, plaats en eenheid mogelijk bij horen (geen zekerheid)."))
                    .font(.footnote).foregroundStyle(.secondary)
                    .padding(.horizontal, 4)
            }
        }
    }

    @ViewBuilder
    private func rij(_ m: Melding, eerste: Date, isHuidig: Bool, isLaatste: Bool, redenen: [String]?) -> some View {
        let inhoud = HStack(alignment: .top, spacing: 12) {
            VStack(alignment: .trailing, spacing: 2) {
                Text(Fmt.time(m.datum)).font(.subheadline.weight(.semibold).monospacedDigit())
                let plus = Int((m.datum.timeIntervalSince(eerste) / 60).rounded())
                Text(verbatim: "+\(plus) min").font(.caption.monospacedDigit()).foregroundStyle(.secondary)
            }
            .frame(width: 58, alignment: .trailing)
            .padding(.top, 14)
            VStack(spacing: 0) {
                ZStack {
                    Circle().fill(m.dienst.color.opacity(isHuidig ? 0.18 : 0)).frame(width: 46, height: 46)
                    DienstIcon(dienst: m.dienst, size: 30)
                }
                .overlay(Circle().strokeBorder(isHuidig ? m.dienst.color : .clear, lineWidth: 3))
                if !isLaatste {
                    Rectangle().fill(m.dienst.color.opacity(0.6)).frame(width: 3).frame(maxHeight: .infinity)
                }
            }
            .frame(width: 46)
            .padding(.top, 6)
            VStack(alignment: .leading, spacing: 4) {
                if !m.prioriteitText.isEmpty {
                    Label(m.prioriteitText, systemImage: "exclamationmark.triangle.fill")
                        .font(.caption).foregroundStyle(.secondary).lineLimit(1)
                }
                Text(m.title).font(isHuidig ? .subheadline.weight(.semibold) : .subheadline).foregroundStyle(.primary)
                    .fixedSize(horizontal: false, vertical: true)
                if isHuidig {
                    Label(L("Deze melding"), systemImage: "eye.fill").font(.caption.weight(.semibold)).foregroundStyle(Theme.red)
                } else if let redenen, !redenen.isEmpty {
                    Text(redenen.joined(separator: " · ")).font(.caption).foregroundStyle(.secondary)
                }
            }
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(isHuidig ? m.dienst.color.opacity(0.12) : .clear, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            if !isHuidig {
                Image(systemName: "chevron.right").font(.footnote.weight(.semibold)).foregroundStyle(.tertiary).padding(.top, 18)
            }
        }
        .padding(.horizontal, 12)
        .fixedSize(horizontal: false, vertical: true)

        if isHuidig {
            inhoud
        } else {
            NavigationLink { MeldingDetailView(melding: m) } label: { inhoud.contentShape(Rectangle()) }
                .buttonStyle(.plain)
        }
    }
}

// MARK: - Units of the incident, building facts

/// Building facts from the BAG (GET /v1/meldingen/<guid>/pand).
struct Pand: Decodable, Hashable, Sendable {
    let bouwjaar: Int?
    let gebruik: [String]
    let adressen: Int?

    enum CodingKeys: String, CodingKey { case bouwjaar, gebruik, adressen }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        bouwjaar = try? c.decodeIfPresent(Int.self, forKey: .bouwjaar)
        gebruik = (try? c.decodeIfPresent([String].self, forKey: .gebruik)) ?? []
        adressen = try? c.decodeIfPresent(Int.self, forKey: .adressen)
    }

    /// The uses of the BAG, in the language of the app.
    private static let namen: [String: String] = [
        "Wonen": L("Wonen"), "Winkel": L("Winkel"), "Kantoor": L("Kantoor"), "Industrie": L("Industrie"), "Bijeenkomst": L("Bijeenkomst"),
        "Zorg": L("Zorg"), "Onderwijs": L("Onderwijs"), "Logies": L("Logies"), "Sport": L("Sport"), "Cel": L("Cel"), "Overig": L("Overig"),
    ]

    /// "Bouwjaar 1966 · Winkel, Wonen · 3 adressen"
    var tekst: String {
        var delen: [String] = []
        if let bouwjaar { delen.append(Lf("Bouwjaar %@", String(bouwjaar))) }
        if !gebruik.isEmpty { delen.append(gebruik.map { Self.namen[$0] ?? $0 }.joined(separator: ", ")) }
        if let adressen, adressen > 1 { delen.append(Lf("%lld adressen", adressen)) }
        return delen.joined(separator: " · ")
    }
}
private struct PandResponse: Decodable { let pand: Pand? }

extension P2000API {
    func pand(guid: String) async throws -> Pand? {
        try await getJSON("/v1/meldingen/\(guid)/pand", as: PandResponse.self).pand
    }
}

/// One unit of an incident with the time of its alarm.
struct InzetEenheid: Identifiable, Hashable {
    let naam: String
    let type: String?
    let tijd: Date
    let dienst: Dienst
    /// A Lifeliner or Zulu ("lifeliner3"): shown as the helicopter itself, tappable to the map.
    var heli: String? = nil
    var id: String { naam + "|" + String(tijd.timeIntervalSince1970) }
}

extension Verband {
    /// Every unit alarmed for this incident: the units of this alert plus those of alerts that almost certainly belong
    /// to it (same address, or close by with the same unit). Oldest first, one line per unit.
    static func inzet(van m: Melding, in list: [Melding]) -> (eenheden: [InzetEenheid], meldingen: Int) {
        let bij = ([m] + gekoppeld(aan: m, in: list, max: 12).filter { $0.score >= 3 }.map(\.melding)).sorted { $0.datum < $1.datum }
        var gezien = Set<String>()
        var out: [InzetEenheid] = []
        for x in bij {
            for e in x.eenheden {
                guard let key = e.code ?? e.naam, gezien.insert(key).inserted else { continue }
                out.append(InzetEenheid(naam: e.naam ?? key, type: e.type, tijd: x.datum, dienst: x.dienst, heli: HeliKoppeling.genoemd(in: e.naam ?? "")))
            }
        }
        return (out, bij.count)
    }
}

/// "Eenheden bij deze inzet": all units of the alerts that belong to this incident, with the time of their alarm.
struct InzetKaart: View {
    let melding: Melding
    /// Tap on a Lifeliner or Zulu: to the map, following that helicopter.
    var onVolg: ((String) -> Void)?
    @Environment(MeldingStore.self) private var store

    var body: some View {
        let inzet = Verband.inzet(van: melding, in: store.metVerloop)
        if inzet.meldingen >= 2, inzet.eenheden.count >= 2 {
            VStack(alignment: .leading, spacing: 10) {
                Text(Lf("Eenheden bij deze inzet (%lld)", inzet.eenheden.count)).font(AppFont.heading(18)).padding(.horizontal, 4)
                VStack(spacing: 0) {
                    ForEach(Array(inzet.eenheden.enumerated()), id: \.element.id) { i, e in
                        if let heli = e.heli {
                            Button { onVolg?(heli) } label: {
                                HStack(spacing: 12) {
                                    Text(Fmt.time(e.tijd)).font(.subheadline.weight(.semibold).monospacedDigit()).frame(width: 48, alignment: .leading)
                                    Image(heli.hasPrefix("lifeliner") ? "heli_lifeliner_ec135" : "heli_politie_ec135")
                                        .resizable().scaledToFit().frame(width: 54, height: 20)
                                    VStack(alignment: .leading, spacing: 1) {
                                        Text(HeliKoppeling.naam(heli)).font(AppFont.body(14, .semibold))
                                        Text(heli.hasPrefix("lifeliner") ? L("Traumahelikopter · toon op de kaart") : L("Politiehelikopter · toon op de kaart"))
                                            .font(AppFont.body(12)).foregroundStyle(.secondary)
                                    }
                                    Spacer(minLength: 0)
                                    Image(systemName: "chevron.right").font(.footnote.weight(.semibold)).foregroundStyle(.tertiary)
                                }
                                .padding(.horizontal, 14).padding(.vertical, 8)
                                .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                        } else {
                        HStack(spacing: 12) {
                            Text(Fmt.time(e.tijd)).font(.subheadline.weight(.semibold).monospacedDigit()).frame(width: 48, alignment: .leading)
                            RoundedRectangle(cornerRadius: 3).fill(e.dienst.color).frame(width: 6, height: 28)
                            VStack(alignment: .leading, spacing: 1) {
                                Text(e.naam).font(AppFont.body(14, .medium))
                                if let t = e.type, !t.isEmpty { Text(t).font(AppFont.body(12)).foregroundStyle(.secondary) }
                            }
                            Spacer(minLength: 0)
                        }
                        .padding(.horizontal, 14).padding(.vertical, 8)
                        }
                        if i < inzet.eenheden.count - 1 { Divider().padding(.leading, 74) }
                    }
                }
                .padding(.vertical, 6)
                .background(Color.detailCard, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                Text(Lf("Alle eenheden uit de %lld meldingen die bij deze inzet horen, met de tijd van alarmering.", inzet.meldingen))
                    .font(.footnote).foregroundStyle(.secondary).padding(.horizontal, 4)
            }
        }
    }
}

// MARK: - Minimum version

/// Asks the server once at start-up for the lowest build that still works (an older build is asked to update) and
/// for a message of the makers, shown as a bar until it is closed.
struct MinVersieWacht: ViewModifier {
    @State private var verouderd = false
    @State private var mededeling: P2000API.AppInfo.Mededeling?
    @AppStorage("mededelingGesloten") private var gesloten = ""
    @Environment(\.openURL) private var openURL

    func body(content: Content) -> some View {
        content
            .task {
                guard let info = await P2000API.shared.appInfo() else { return }
                let min = info.min_build?.ios ?? 0
                let build = Int(Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "") ?? 0
                verouderd = min > 0 && build > 0 && build < min
                mededeling = info.mededeling
            }
            .safeAreaInset(edge: .top, spacing: 0) {
                if let md = mededeling, md.id != gesloten {
                    HStack(alignment: .top, spacing: 10) {
                        Image(systemName: "megaphone.fill").foregroundStyle(.white)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(md.titel).font(AppFont.body(14, .semibold, relativeTo: .subheadline))
                            Text(md.tekst).font(AppFont.body(13, .regular, relativeTo: .footnote))
                        }
                        .foregroundStyle(.white)
                        Spacer(minLength: 0)
                        Button { gesloten = md.id } label: { Image(systemName: "xmark").font(.footnote.weight(.bold)).foregroundStyle(.white) }
                            .buttonStyle(.plain)
                            .accessibilityLabel(L("Sluit"))
                    }
                    .padding(.horizontal, 14).padding(.vertical, 10)
                    .background(Theme.red)
                }
            }
            .alert(L("Werk de app bij"), isPresented: $verouderd) {
                if !Config.appStoreID.isEmpty, let url = URL(string: "https://apps.apple.com/app/id\(Config.appStoreID)") {
                    Button(L("Naar de App Store")) { openURL(url) }
                }
                Button(L("Later"), role: .cancel) {}
            } message: {
                Text(L("Deze versie van A-Alerts is te oud en werkt niet meer goed. Installeer de nieuwste versie via de App Store of TestFlight."))
            }
    }
}

// MARK: - App icon

#if os(iOS)
/// Choose the icon of the app. "Standaard" follows the system: the dark icon in dark mode.
struct AppIcoonKeuze: View {
    private static let opties: [(naam: String?, titel: String, uitleg: String, beeld: String)] = [
        (nil, L("Standaard"), L("Past zich aan: in de donkere modus het donkere icoon."), "icoon_standaard"),
        ("AppIcon-Donker", L("Donker"), L("Altijd het donkere icoon."), "icoon_donker"),
        ("AppIcon-Blauw", L("Blauw"), L("Blauwe achtergrond."), "icoon_blauw"),
    ]
    @State private var huidig: String? = UIApplication.shared.alternateIconName

    var body: some View {
        List {
            Section {
                ForEach(Self.opties, id: \.beeld) { o in
                    Button {
                        UIApplication.shared.setAlternateIconName(o.naam) { fout in
                            if fout == nil { huidig = o.naam }
                        }
                    } label: {
                        HStack(spacing: 14) {
                            Image(o.beeld).resizable().frame(width: 60, height: 60)
                                .clipShape(RoundedRectangle(cornerRadius: 13.5, style: .continuous))
                            VStack(alignment: .leading, spacing: 2) {
                                Text(o.titel).font(AppFont.body(16, .semibold)).foregroundStyle(.primary)
                                Text(o.uitleg).font(.footnote).foregroundStyle(.secondary)
                            }
                            Spacer()
                            if huidig == o.naam { Image(systemName: "checkmark.circle.fill").foregroundStyle(Theme.red) }
                        }
                    }
                    .buttonStyle(.plain)
                }
            } footer: {
                Text(L("iOS laat kort een melding zien als het icoon is gewijzigd."))
            }
        }
        .navigationTitle(L("App-icoon"))
    }
}
#endif
