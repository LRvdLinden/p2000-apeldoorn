import SwiftUI
import MapKit
import WeatherKit
#if canImport(UIKit)
import UIKit
#endif

/// NL-Alert, Burgernet or KNMI warning, with the same build-up as a P2000 alert: map with marker (and area) at the top,
/// glass bar, main card with place, status and time, the message, the weather at that moment and nearby P2000 alerts.
struct WaarschuwingDetailView: View {
    let id: String
    @Environment(WaarschuwingStore.self) private var store
    @Environment(AppSettings.self) private var settings
    @Environment(LocationManager.self) private var location
    @Environment(\.dismiss) private var dismiss
    @Environment(\.isPresented) private var isPresented
    @Environment(\.colorScheme) private var colorScheme

    @State private var detail: WaarschuwingDetail?
    @State private var failed = false
    @State private var showEnglish = false
    @State private var copied = false
    @State private var lookAround: MKLookAroundScene?
    @State private var meteo: MeldingDetailView.Meteo?
    @State private var attribution: WeatherAttribution?
    @State private var topSafeArea: CGFloat = 0
    @State private var position: MapCameraPosition = .automatic
    @State private var drieD = false
    @State private var opMij = false
    @State private var kaartGroot = false

    private var w: Waarschuwing? { detail?.waarschuwing ?? store.item(id: id) }

    var body: some View {
        Group {
            if let w {
                page(w)
            } else if failed {
                ContentUnavailableView(L("Waarschuwing niet gevonden"), systemImage: "exclamationmark.triangle",
                                       description: Text(L("Deze waarschuwing is niet meer beschikbaar.")))
            } else {
                ProgressView()
            }
        }
        .navigationTitle(Text(verbatim: w?.label ?? L("Waarschuwing")))
        #if os(iOS)
        .toolbar(w == nil ? .visible : .hidden, for: .navigationBar)
        #endif
        .task(id: id) { await load() }
    }

    private func load() async {
        do {
            detail = try await P2000API.shared.waarschuwing(id: id)
        } catch {
            if store.item(id: id) == nil { failed = true }
        }
    }

    // MARK: - Page

