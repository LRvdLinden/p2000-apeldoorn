import SwiftUI
import MapKit

struct MeldingDetailView: View {
    let melding: Melding

    @Environment(MeldingStore.self) private var store
    @Environment(AppSettings.self) private var settings
    @Environment(LocationManager.self) private var location
    @Environment(\.openURL) private var openURL

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                hero
                if melding.hasCoordinate { mapCard }
                aboutCard
                if !melding.eenheden.isEmpty || !melding.voertuigen.isEmpty { unitsCard }
                detailsCard
                if let weer = melding.weather { weatherCard(weer) }
                if let link = melding.link, let url = URL(string: link) {
                    Link(destination: url) {
                        Label(L("Bekijk op p2000.page"), systemImage: "safari")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.bordered)
                    .controlSize(.large)
                }
            }
            .padding()
            .frame(maxWidth: 760)
            .frame(maxWidth: .infinity)
        }
        .background(Color.groupedBackground)
        .navigationTitle(melding.dienst.label)
        #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
        #endif
        .toolbar {
            ToolbarItemGroup(placement: .primaryAction) {
                Button {
                    withAnimation { settings.toggleBewaard(melding) }
                } label: {
                    Label(isBewaard ? L("Niet meer bewaren") : L("Bewaar"),
                          systemImage: isBewaard ? "bookmark.fill" : "bookmark")
                }
                ShareLink(item: melding.shareText) {
                    Label(L("Deel"), systemImage: "square.and.arrow.up")
                }
            }
        }
        .onAppear { store.registerView(melding) }
    }

    private var isBewaard: Bool { settings.bewaard.contains(melding.guid) }

    // MARK: Hero

    private var hero: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .center, spacing: 14) {
                DienstIcon(dienst: melding.dienst, size: 54)
                    .padding(10)
                    .background(.white, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                VStack(alignment: .leading, spacing: 4) {
                    Text(melding.dienst.label.uppercased())
                        .font(.caption.weight(.heavy))
                        .tracking(1.5)
                        .foregroundStyle(.white.opacity(0.9))
                    HStack(spacing: 6) {
                        PrioBadge(melding: melding)
                        if melding.recordID.hasPrefix("live-") {
                            Text(L("LIVE")).font(.caption2.weight(.heavy))
                                .padding(.horizontal, 6).padding(.vertical, 2)
                                .background(.white.opacity(0.25), in: Capsule())
                                .foregroundStyle(.white)
                        }
                    }
                }
                Spacer()
            }
            Text(melding.title)
                .font(.title2.weight(.bold))
                .foregroundStyle(.white)
                .fixedSize(horizontal: false, vertical: true)
                .textSelection(.enabled)
            if !melding.prioriteitText.isEmpty {
                Text(melding.prioriteitText)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.white.opacity(0.92))
            }
            VStack(alignment: .leading, spacing: 6) {
                Label(melding.plaatsText, systemImage: "mappin.and.ellipse")
                TimelineView(.periodic(from: .now, by: 30)) { ctx in
                    Label("\(Fmt.dayTime(melding.datum)) · \(Fmt.ago(melding.datum, now: ctx.date))", systemImage: "clock")
                }
                if let d = location.distance(to: melding) {
                    Label(Lf("%@ bij je vandaan", Fmt.distance(d)), systemImage: "location")
                }
            }
            .font(.callout)
            .foregroundStyle(.white.opacity(0.92))
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(heroGradient, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
    }

    private var heroGradient: LinearGradient {
        let base: Color = melding.dienst == .ambulance ? Color(hex: 0xD99A00) : melding.dienst.color
        return LinearGradient(colors: [base, base.opacity(0.75)], startPoint: .topLeading, endPoint: .bottomTrailing)
    }

    // MARK: Map

    private var coordinate: CLLocationCoordinate2D {
        CLLocationCoordinate2D(latitude: melding.lat ?? Config.center.lat, longitude: melding.lon ?? Config.center.lon)
    }

    private var mapCard: some View {
        VStack(spacing: 0) {
            Map(initialPosition: .region(MKCoordinateRegion(center: coordinate, latitudinalMeters: 1600, longitudinalMeters: 1600)),
                interactionModes: []) {
                Annotation(melding.title, coordinate: coordinate, anchor: .bottom) {
                    DienstMarker(dienst: melding.dienst, size: 46)
                }
                .annotationTitles(.hidden)
            }
            .mapStyle(MapStyleSetting.style(for: settings.mapType))
            .frame(height: 210)
            .allowsHitTesting(false)

            HStack(spacing: 10) {
                Button {
                    openInMaps(directions: false)
                } label: {
                    Label(L("Open in Kaarten"), systemImage: "map")
                        .frame(maxWidth: .infinity)
                }
                Button {
                    openInMaps(directions: true)
                } label: {
                    Label(L("Route"), systemImage: "arrow.triangle.turn.up.right.diamond")
                        .frame(maxWidth: .infinity)
                }
            }
            .buttonStyle(.bordered)
            .padding(12)
        }
        .background(Color.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
    }

    private func openInMaps(directions: Bool) {
        let item = MKMapItem(placemark: MKPlacemark(coordinate: coordinate))
        item.name = melding.plaatsText
        var options: [String: Any] = [:]
        if directions { options[MKLaunchOptionsDirectionsModeKey] = MKLaunchOptionsDirectionsModeDefault }
        item.openInMaps(launchOptions: options)
    }

    // MARK: About (same story as the website)

    private var aboutCard: some View {
        Card(title: L("Over deze melding"), icon: "text.alignleft") {
            Text(story)
                .font(.callout)
                .fixedSize(horizontal: false, vertical: true)
                .textSelection(.enabled)
        }
    }

    private var story: String {
        let stad = melding.stad?.capitalizedPlaats ?? "Apeldoorn"
        let dienst = melding.dienst.label.lowercased()
        let dag = melding.datum.formatted(.dateTime.weekday(.wide).day().month(.wide))
        let wat = melding.categorie ?? melding.title
        let opdracht = melding.isUrgent || ["A2", "P2"].contains((melding.prioriteit ?? "").uppercased())
            ? L("met spoed ter plaatse te komen") : L("ter plaatse te komen")
        var text = Lf("De %@ van %@ is %@ gealarmeerd voor een \"%@\"", dienst, stad, dag, wat)
        if let loc = melding.locatie, !loc.isEmpty { text += Lf(" op %@", loc) }
        text += ". "
        text += Lf("De melding werd om %@ via het P2000-netwerk verzonden naar de %@ van %@, die het verzoek kreeg om %@.",
                   Fmt.time(melding.datum), dienst, stad, opdracht)
        text += "\n\n" + L("Apeldoorn valt onder de P2000-regio Noord- en Oost-Gelderland. De hulpdiensten reageren onder meer op 112-meldingen die bij deze veiligheidsregio binnenkomen; via P2000 worden ze uitgestuurd naar het juiste brandweerkorps, de ambulancedienst of de dienstdoende politie.")
        if let maand = store.maand {
            let brand = maand.byDienst["brandweer"] ?? 0
            let ambu = maand.byDienst["ambulance"] ?? 0
            text += "\n\n" + Lf("Deze maand werd de brandweer %lld keer gealarmeerd en ging de ambulance %lld keer op pad.", brand, ambu)
        }
        return text
    }

    // MARK: Units

    private var unitsCard: some View {
        Card(title: L("Eenheden"), icon: "person.2.wave.2") {
            VStack(alignment: .leading, spacing: 10) {
                ForEach(Array(melding.eenheden.enumerated()), id: \.offset) { _, e in
                    HStack(alignment: .firstTextBaseline) {
                        Image(systemName: "dot.radiowaves.left.and.right").foregroundStyle(melding.dienst.textColor)
                        VStack(alignment: .leading, spacing: 1) {
                            Text(e.naam ?? e.code ?? "–").font(.callout.weight(.semibold))
                            Text([e.type, e.regio].compactMap { $0 }.joined(separator: " · "))
                                .font(.caption).foregroundStyle(.secondary)
                        }
                        Spacer()
                        if let code = e.code {
                            Text(code).font(.caption.monospaced()).foregroundStyle(.secondary)
                        }
                    }
                }
                if !melding.voertuigen.isEmpty {
                    Divider()
                    FlowChips(items: melding.voertuigen.map { [$0.label, $0.nrb ?? $0.nra].compactMap { $0 }.joined(separator: " ") })
                }
            }
        }
    }

    // MARK: Details

    private var detailsCard: some View {
        Card(title: L("Details"), icon: "info.circle") {
            VStack(spacing: 8) {
                row(L("Discipline"), melding.dienst.label)
                if let p = melding.prioriteit { row(L("Prioriteit"), p) }
                if let c = melding.categorie { row(L("Categorie"), c) }
                if let c = melding.capcode { row(L("Capcode"), c, mono: true) }
                if let r = melding.regio { row(L("Regio"), r) }
                if let g = melding.grip { row(L("GRIP"), g) }
                if let o = melding.opschaling { row(L("Opschaling"), o) }
                if melding.views > 0 { row(L("Bekeken"), "\(melding.views)x") }
                if let full = melding.fullMelding {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(L("Volledige melding")).font(.caption).foregroundStyle(.secondary)
                        Text(full).font(.callout.monospaced()).textSelection(.enabled)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.top, 4)
                }
            }
        }
    }

    private func row(_ label: String, _ value: String, mono: Bool = false) -> some View {
        HStack(alignment: .firstTextBaseline) {
            Text(label).foregroundStyle(.secondary)
            Spacer(minLength: 12)
            Text(value)
                .font(mono ? .callout.monospaced() : .callout)
                .multilineTextAlignment(.trailing)
                .textSelection(.enabled)
        }
        .font(.callout)
    }

    // MARK: Weather

    private func weatherCard(_ w: Weer) -> some View {
        Card(title: L("Weer tijdens de melding"), icon: "cloud.sun") {
            HStack(spacing: 18) {
                if let t = w.temp {
                    VStack {
                        Text("\(Int(t.rounded()))°").font(.title.weight(.bold))
                        Text(w.description ?? "").font(.caption).foregroundStyle(.secondary)
                    }
                }
                if let speed = w.windSpeed {
                    VStack(spacing: 4) {
                        Image(systemName: "location.north.fill")
                            .rotationEffect(.degrees((w.windDirection ?? 0) + 180))
                            .foregroundStyle(.secondary)
                        Text(Lf("%lld km/u", Int(speed.rounded()))).font(.callout.weight(.semibold))
                        Text(L("Wind")).font(.caption).foregroundStyle(.secondary)
                    }
                }
                if let clouds = w.clouds {
                    VStack(spacing: 4) {
                        Image(systemName: "cloud.fill").foregroundStyle(.secondary)
                        Text("\(Int(clouds))%").font(.callout.weight(.semibold))
                        Text(L("Bewolking")).font(.caption).foregroundStyle(.secondary)
                    }
                }
                Spacer()
            }
        }
    }
}

