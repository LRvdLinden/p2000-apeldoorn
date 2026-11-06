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

    /// The alert on the website (opens the live pager on that alert).
    var webLink: URL {
        var c = URLComponents(string: "https://p2000-apeldoorn.nl/pager/")!
        c.queryItems = [URLQueryItem(name: "melding", value: guid)]
        return c.url!
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
            Text(titel).font(.title3.bold())
            Text(subtitel).font(.subheadline).foregroundStyle(.secondary).multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 8)
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
                Text(titel).font(.body.weight(.semibold)).foregroundStyle(.primary)
                Text(subtitel).font(.subheadline).foregroundStyle(.secondary)
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
                            Image(systemName: "map.fill").font(.title2).foregroundStyle(.blue)
                        }
                    }
                    Button { openGoogleMaps() } label: {
                        SheetOptie(titel: "Google Maps", subtitel: L("Route met de auto in Google Maps")) {
                            Image(systemName: "mappin.and.ellipse").font(.title2).foregroundStyle(.green)
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
                         subtitel: L("De ontvanger opent de melding op p2000-apeldoorn.nl, ook zonder de app."))
                HStack(alignment: .top, spacing: 12) {
                    DienstIcon(dienst: melding.dienst, size: 40)
                    VStack(alignment: .leading, spacing: 3) {
                        Text(melding.title).font(.subheadline.weight(.semibold)).lineLimit(3)
                        Text("\(melding.plaatsText) · \(Fmt.dayTime(melding.datum))").font(.footnote).foregroundStyle(.secondary).lineLimit(1)
                        Text(verbatim: "p2000-apeldoorn.nl").font(.footnote).foregroundStyle(.tertiary)
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
                        SheetOptie(titel: gekopieerd == "link" ? L("Gekopieerd") : L("Kopieer link"), subtitel: "p2000-apeldoorn.nl", chevron: false) {
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
        let verbanden = Verband.gekoppeld(aan: melding, in: store.meldingen, max: 8)
        if !verbanden.isEmpty {
            let lijst = ([melding] + verbanden.map(\.melding)).sorted { $0.datum < $1.datum }
            let eerste = lijst.first?.datum ?? melding.datum
            let spanMin = Int(((lijst.last?.datum ?? eerste).timeIntervalSince(eerste) / 60).rounded())
            VStack(alignment: .leading, spacing: 10) {
                HStack(alignment: .firstTextBaseline) {
                    Text(L("Verloop")).font(.title3.bold())
                    Spacer()
                    Text(spanMin < 1 ? Lf("%lld meldingen binnen een minuut", lijst.count) : Lf("%lld meldingen binnen %lld min", lijst.count, spanMin))
                        .font(.footnote).foregroundStyle(.secondary)
                }
                .padding(.horizontal, 4)
                VStack(spacing: 0) {
                    ForEach(Array(lijst.enumerated()), id: \.element.guid) { index, m in
                        let reden = verbanden.first { $0.melding.guid == m.guid }?.redenen
                        rij(m, eerste: eerste, isHuidig: m.guid == melding.guid, isLaatste: index == lijst.count - 1, redenen: reden)
                    }
                }
                .padding(.vertical, 8)
                .background(Color.detailCard, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                Text(L("Meldingen die volgens tijd, plaats en eenheid mogelijk bij dezelfde inzet horen. Dit is een mogelijk verband, geen bevestiging."))
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