    private func page(_ w: Waarschuwing) -> some View {
        GeometryReader { geo in
            VStack(spacing: 0) {
                mapHeader(w)
                    .frame(height: kaartGroot ? max(geo.size.height - 96, 300) : topSafeArea + min(max(geo.size.width * 0.9, 300), 440))
                    .clipped()
                if kaartGroot {
                    Button { withAnimation(.spring(duration: 0.35)) { kaartGroot = false } } label: {
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(w.titel).font(.headline).lineLimit(1)
                                Text(L("Tik voor de waarschuwing")).font(.subheadline).foregroundStyle(.secondary)
                            }
                            Spacer()
                            Image(systemName: "chevron.up").font(.headline).foregroundStyle(.secondary)
                        }
                        .padding(.horizontal, 20)
                        .frame(maxWidth: .infinity, minHeight: 96, alignment: .leading)
                        .background(Color.detailCard)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                } else {
                    content(w)
                }
            }
        }
        .background(
            GeometryReader { g in
                Color.clear
                    .onAppear { topSafeArea = MeldingDetailView.statusBarInset(g.safeAreaInsets.top, minY: g.frame(in: .global).minY) }
                    .onChange(of: g.frame(in: .global).minY) { _, y in topSafeArea = MeldingDetailView.statusBarInset(g.safeAreaInsets.top, minY: y) }
            }
        )
        .ignoresSafeArea(edges: .top)
        .background(Color.pageBackground)
        .onAppear { position = startPosition(w) }
        .task(id: w.id) { await loadLookAround(w) }
        .task(id: w.id) { await loadWeather(w) }
    }

    private func content(_ w: Waarschuwing) -> some View {
        ScrollView {
            VStack(spacing: 16) {
                if w.bron == .burgernet { notice(L("Burgernet geeft de plaats van de oproep, niet het exacte adres. De marker staat daarom ongeveer.")) }
                if w.bron == .nlalert && w.isActief { notice(L("A-Alerts is aanvullend op NL-Alert. Volg altijd het advies in het NL-Alert-bericht.")) }
                HStack {
                    Text(verbatim: "\(MeldingDetailView.bronNaam(w.bron)) \(w.id.split(separator: ":").last.map(String.init) ?? "")")
                    Spacer()
                    Text(w.statusLabel)
                }
                .font(AppFont.body(12))
                .foregroundStyle(.secondary)
                .padding(.horizontal, 4)
                .padding(.bottom, -6)
                mainCard(w)
                if w.bron == .knmi, w.verwachting != nil || w.advies != nil { knmiCard(w) }
                else if let tekst = w.tekst, !tekst.isEmpty { berichtCard(w, tekst) }
                if let m = meteo { meteoCard(m) }
                meldingenCard(w)
                dataCard(w)
                Text(w.bron == .nlalert
                     ? L("A-Alerts is aanvullend op NL-Alert en vervangt het niet. Een NL-Alert komt ook rechtstreeks op je telefoon binnen. Bel bij nood altijd 112.")
                     : Lf("Bron: %@. Bel bij nood altijd 112.", MeldingDetailView.bronNaam(w.bron)))
                    .font(AppFont.body(12))
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.vertical, 16)
            }
            .padding(16)
            .frame(maxWidth: 760)
            .frame(maxWidth: .infinity)
        }
    }

    // MARK: - Map

    private func coordinate(_ w: Waarschuwing) -> CLLocationCoordinate2D {
        w.coordinate ?? w.rings.first?.first ?? CLLocationCoordinate2D(latitude: Config.center.lat, longitude: Config.center.lon)
    }

    private func startPosition(_ w: Waarschuwing) -> MapCameraPosition {
        let coords = w.rings.flatMap { $0 }
        guard coords.count > 2 else {
            return .region(MKCoordinateRegion(center: coordinate(w), latitudinalMeters: 3000, longitudinalMeters: 3000))
        }
        let rect = coords.map { MKMapRect(origin: MKMapPoint($0), size: MKMapSize(width: 1, height: 1)) }.reduce(MKMapRect.null) { $0.union($1) }
        return .rect(rect.insetBy(dx: -rect.width * 0.15 - 300, dy: -rect.height * 0.15 - 300))
    }

    private var topInset: CGFloat {
        #if os(iOS)
        return topSafeArea + 6
        #else
        return 16
        #endif
    }

    private func mapHeader(_ w: Waarschuwing) -> some View {
        Map(position: $position) {
            ForEach(Array(w.rings.enumerated()), id: \.offset) { _, ring in
                MapPolygon(coordinates: ring)
                    .foregroundStyle(w.color.opacity(0.22))
                    .stroke(w.bron == .nlalert ? Color.orange : w.color, lineWidth: 2)
            }
            if w.bron != .knmi || w.rings.isEmpty {
                Annotation(w.titel, coordinate: coordinate(w), anchor: .bottom) {
                    WaarschuwingMarker(waarschuwing: w, size: 52)
                }
                .annotationTitles(.hidden)
            }
            ForEach((detail?.meldingen ?? []).filter(\.hasCoordinate)) { m in
                Annotation(m.title, coordinate: CLLocationCoordinate2D(latitude: m.lat ?? 0, longitude: m.lon ?? 0), anchor: .bottom) {
                    DienstMarker(dienst: m.dienst, size: 30)
                }
                .annotationTitles(.hidden)
            }
            UserAnnotation()
        }
        .mapStyle(MapStyleSetting.style(for: settings.mapType, pointsOfInterest: true))
        .mapControls { MapCompass() }
        .safeAreaPadding(.top, topSafeArea + 66)
        .overlay(alignment: .top) { topBar(w).padding(.top, topInset) }
        .overlay(alignment: .topLeading) {
            if let lookAround {
                LookAroundPreview(initialScene: lookAround)
                    .frame(width: 130, height: 84)
                    .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(.white.opacity(0.6), lineWidth: 1))
                    .shadow(color: .black.opacity(0.3), radius: 8, y: 3)
                    .padding(.leading, 14)
                    .padding(.top, topInset + 66)
            }
        }
        .overlay(alignment: .topTrailing) {
            VStack(spacing: 10) {
                MapControlButton(symbol: opMij ? "location.fill" : "location", active: opMij, label: L("Toon mij en de waarschuwing")) { toggleOpMij(w) }
                MapControlButton(symbol: "view.3d", text: "3D", active: drieD, label: L("3D-weergave")) { toggle3D(w) }
            }
            .padding(.trailing, 14)
            .padding(.top, topInset + 66)
        }
        .overlay(alignment: .bottomTrailing) {
            MapControlButton(symbol: kaartGroot ? "arrow.down.right.and.arrow.up.left" : "arrow.up.left.and.arrow.down.right",
                             label: kaartGroot ? L("Kaart kleiner") : L("Kaart groter")) {
                withAnimation(.spring(duration: 0.35)) { kaartGroot.toggle() }
            }
            .padding(14)
        }
    }

    private func topBar(_ w: Waarschuwing) -> some View {
        HStack(spacing: 10) {
            if isPresented {
                Button { dismiss() } label: {
                    Image(systemName: "chevron.left").font(.system(size: 18, weight: .semibold)).frame(width: 46, height: 46)
                }
                .buttonStyle(.plain)
                .glassCircle()
                .accessibilityLabel(L("Terug"))
            }
            VStack(spacing: 1) {
                Text(w.plaats ?? L("Gemeente Apeldoorn")).font(.headline).lineLimit(1)
                Text(verbatim: w.kop).font(.footnote).foregroundStyle(.secondary).lineLimit(1)
            }
            .frame(maxWidth: .infinity)
            .padding(.horizontal, 14)
            .frame(height: 50)
            .glassCapsule()
            if let link = w.link, let url = URL(string: link) {
                ShareLink(item: url, subject: Text(verbatim: w.kop), message: Text(verbatim: w.titel)) {
                    Image(systemName: "square.and.arrow.up").font(.system(size: 18, weight: .semibold)).foregroundStyle(Theme.red)
                        .frame(width: 46, height: 46)
                }
                .buttonStyle(.plain)
                .glassCircle()
                .accessibilityLabel(L("Deel"))
            }
        }
        .padding(.horizontal, 14)
    }

    private func toggle3D(_ w: Waarschuwing) {
        drieD.toggle()
        opMij = false
        withAnimation(.easeInOut(duration: 0.6)) {
            position = drieD ? .camera(MapCamera(centerCoordinate: coordinate(w), distance: 1500, heading: 30, pitch: 60)) : startPosition(w)
        }
    }

    private func toggleOpMij(_ w: Waarschuwing) {
        guard !opMij, let me = location.location?.coordinate else {
            opMij = false
            withAnimation(.easeInOut(duration: 0.5)) { position = startPosition(w) }
            if location.location == nil { location.start() }
            return
        }
        opMij = true
        drieD = false
        let points = [MKMapPoint(me), MKMapPoint(coordinate(w))]
        var rect = points.map { MKMapRect(origin: $0, size: MKMapSize(width: 1, height: 1)) }.reduce(MKMapRect.null) { $0.union($1) }
        rect = rect.insetBy(dx: -max(rect.width * 0.35, 600), dy: -max(rect.height * 0.35, 600))
        withAnimation(.easeInOut(duration: 0.6)) { position = .rect(rect) }
    }

    private func loadLookAround(_ w: Waarschuwing) async {
        guard w.bron == .burgernet, w.coordinate != nil else { return }
        lookAround = try? await MKLookAroundSceneRequest(coordinate: coordinate(w)).scene
    }

    // MARK: - Cards

    private func notice(_ text: String) -> some View {
        (Text(L("Let op:")).fontWeight(.semibold).foregroundColor(Theme.red) + Text(" " + text))
            .font(AppFont.body(13))
            .foregroundStyle(Color(light: 0xB91C1C, dark: 0xFCA5A5))
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(14)
            .background(Theme.red.opacity(colorScheme == .dark ? 0.1 : 0.06), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(Theme.red.opacity(0.4)))
    }

    private func mainCard(_ w: Waarschuwing) -> some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack(alignment: .top, spacing: 12) {
                WaarschuwingIcon(waarschuwing: w, size: 32)
                VStack(alignment: .leading, spacing: 3) {
                    Text(verbatim: w.kop).font(AppFont.body(12, .bold)).foregroundStyle(w.bron == .nlalert ? Color.orange : w.color)
                    Text(w.titel).font(AppFont.body(16, .medium)).fixedSize(horizontal: false, vertical: true).textSelection(.enabled)
                }
                Spacer(minLength: 8)
                Button {
                    #if canImport(UIKit)
                    UIPasteboard.general.string = [w.titel, w.tekst, w.link].compactMap { $0 }.joined(separator: "\n\n")
                    #endif
                    withAnimation { copied = true }
                    Task { try? await Task.sleep(for: .seconds(1.5)); withAnimation { copied = false } }
                } label: {
                    Image(systemName: copied ? "checkmark" : "doc.on.doc").font(.system(size: 17)).foregroundStyle(copied ? Theme.online : .secondary)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(L("Kopieer waarschuwing"))
            }
            infoRow("location.fill", Color(hex: 0x3B82F6), w.plaats ?? L("Gemeente Apeldoorn"),
                    w.bron == .knmi || w.bron == .nlalert ? L("Gebied staat op de kaart") : L("Plaats van de oproep"))
            infoRow(w.isBeeindigd ? "checkmark.circle.fill" : "exclamationmark.triangle.fill", w.isBeeindigd ? .gray : Color(hex: 0xDC2626),
                    w.statusLabel, w.soort ?? MeldingDetailView.bronNaam(w.bron))
            TimelineView(.periodic(from: .now, by: 30)) { ctx in
                infoRow("clock.fill", Color(hex: 0xF43F5E),
                        Lf("%@ om %@", w.start.formatted(.dateTime.day().month(.wide).year()), Fmt.time(w.start)),
                        w.isBeeindigd ? (w.einde.map { Lf("Afgelopen om %@", Fmt.time($0)) } ?? L("Afgelopen"))
                                      : (w.einde.map { Lf("Geldig tot %@", Fmt.dayTime($0)) } ?? Fmt.ago(w.start, now: ctx.date)))
            }
            if let d = afstand(w) {
                infoRow("figure.walk", Color(hex: 0x8B5CF6), Fmt.distance(d), inGebied(w) == true ? L("Je bent in het gebied") : L("bij je vandaan"))
            }
            if let link = w.link, let url = URL(string: link) {
                Link(destination: url) {
                    Label(Lf("Bekijk bij %@", MeldingDetailView.bronNaam(w.bron)), systemImage: "safari.fill")
                        .font(AppFont.body(15, .semibold))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                        .foregroundStyle(Color(light: 0x1D4ED8, dark: 0x93C5FD))
                        .background(Color(light: 0xDBEAFE, dark: 0x172554), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                }
            }
        }
        .wCard()
    }

    private func berichtCard(_ w: Waarschuwing, _ tekst: String) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                Text(L("Bericht")).font(AppFont.heading(18))
                Spacer()
                if w.tekstEn != nil {
                    Button(showEnglish ? L("Nederlands") : L("English")) { showEnglish.toggle() }
                        .font(AppFont.body(13, .semibold))
                }
            }
            Text(showEnglish ? (w.tekstEn ?? tekst) : tekst)
                .font(AppFont.body(15)).lineSpacing(4).fixedSize(horizontal: false, vertical: true).textSelection(.enabled)
            if w.bron == .knmi, let uitleg = MeldingDetailView.codeUitleg(w.niveau) {
                Text(uitleg).font(AppFont.body(13)).foregroundStyle(.secondary)
            }
        }
        .wCard()
    }

    /// KNMI: what to expect and what to do, as KNMI writes it per area.
    private func knmiCard(_ w: Waarschuwing) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            if let v = w.verwachting { knmiBlok("exclamationmark.triangle.fill", Waarschuwing.codeColor(w.niveau), L("Wat kun je verwachten?"), v.replacingOccurrences(of: "\n", with: " ")) }
            if let a = w.advies { knmiBlok("checkmark.shield.fill", .accentColor, L("Wat moet je doen?"), a.split(separator: "\n").map { "•  \($0)" }.joined(separator: "\n")) }
            if let p = w.plaats, !p.isEmpty { knmiBlok("map.fill", .secondary, L("Gebied"), p) }
            if let uitleg = MeldingDetailView.codeUitleg(w.niveau) {
                Text(uitleg).font(AppFont.body(13)).foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .wCard()
    }

    private func knmiBlok(_ symbol: String, _ color: Color, _ titel: String, _ tekst: String) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: symbol).font(.system(size: 17, weight: .semibold)).foregroundStyle(color).frame(width: 24).accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 4) {
                Text(titel).font(AppFont.body(15, .semibold))
                Text(tekst).font(AppFont.body(15)).lineSpacing(3).fixedSize(horizontal: false, vertical: true).textSelection(.enabled)
            }
        }
        .accessibilityElement(children: .combine)
    }

    private func meldingenCard(_ w: Waarschuwing) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(Lf("Meldingen in de buurt (%lld)", detail?.meldingen.count ?? 0)).font(AppFont.heading(18))
            if let list = detail?.meldingen, !list.isEmpty {
                ForEach(list) { m in
                    NavigationLink { MeldingDetailView(melding: m) } label: {
                        MeldingRow(melding: m, gelezen: settings.isRead(m))
                    }
                    .buttonStyle(.plain)
                    if m.guid != list.last?.guid { Divider() }
                }
            } else if detail != nil {
                Text(L("Geen P2000-meldingen gevonden in het gebied rond dit tijdstip.")).font(AppFont.body(14)).foregroundStyle(.secondary)
            } else {
                ProgressView().frame(maxWidth: .infinity)
            }
            Text(w.bron == .burgernet
                 ? L("Politiemeldingen in dezelfde plaats rond het tijdstip van de oproep. Dit is een mogelijk verband, geen bevestiging.")
                 : L("P2000-meldingen in het gebied van deze waarschuwing, rond het tijdstip waarop hij werd uitgezonden. Dit is een mogelijk verband, geen bevestiging."))
                .font(AppFont.body(12)).foregroundStyle(.secondary)
        }
        .wCard()
    }

    private func dataCard(_ w: Waarschuwing) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(L("Gegevens")).font(AppFont.heading(18))
            dataItem(L("Bron"), MeldingDetailView.bronNaam(w.bron))
            if let s = w.soort { dataItem(L("Soort"), s) }
            if w.bron == .knmi { dataItem(L("Code"), Waarschuwing.codeLabel(w.niveau)) }
            dataItem(L("Status"), w.statusLabel)
            dataItem(w.bron == .knmi ? L("Geldig vanaf") : L("Uitgezonden"), Fmt.dayTime(w.start))
            if let e = w.einde { dataItem(e < .now ? L("Afgelopen") : L("Geldig tot"), Fmt.dayTime(e)) }
            dataItem(L("Gebied"), w.plaats ?? L("Gemeente Apeldoorn"))
        }
        .wCard()
    }

    private func dataItem(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label).font(AppFont.body(12)).foregroundStyle(.secondary)
            Text(value).font(AppFont.body(15, .medium)).textSelection(.enabled)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.innerCard, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
    }

    private func infoRow(_ symbol: String, _ color: Color, _ title: String, _ subtitle: String) -> some View {
        HStack(spacing: 14) {
            Image(systemName: symbol)
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(.white)
                .frame(width: 36, height: 36)
                .background(color, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
            VStack(alignment: .leading, spacing: 1) {
                Text(title).font(AppFont.body(15, .semibold))
                if !subtitle.isEmpty { Text(subtitle).font(AppFont.body(13)).foregroundStyle(.secondary) }
            }
            Spacer(minLength: 0)
        }
        .accessibilityElement(children: .combine)
    }

    private func afstand(_ w: Waarschuwing) -> Double? {
        guard settings.useLocation, let me = location.location, let c = w.coordinate else { return nil }
        return me.distance(from: CLLocation(latitude: c.latitude, longitude: c.longitude))
    }

    private func inGebied(_ w: Waarschuwing) -> Bool? {
        guard w.gebied != nil, let me = location.location else { return nil }
        return w.contains(lat: me.coordinate.latitude, lon: me.coordinate.longitude)
    }

    // MARK: - Weather at the time and place of the warning (WeatherKit)

    private func meteoCard(_ m: MeldingDetailView.Meteo) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(L("METEO-gegevens")).font(AppFont.heading(18)).padding(.bottom, 10)
            meteoRow("thermometer.medium", L("Temperatuur"), m.feelsLike.map { Lf("Gevoelstemperatuur %lld°C", Int($0.rounded())) }, "\(Int(m.temperature.rounded()))°C")
            if let c = m.clouds { Divider(); meteoRow(m.symbol, L("Bewolking"), nil, "\(Int(c.rounded()))%") }
            if let dir = m.windDirection {
                Divider()
                meteoRow("location.north.fill", L("Windrichting"), Lf("De wind waait vanuit het %@", MeldingDetailView.compass(dir)), MeldingDetailView.compass(dir), rotation: dir + 180)
            }
            if let s = m.windSpeed {
                Divider()
                meteoRow("wind", L("Windsnelheid"), Lf("Windvlagen tot %lld km/h", Int((m.gust ?? s * 1.5).rounded())), "\(Int(s.rounded())) km/h")
            }
            Text(L("Gegevens zijn op basis van tijdstip en plaats van de waarschuwing"))
                .font(AppFont.body(11)).foregroundStyle(.secondary).frame(maxWidth: .infinity).padding(.top, 10)
            HStack(spacing: 8) {
                if let a = attribution {
                    AsyncImage(url: colorScheme == .dark ? a.combinedMarkDarkURL : a.combinedMarkLightURL) { $0.resizable().scaledToFit() }
                        placeholder: { Text(" Weather").font(AppFont.body(11, .semibold, relativeTo: .caption2)) }
                        .frame(height: 12)
                    Link(L("Overige gegevensbronnen"), destination: a.legalPageURL).font(AppFont.body(11, .regular, relativeTo: .caption2))
                } else {
                    Text(" Weather").font(AppFont.body(11, .semibold, relativeTo: .caption2))
                    Link(L("Overige gegevensbronnen"), destination: URL(string: "https://weatherkit.apple.com/legal-attribution.html")!)
                        .font(AppFont.body(11, .regular, relativeTo: .caption2))
                }
            }
            .frame(maxWidth: .infinity)
            .padding(.top, 4)
        }
        .wCard()
    }

    private func meteoRow(_ symbol: String, _ title: String, _ subtitle: String?, _ value: String, rotation: Double = 0) -> some View {
        HStack(spacing: 12) {
            Image(systemName: symbol)
                .symbolRenderingMode(.hierarchical)
                .font(.system(size: 15, weight: .semibold))
                .rotationEffect(.degrees(rotation))
                .foregroundStyle(.white)
                .frame(width: 36, height: 36)
                .background(Color(hex: 0x60A5FA), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
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

    private func loadWeather(_ w: Waarschuwing) async {
        // 1. Our API (WeatherKit via the Worker): the same source as the weather of an alert.
        if let a = await P2000API.shared.waarschuwingWeather(id: w.id), let t = a.temperature {
            meteo = MeldingDetailView.Meteo(temperature: t, feelsLike: a.apparent, clouds: a.cloudCover.map { $0 * 100 },
                                            windDirection: a.windDirection, windSpeed: a.windSpeed, gust: a.windGust,
                                            symbol: MeldingDetailView.symbol(for: a.condition), fromWeatherKit: true)
            attribution = try? await WeatherService.shared.attribution
            return
        }
        // 2. Fallback: WeatherKit in the app itself.
        let c = coordinate(w)
        let moment = min(w.start, .now)
        do {
            let hours = try await WeatherService.shared.weather(for: CLLocation(latitude: c.latitude, longitude: c.longitude),
                                                                including: .hourly(startDate: moment.addingTimeInterval(-3600), endDate: moment.addingTimeInterval(3600)))
            guard let hour = hours.forecast.min(by: { abs($0.date.timeIntervalSince(moment)) < abs($1.date.timeIntervalSince(moment)) }) else { return }
            meteo = MeldingDetailView.Meteo(temperature: hour.temperature.converted(to: .celsius).value,
                                            feelsLike: hour.apparentTemperature.converted(to: .celsius).value,
                                            clouds: hour.cloudCover * 100,
                                            windDirection: hour.wind.direction.converted(to: .degrees).value,
                                            windSpeed: hour.wind.speed.converted(to: .kilometersPerHour).value,
                                            gust: hour.wind.gust?.converted(to: .kilometersPerHour).value,
                                            symbol: hour.symbolName,
                                            fromWeatherKit: true)
            attribution = try? await WeatherService.shared.attribution
        } catch {
            // No weather: the card stays away.
        }
    }
}

extension MeldingDetailView {
    static func bronNaam(_ b: Waarschuwing.Bron) -> String {
        switch b {
        case .nlalert: return "NL-Alert"
        case .burgernet: return "Burgernet"
        case .knmi: return "KNMI"
        }
    }

    static func codeUitleg(_ niveau: String?) -> String? {
        switch niveau {
        case "yellow": return L("Wees alert: het weer kan gevaarlijk zijn.")
        case "orange": return L("Wees voorbereid: grote kans op gevaar, schade en overlast.")
        case "red": return L("Onderneem actie: extreem weer met grote kans op schade en letsel.")
        default: return nil
        }
    }
}

private extension View {
    func wCard() -> some View {
        padding(20)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.detailCard, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    }
}