// MARK: - Building blocks

struct Card<Content: View>: View {
    let title: String
    let icon: String
    @ViewBuilder var content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Label(title, systemImage: icon)
                .font(.headline)
            content
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.cardBackground, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
    }
}

struct FlowChips: View {
    let items: [String]

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(Array(items.enumerated()), id: \.offset) { _, item in
                    Text(item)
                        .font(.caption.weight(.semibold))
                        .padding(.horizontal, 10).padding(.vertical, 5)
                        .background(Color.secondary.opacity(0.12), in: Capsule())
                }
            }
        }
    }
}

enum MapStyleSetting {
    static func style(for value: String) -> MapStyle {
        switch value {
        case "satellite": return .imagery(elevation: .realistic)
        case "hybrid": return .hybrid(elevation: .realistic, pointsOfInterest: .excludingAll)
        default: return .standard(elevation: .realistic, pointsOfInterest: .excludingAll)
        }
    }
}

extension Color {
    static var groupedBackground: Color {
        #if os(iOS)
        Color(uiColor: .systemGroupedBackground)
        #elseif os(macOS)
        Color(nsColor: .windowBackgroundColor)
        #else
        Color.black
        #endif
    }

    static var cardBackground: Color {
        #if os(iOS)
        Color(uiColor: .secondarySystemGroupedBackground)
        #elseif os(macOS)
        Color(nsColor: .controlBackgroundColor)
        #else
        Color.gray.opacity(0.2)
        #endif
    }
}
