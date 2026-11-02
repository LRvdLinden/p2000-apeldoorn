import SwiftUI
import MapKit
import WeatherKit
#if canImport(UIKit)
import UIKit
#elseif canImport(AppKit)
import AppKit
#endif

/// Alert detail – same build-up and look as p2000-apeldoorn.nl/melding/<guid>:
/// big map with Look Around preview, notice, main card, description, capcodes,
/// vehicles, METEO data (WeatherKit) and alert data.
struct MeldingDetailView: View {
    let melding: Melding

    @Environment(MeldingStore.self) private var store
    @Environment(AppSettings.self) private var settings
    @Environment(LocationManager.self) private var location
    @Environment(\.dismiss) private var dismiss
    @Environment(\.isPresented) private var isPresented
    @Environment(\.colorScheme) private var colorScheme

    @State private var lookAround: MKLookAroundScene?
    @State private var meteo: Meteo?
    @State private var attribution: WeatherAttribution?
    @State private var copied = false

    private let mapHeight: CGFloat = 380

    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                mapHeader
                VStack(spacing: 16) {
                    if !hasStreet { notice }
                    incidentLine
                    mainCard
                    descriptionCard
                    if !melding.eenheden.isEmpty { capcodesCard }
                    if !melding.voertuigen.isEmpty { vehiclesCard }
                    if let meteo { meteoCard(meteo) }
                    dataCard
                    footer
                }
                .padding(16)
                .frame(maxWidth: 760)
                .frame(maxWidth: .infinity)
            }
        }
        .ignoresSafeArea(edges: .top)
        .background(Color.pageBackground)
        .navigationTitle(melding.dienst.label)
        #if os(iOS)
        .toolbar(.hidden, for: .navigationBar)
        #endif
        #if os(macOS)
        .toolbar {
            ToolbarItemGroup(placement: .primaryAction) {
                bookmarkButton
                ShareLink(item: melding.shareText) { Label(L("Deel"), systemImage: "square.and.arrow.up") }
            }
        }
        #endif
        .onAppear { store.registerView(melding) }
        .task(id: melding.guid) { await loadLookAround() }
        .task(id: melding.guid) { await loadWeather() }
    }

    // MARK: - Map header

    private var coordinate: CLLocationCoordinate2D {
        CLLocationCoordinate2D(latitude: melding.lat ?? Config.center.lat, longitude: melding.lon ?? Config.center.lon)
    }

    private var hasStreet: Bool {
        guard let loc = melding.locatie?.trimmingCharacters(in: .whitespaces) else { return false }
        return !loc.isEmpty && loc.lowercased() != "onbekend"
    }

    private var mapHeader: some View {
        Map(initialPosition: .region(MKCoordinateRegion(center: coordinate, latitudinalMeters: 1300, longitudinalMeters: 1300))) {
            Annotation(melding.title, coordinate: coordinate, anchor: .bottom) {
                DienstMarker(dienst: melding.dienst, size: 52)
            }
            .annotationTitles(.hidden)
            UserAnnotation()
        }
        .mapStyle(MapStyleSetting.style(for: settings.mapType, pointsOfInterest: true))
        .mapControls {
            MapCompass()
            MapPitchToggle()
        }
        .frame(height: mapHeight)
        .overlay(alignment: .topLeading) {
            VStack(alignment: .leading, spacing: 12) {
                #if os(iOS)
                if isPresented {
                    circleButton("arrow.left", label: L("Terug")) { dismiss() }
                }
                #endif
                if let lookAround {
                    LookAroundPreview(initialScene: lookAround)
                        .frame(width: 140, height: 90)
                        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(.white.opacity(0.6), lineWidth: 1))
                        .shadow(color: .black.opacity(0.3), radius: 8, y: 3)
                        .accessibilityLabel(L("Look Around"))
                }
            }
            .padding(.leading, 16)
            .padding(.top, topInset)
        }
        #if os(iOS)
        .overlay(alignment: .topTrailing) {
            HStack(spacing: 10) {
                circleIcon(isBewaard ? "bookmark.fill" : "bookmark", label: isBewaard ? L("Niet meer bewaren") : L("Bewaar")) {
                    withAnimation { settings.toggleBewaard(melding) }
                }
                ShareLink(item: melding.shareText) {
                    Image(systemName: "square.and.arrow.up")
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundStyle(Theme.red)
                        .frame(width: 46, height: 46)
                        .background(.ultraThinMaterial, in: Circle())
                }
                .accessibilityLabel(L("Deel"))
            }
            .padding(.trailing, 16)
            .padding(.top, topInset)
        }
        #endif
    }

    private var topInset: CGFloat {
        #if os(iOS)
        return 58
        #else
        return 16
        #endif
    }

    private var isBewaard: Bool { settings.bewaard.contains(melding.guid) }

    private var bookmarkButton: some View {
        Button {
            withAnimation { settings.toggleBewaard(melding) }
        } label: {
            Label(isBewaard ? L("Niet meer bewaren") : L("Bewaar"), systemImage: isBewaard ? "bookmark.fill" : "bookmark")
        }
    }

    private func circleButton(_ symbol: String, label: String, action: @escaping () -> Void) -> some View {
        circleIcon(symbol, label: label, action: action)
    }

    private func circleIcon(_ symbol: String, label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.system(size: 17, weight: .semibold))
                .foregroundStyle(Theme.red)
                .frame(width: 46, height: 46)
                .background(.ultraThinMaterial, in: Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }

    private func loadLookAround() async {
        guard melding.hasCoordinate else { return }
        let request = MKLookAroundSceneRequest(coordinate: coordinate)
        lookAround = try? await request.scene
    }

    // MARK: - Notice + incident

    private var notice: some View {
        (Text(L("Let op:")).fontWeight(.semibold).foregroundColor(Theme.red)
         + Text(" " + L("De meldkamer heeft geen straatnaam doorgegeven, hierdoor kunnen we geen exacte locatie tonen.")))
            .font(AppFont.body(13))
            .foregroundStyle(Color(light: 0xB91C1C, dark: 0xFCA5A5))
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(14)
            .background(Theme.red.opacity(colorScheme == .dark ? 0.1 : 0.06), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(Theme.red.opacity(0.4)))
    }

    private var incidentNumber: String {
        String(melding.guid.filter(\.isNumber).suffix(7))
    }

    private var incidentLine: some View {
        HStack {
            Text(Lf("Incident %@", incidentNumber))
            Spacer()
            Label("\(melding.views)x", systemImage: "eye")
        }
        .font(AppFont.body(12))
        .foregroundStyle(.secondary)
        .padding(.horizontal, 4)
        .padding(.bottom, -6)
    }

    // MARK: - Main card

    private var mainCard: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack(alignment: .top, spacing: 12) {
                DienstIcon(dienst: melding.dienst, size: 36)
                Text(melding.title)
                    .font(AppFont.body(18, .semibold))
                    .fixedSize(horizontal: false, vertical: true)
                    .textSelection(.enabled)
                Spacer(minLength: 8)
                Button {
                    copyToClipboard(melding.fullMelding ?? melding.title)
                    withAnimation { copied = true }
                    Task { try? await Task.sleep(for: .seconds(1.5)); withAnimation { copied = false } }
                } label: {
                    Image(systemName: copied ? "checkmark" : "doc.on.doc")
                        .font(.system(size: 17))
                        .foregroundStyle(copied ? Theme.online : .secondary)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(L("Kopieer melding"))
            }

            infoRow(symbol: "location.fill", color: Color(hex: 0x3B82F6),
                    title: melding.stad?.capitalizedPlaats ?? "Apeldoorn",
                    subtitle: hasStreet ? (melding.locatie ?? "") : L("Specifieke locatie niet bekend"))
            infoRow(symbol: "exclamationmark.triangle.fill", color: Color(hex: 0xDC2626),
                    title: melding.categorie ?? melding.dienst.label,
                    subtitle: priorityLine)
            TimelineView(.periodic(from: .now, by: 30)) { ctx in
                infoRow(symbol: "clock.fill", color: Color(hex: 0xF43F5E),
                        title: Lf("%@ om %@", melding.datum.formatted(.dateTime.day().month(.wide).year()),
                                  melding.datum.formatted(.dateTime.hour(.twoDigits(amPM: .omitted)).minute(.twoDigits).second(.twoDigits))),
                        subtitle: Fmt.ago(melding.datum, now: ctx.date))
            }
            if let d = location.distance(to: melding) {
                infoRow(symbol: "figure.walk", color: Color(hex: 0x8B5CF6), title: Fmt.distance(d), subtitle: L("bij je vandaan"))
            }

            Button {
                openInAppleMaps()
            } label: {
                Label(L("Apple Kaarten"), systemImage: "location.north.fill")
                    .font(AppFont.body(15, .semibold))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .foregroundStyle(Color(light: 0x15803D, dark: 0x4ADE80))
                    .background(Color(light: 0xDCFCE7, dark: 0x0F3D24), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            }
            .buttonStyle(.plain)
        }
        .detailCard()
    }

    private var priorityLine: String {
        if let p = melding.prioriteit, !p.isEmpty, p.lowercased() != "onbekend" { return Lf("Prioriteit %@", p) }
        return melding.dienst.label
    }

    private func infoRow(symbol: String, color: Color, title: String, subtitle: String) -> some View {
        HStack(spacing: 14) {
            Image(systemName: symbol)
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(.white)
                .frame(width: 36, height: 36)
                .background(color, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
            VStack(alignment: .leading, spacing: 1) {
                Text(title).font(AppFont.body(16, .semibold))
                if !subtitle.isEmpty {
                    Text(subtitle).font(AppFont.body(12)).foregroundStyle(.secondary)
                }
            }
            Spacer(minLength: 0)
        }
        .accessibilityElement(children: .combine)
    }

    private func openInAppleMaps() {
        let item = MKMapItem(placemark: MKPlacemark(coordinate: coordinate))
        item.name = hasStreet ? "\(melding.locatie ?? ""), \(melding.stad?.capitalizedPlaats ?? "")" : (melding.stad?.capitalizedPlaats ?? "Apeldoorn")
        item.openInMaps(launchOptions: [MKLaunchOptionsMapCenterKey: NSValue(mkCoordinate: coordinate)])
    }

    private func copyToClipboard(_ text: String) {
        #if canImport(UIKit)
        UIPasteboard.general.string = text
        #else
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(text, forType: .string)
        #endif
    }

    // MARK: - Description (same story as the website)

    private var descriptionCard: some View {
        VStack(alignment: .leading, spacing: 14) {
            heading(L("Beschrijving"))
            Text(story)
                .font(AppFont.body(15))
                .lineSpacing(4)
                .fixedSize(horizontal: false, vertical: true)
                .textSelection(.enabled)
        }
        .detailCard()
    }

    private var story: String {
        let stad = melding.stad?.capitalizedPlaats ?? "Apeldoorn"
        let dienst = melding.dienst.label.lowercased()
        let dag = melding.datum.formatted(.dateTime.weekday(.wide).day().month(.wide))
        let wat = melding.categorie ?? melding.title
        let urgent = ["A0", "A1", "A2", "P1"].contains((melding.prioriteit ?? "").uppercased())
        let opdracht = urgent ? L("met spoed ter plaatse") : L("ter plaatse")
        var p1 = Lf("De %@ van %@ is %@ gealarmeerd voor een \"%@\"", dienst, stad, dag, wat)
        if hasStreet, let loc = melding.locatie { p1 += Lf(" op %@", loc) }
        p1 += Lf(" te %@.", stad) + " "
        p1 += Lf("De melding werd om %@ via het P2000 netwerk verzonden naar de %@ van %@, die het verzoek kreeg om %@.",
                 Fmt.time(melding.datum), dienst, stad, opdracht)
        var parts = [p1,
                     Lf("%@ is een plaats in de provincie Gelderland en valt onder de P2000-regio Noord- en Oost-Gelderland.", stad),
                     Lf("De hulpdiensten in %@ reageren onder meer op 112 meldingen die bij deze veiligheidsregio binnenkomen. Via P2000 worden deze 112 meldingen uitgestuurd naar bijvoorbeeld het juiste brandweerkorps, ambulancedienst of de dienstdoende politieagenten.", stad)]
        if let cur = store.maand {
            let prev = store.vorigeMaand
            let brand = (cur.byDienst["brandweer"] ?? 0) + (prev?.byDienst["brandweer"] ?? 0)
            let ambu = (cur.byDienst["ambulance"] ?? 0) + (prev?.byDienst["ambulance"] ?? 0)
            parts.append(Lf("In de afgelopen dertig dagen is de brandweer van %@ %lld keer gealarmeerd en moest de ambulance %lld keer naar een plaats toe.", stad, brand, ambu))
        }
        return parts.joined(separator: "\n\n")
    }

    // MARK: - Capcodes / vehicles

    private var capcodesCard: some View {
        VStack(alignment: .leading, spacing: 14) {
            heading(Lf("Capcodes (%lld)", melding.eenheden.count))
            ForEach(Array(melding.eenheden.enumerated()), id: \.offset) { _, e in
                VStack(alignment: .leading, spacing: 3) {
                    Text(e.naam ?? e.code ?? "–").font(AppFont.body(15, .medium))
                    let sub = [e.type, e.regio].compactMap { $0 }.joined(separator: " / ")
                    if !sub.isEmpty { Text(sub).font(AppFont.body(12)).foregroundStyle(.secondary) }
                    if let code = e.code {
                        Text(code).font(.system(size: 13, weight: .semibold, design: .monospaced)).foregroundStyle(Theme.red)
                    }
                }
                .innerCard()
            }
        }
        .detailCard()
    }

    private var vehiclesCard: some View {
        VStack(alignment: .leading, spacing: 14) {
            heading(Lf("Voertuigen (%lld)", melding.voertuigen.count))
            ForEach(Array(melding.voertuigen.enumerated()), id: \.offset) { _, v in
                VStack(alignment: .leading, spacing: 3) {
                    Text(v.label ?? L("Voertuig")).font(AppFont.body(15, .medium))
                    if let nr = v.nrb ?? v.nra {
                        Text(nr).font(.system(size: 13, weight: .semibold, design: .monospaced)).foregroundStyle(Theme.red)
                    }
                }
                .innerCard()
            }
        }
        .detailCard()
    }

    // MARK: - METEO (WeatherKit)

    struct Meteo {
        var temperature: Double
        var feelsLike: Double?
        var clouds: Double?         // 0…100
        var windDirection: Double?  // degrees
        var windSpeed: Double?      // km/h
        var gust: Double?           // km/h
        var symbol: String = "thermometer.medium"
        var fromWeatherKit = false
    }

    private func meteoCard(_ w: Meteo) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            heading(L("METEO-gegevens"))
                .padding(.bottom, 10)
            meteoRow(symbol: "thermometer.medium", color: Color(hex: 0x60A5FA), title: L("Temperatuur"),
                     subtitle: w.feelsLike.map { Lf("Gevoelstemperatuur %lld°C", Int($0.rounded())) },
                     value: "\(Int(w.temperature.rounded()))°C")
            if let clouds = w.clouds {
                Divider()
                meteoRow(symbol: w.fromWeatherKit ? w.symbol : "cloud.fill", color: Color(hex: 0x60A5FA), title: L("Bewolking"),
                         subtitle: nil, value: "\(Int(clouds.rounded()))%")
            }
            if let dir = w.windDirection {
                Divider()
                meteoRow(symbol: "location.north.fill", color: Color(hex: 0x60A5FA), title: L("Windrichting"),
                         subtitle: Lf("De wind waait vanuit het %@", Self.compass(dir)), value: Self.compass(dir),
                         rotation: dir + 180)
            }
            if let speed = w.windSpeed {
                Divider()
                meteoRow(symbol: "wind", color: Color(hex: 0x60A5FA), title: L("Windsnelheid"),
                         subtitle: Lf("Windvlagen tot %lld km/h", Int((w.gust ?? speed * 1.5).rounded())),
                         value: "\(Int(speed.rounded())) km/h")
            }
            Text(L("Gegevens zijn op basis van incident tijdstip en locatie"))
                .font(AppFont.body(11))
                .foregroundStyle(.secondary)
                .frame(maxWidth: .infinity)
                .padding(.top, 10)
            if w.fromWeatherKit, let attribution { weatherAttribution(attribution) }
        }
        .detailCard()
    }

    private func meteoRow(symbol: String, color: Color, title: String, subtitle: String?, value: String, rotation: Double = 0) -> some View {
        HStack(spacing: 12) {
            Image(systemName: symbol)
                .symbolRenderingMode(.hierarchical)
                .font(.system(size: 15, weight: .semibold))
                .rotationEffect(.degrees(rotation))
                .foregroundStyle(.white)
                .frame(width: 36, height: 36)
                .background(color, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
            VStack(alignment: .leading, spacing: 1) {
                Text(title).font(AppFont.body(14, .semibold))
                if let subtitle { Text(subtitle).font(AppFont.body(12)).foregroundStyle(.secondary) }
            }
            Spacer()
            Text(value).font(AppFont.body(14, .semibold)).foregroundStyle(.secondary)
        }
        .padding(.vertical, 8)
        .accessibilityElement(children: .combine)
    }

    /// Apple requires the Weather mark and a link to the legal sources when showing WeatherKit data.
    private func weatherAttribution(_ a: WeatherAttribution) -> some View {
        HStack(spacing: 8) {
            AsyncImage(url: colorScheme == .dark ? a.combinedMarkDarkURL : a.combinedMarkLightURL) { image in
                image.resizable().scaledToFit()
            } placeholder: { Text(" Weather").font(.caption2.weight(.semibold)) }
            .frame(height: 12)
            Link(L("Overige gegevensbronnen"), destination: a.legalPageURL)
                .font(.caption2)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 4)
    }

    static func compass(_ degrees: Double) -> String {
        let d = (degrees.truncatingRemainder(dividingBy: 360) + 360).truncatingRemainder(dividingBy: 360)
        switch d {
        case 337.5..., ..<22.5: return L("Noorden")
        case 22.5..<67.5: return L("Noordoosten")
        case 67.5..<112.5: return L("Oosten")
        case 112.5..<157.5: return L("Zuidoosten")
        case 157.5..<202.5: return L("Zuiden")
        case 202.5..<247.5: return L("Zuidwesten")
        case 247.5..<292.5: return L("Westen")
        default: return L("Noordwesten")
        }
    }

    /// WeatherKit (historical hourly at the alert's time and place); falls back to the website's stored weather.
    private func loadWeather() async {
        if let w = melding.weather, let t = w.temp {
            meteo = Meteo(temperature: t, feelsLike: nil, clouds: w.clouds, windDirection: w.windDirection,
                          windSpeed: w.windSpeed, gust: nil)
        }
        let place = CLLocation(latitude: coordinate.latitude, longitude: coordinate.longitude)
        let start = melding.datum.addingTimeInterval(-3600)
        let end = melding.datum.addingTimeInterval(3600)
        do {
            let hours = try await WeatherService.shared.weather(for: place, including: .hourly(startDate: start, endDate: end))
            guard let hour = hours.forecast.min(by: { abs($0.date.timeIntervalSince(melding.datum)) < abs($1.date.timeIntervalSince(melding.datum)) }) else { return }
            meteo = Meteo(temperature: hour.temperature.converted(to: .celsius).value,
                          feelsLike: hour.apparentTemperature.converted(to: .celsius).value,
                          clouds: hour.cloudCover * 100,
                          windDirection: hour.wind.direction.converted(to: .degrees).value,
                          windSpeed: hour.wind.speed.converted(to: .kilometersPerHour).value,
                          gust: hour.wind.gust?.converted(to: .kilometersPerHour).value,
                          symbol: hour.symbolName,
                          fromWeatherKit: true)
            attribution = try? await WeatherService.shared.attribution
        } catch {
            // Keep the Base44 weather (if any).
        }
    }

    // MARK: - Alert data

    private var dataCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            heading(L("Meldinggegevens"))
                .padding(.bottom, 2)
            if let p = melding.prioriteit, !p.isEmpty { dataItem(L("Prioriteit"), p) }
            if let c = melding.categorie { dataItem(L("Categorie"), c) }
            if let r = melding.regio { dataItem(L("Regio"), r) }
            dataItem(L("Provincie"), melding.provincie ?? "Gelderland")
            if let g = melding.grip { dataItem(L("GRIP"), g) }
            if let o = melding.opschaling { dataItem(L("Opschaling"), o) }
        }
        .detailCard()
    }

    private func dataItem(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label).font(AppFont.body(12)).foregroundStyle(.secondary)
            Text(value).font(AppFont.body(15, .medium)).textSelection(.enabled)
        }
        .innerCard()
    }

    // MARK: - Footer

    private var footer: some View {
        VStack(spacing: 14) {
            Link(destination: Config.source) { Text(L("Bron: p2000.page")) }
                .foregroundStyle(.secondary)
            HStack(spacing: 16) {
                Link(destination: Config.whatsapp) {
                    Image(systemName: "message").frame(width: 46, height: 46)
                        .background(Color.innerCard, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                }
                .accessibilityLabel(L("WhatsApp-groep"))
                Link(destination: Config.facebook) {
                    Text("f").font(.system(size: 20, weight: .bold)).frame(width: 46, height: 46)
                        .background(Color.innerCard, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                }
                .accessibilityLabel("Facebook")
            }
            .foregroundStyle(.primary)
            HStack(spacing: 4) {
                Text("© 2026 P2000 Apeldoorn. All rights reserved. | Made & Powered by")
                Link("PixelForges", destination: Config.pixelForges).foregroundStyle(Theme.red)
            }
            .multilineTextAlignment(.center)
        }
        .font(AppFont.body(12))
        .foregroundStyle(.secondary)
        .padding(.vertical, 20)
    }

    private func heading(_ text: String) -> some View {
        Text(text).font(AppFont.heading(21))
    }
}

// MARK: - Styling

private extension View {
    func detailCard() -> some View {
        padding(20)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.detailCard, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    }

    func innerCard() -> some View {
        padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.innerCard, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
    }
}

/// Simple card used by the statistics screen.
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

enum MapStyleSetting {
    static func style(for value: String, pointsOfInterest: Bool = false) -> MapStyle {
        let poi: PointOfInterestCategories = pointsOfInterest ? .all : .excludingAll
        switch value {
        case "satellite": return .imagery(elevation: .realistic)
        case "hybrid": return .hybrid(elevation: .realistic, pointsOfInterest: poi)
        default: return .standard(elevation: .realistic, pointsOfInterest: poi)
        }
    }
}

extension Color {
    /// Website colours: #0A0A0A page and slate-900 cards in dark mode.
    static let pageBackground = Color(light: 0xF1F5F9, dark: 0x0A0A0A)
    static let detailCard = Color(light: 0xFFFFFF, dark: 0x0F172A)
    static let innerCard = Color(light: 0xF1F5F9, dark: 0x1E293B)

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
