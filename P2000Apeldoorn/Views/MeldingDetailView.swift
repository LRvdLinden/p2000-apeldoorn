import SwiftUI
import MapKit
import WeatherKit
#if canImport(UIKit)
import UIKit
#elseif canImport(AppKit)
import AppKit
#endif

/// Alert detail – same build-up and look as a-alerts.nl/melding/<guid>:
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
    @State private var topSafeArea: CGFloat = 0
    @State private var position: MapCameraPosition = .automatic
    @State private var drieD = false
    @State private var opMij = false
    @State private var kaartGroot = false
    @State private var toonRoute = false
    @State private var toonDelen = false
    @State private var kazerneRoutes: [KazerneRoute] = []
    @State private var helis = HeliStore.shared
    /// Route of the alert's helicopter this flight (worker trail), drawn behind the live marker.
    @State private var heliSpoor = HeliSpoorStore()
    @State private var nu = Date.now
    private var heliRelevant: Bool { HeliKoppeling.relevant(melding) }
    /// The Lifeliner/Zulu of this alert, live (nil when not in the air or not seen).
    private var liveHeli: Helikopter? { heliRelevant ? HeliKoppeling.heli(voor: melding, in: helis.items) : nil }

    /// Visible map below the status bar: close to square (width × 0.9), at most 440 pt.
    private func mapHeight(_ width: CGFloat) -> CGFloat { min(max(width * 0.9, 300), 440) }

    var body: some View {
        GeometryReader { geo in
            VStack(spacing: 0) {
                mapHeader
                    .frame(height: kaartGroot ? max(geo.size.height - 96, 300) : topSafeArea + mapHeight(geo.size.width))
                    .clipped()
                if kaartGroot {
                    kaartGrootBalk
                } else {
                    content
                }
            }
        }
        .background(
            GeometryReader { g in
                Color.clear
                    .onAppear { topSafeArea = Self.statusBarInset(g.safeAreaInsets.top, minY: g.frame(in: .global).minY) }
                    .onChange(of: g.safeAreaInsets.top) { _, v in topSafeArea = Self.statusBarInset(v, minY: g.frame(in: .global).minY) }
                    .onChange(of: g.frame(in: .global).minY) { _, y in topSafeArea = Self.statusBarInset(g.safeAreaInsets.top, minY: y) }
            }
        )
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
                Button { toonDelen = true } label: { Label(L("Deel"), systemImage: "square.and.arrow.up") }
            }
        }
        #endif
        .sheet(isPresented: $toonRoute) {
            RouteSheet(melding: melding)
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
        }
        .sheet(isPresented: $toonDelen) {
            DeelSheet(melding: melding)
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
        }
        .onAppear {
            position = .region(startRegion)
            store.registerView(melding)
            settings.markRead(melding)
        }
        .task(id: melding.guid) { await loadLookAround() }
        .task(id: melding.guid) {
            kazerneRoutes = await Aanrijtijd.routes(voor: melding)
            if !kazerneRoutes.isEmpty || liveHeli != nil, !drieD, !opMij { withAnimation(.easeInOut(duration: 0.6)) { position = .rect(routeRect) } }
        }
        .task(id: melding.guid) { await loadWeather() }
        .onAppear { if heliRelevant { helis.start() } }
        .onDisappear { if heliRelevant { helis.stop() }; heliSpoor.volg(nil) }
        .onChange(of: liveHeli?.id, initial: true) { _, id in heliSpoor.volg(id) }
        .onReceive(Timer.publish(every: 2, on: .main, in: .common).autoconnect()) { t in
            guard let h = liveHeli, !h.opGrond else { return }
            withAnimation(.linear(duration: 2)) { nu = t }
        }
        .onChange(of: liveHeli?.id) { _, id in
            // First position of the helicopter: show it together with the alert.
            guard id != nil, !drieD, !opMij else { return }
            withAnimation(.easeInOut(duration: 0.6)) { position = .rect(routeRect) }
        }
    }

    private var content: some View {
        ScrollViewReader { proxy in
        ScrollView {
            VStack(spacing: 0) {
                VStack(spacing: 16) {
                    if !hasStreet { notice }
                    incidentLine
                    mainCard
                    descriptionCard
                    if let meteo { meteoCard(meteo).id("meteo") }
                    if heliRelevant {
                        HeliLiveKaart(melding: melding, heli: liveHeli) { id in Router.shared.volg(heli: id); dismiss() }
                    }
                    GealarmeerdeKazernesKaart(routes: kazerneRoutes)
                    VerloopKaart(melding: melding)
                    GerelateerdeWaarschuwingen(melding: melding)
                    if !melding.eenheden.isEmpty { capcodesCard }
                    if !melding.voertuigen.isEmpty { vehiclesCard }
                    if let reden = settings.geenPushReden(melding) { geenPushCard(reden) }
                    dataCard
                    footer.id("einde")
                }
                .padding(16)
                .frame(maxWidth: 760)
                .frame(maxWidth: .infinity)
            }
        }
        #if DEBUG
        .task {
            // Screenshots/diagnosis: -AAlertsScrollEnd YES scrolls to the end of the page.
            guard UserDefaults.standard.bool(forKey: "AAlertsScrollEnd") else { return }
            try? await Task.sleep(for: .seconds(14))
            withAnimation { proxy.scrollTo(meteo == nil ? "einde" : "meteo", anchor: .center) }
        }
        #endif
        }
    }

    /// Enlarged map: a small bar at the bottom brings the alert back.
    private var kaartGrootBalk: some View {
        Button {
            withAnimation(.spring(duration: 0.35)) { kaartGroot = false }
        } label: {
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(melding.title).font(.headline).lineLimit(1)
                    Text(L("Veeg omhoog of tik voor de melding")).font(.subheadline).foregroundStyle(.secondary)
                }
                Spacer()
                Image(systemName: "chevron.up").font(.headline).foregroundStyle(.secondary)
            }
            .padding(.horizontal, 20)
            .frame(maxWidth: .infinity, minHeight: 96, alignment: .leading)
            .background(Color.detailCard)
            .overlay(alignment: .top) { Capsule().fill(.secondary.opacity(0.4)).frame(width: 40, height: 5).padding(.top, 8) }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .gesture(DragGesture(minimumDistance: 15).onEnded { v in
            if v.translation.height < -20 { withAnimation(.spring(duration: 0.35)) { kaartGroot = false } }
        })
    }

    // MARK: - Map header

    private var coordinate: CLLocationCoordinate2D {
        CLLocationCoordinate2D(latitude: melding.lat ?? Config.center.lat, longitude: melding.lon ?? Config.center.lon)
    }

    private var hasStreet: Bool { melding.hasStreet }

    private var startRegion: MKCoordinateRegion {
        let meters: CLLocationDistance = hasStreet ? 1300 : 3500
        return MKCoordinateRegion(center: coordinate, latitudinalMeters: meters, longitudinalMeters: meters)
    }

    private var mapHeader: some View {
        Map(position: $position) {
            kazerneLaag
            heliLaag
            Annotation(melding.title, coordinate: coordinate, anchor: .bottom) {
                DienstMarker(dienst: melding.dienst, size: 52)
            }
            .annotationTitles(.hidden)
            UserAnnotation()
        }
        .mapStyle(MapStyleSetting.style(for: settings.mapType, pointsOfInterest: true))
        .mapControls { MapCompass() }
        .safeAreaPadding(.top, topSafeArea + 66)
        .overlay(alignment: .top) {
            DetailTopBar(titel: melding.plaatsNaam, subtitel: melding.straatTekst, showsBack: showsBack, isBewaard: isBewaard,
                         onBack: { dismiss() }, onRoute: { toonRoute = true },
                         onBewaar: { withAnimation { settings.toggleBewaard(melding) } }, onShare: { toonDelen = true })
                .padding(.top, topInset)
        }
        .overlay(alignment: .topLeading) {
            if let lookAround {
                LookAroundPreview(initialScene: lookAround)
                    .frame(width: 130, height: 84)
                    .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(.white.opacity(0.6), lineWidth: 1))
                    .shadow(color: .black.opacity(0.3), radius: 8, y: 3)
                    .accessibilityLabel(L("Look Around"))
                    .padding(.leading, 14)
                    .padding(.top, topInset + 66)
            }
        }
        .overlay(alignment: .topTrailing) {
            VStack(spacing: 10) {
                MapControlButton(symbol: opMij ? "location.fill" : "location", active: opMij, label: L("Toon mij en de melding")) { toggleOpMij() }
                MapControlButton(symbol: "view.3d", text: "3D", active: drieD, label: L("3D-weergave")) { toggle3D() }
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

    /// Dashed routes from the alarmed stations, and the stations themselves.
    @MapContentBuilder private var kazerneLaag: some MapContent {
        ForEach(kazerneRoutes) { r in
            if let line = r.polyline {
                MapPolyline(line)
                    .stroke(r.kazerne.dienst.color, style: StrokeStyle(lineWidth: 2.5, lineCap: .round, dash: [7, 6]))
            }
        }
        ForEach(kazerneRoutes) { r in
            Annotation(r.kazerne.naam, coordinate: r.kazerne.coordinate, anchor: .center) {
                KazerneIcon(soort: r.kazerne.soort, size: 28)
            }
            .annotationTitles(.hidden)
        }
    }

    /// The Lifeliner/Zulu of this alert, live, with a dashed line to the scene.
    @MapContentBuilder private var heliLaag: some MapContent {
        if let h = liveHeli {
            let gevlogen = heliSpoor.heliID == h.id ? heliSpoor.coordinates(live: h.geschat(op: nu)) : []
            if gevlogen.count >= 2 {
                MapPolyline(coordinates: gevlogen)
                    .stroke(h.color, style: StrokeStyle(lineWidth: 3.5, lineCap: .round, lineJoin: .round))
            }
            MapPolyline(coordinates: [h.geschat(op: nu), coordinate])
                .stroke(h.color, style: StrokeStyle(lineWidth: 3, lineCap: .round, dash: [4, 6]))
            Annotation(h.naam, coordinate: h.geschat(op: nu), anchor: .center) {
                HeliMarker(heli: h, size: 22)
                    .onTapGesture { Router.shared.volg(heli: h.id); dismiss() }
            }
            .annotationTitles(.hidden)
        }
    }

    /// The alert, its stations and its helicopter together in view.
    private var routeRect: MKMapRect {
        let pts = [MKMapPoint(coordinate)] + kazerneRoutes.map { MKMapPoint($0.kazerne.coordinate) } + (liveHeli.map { [MKMapPoint($0.coordinate)] } ?? [])
        var rect = pts.map { MKMapRect(origin: $0, size: MKMapSize(width: 1, height: 1)) }.reduce(MKMapRect.null) { $0.union($1) }
        rect = rect.insetBy(dx: -max(rect.width * 0.3, 500), dy: -max(rect.height * 0.3, 500))
        return rect
    }

    private var showsBack: Bool {
        #if os(iOS)
        return isPresented
        #else
        return false
        #endif
    }

    private func toggle3D() {
        drieD.toggle()
        opMij = false
        withAnimation(.easeInOut(duration: 0.6)) {
            position = drieD
                ? .camera(MapCamera(centerCoordinate: coordinate, distance: 900, heading: 30, pitch: 65))
                : (kazerneRoutes.isEmpty && liveHeli == nil ? .region(startRegion) : .rect(routeRect))
        }
    }

    /// Shows the alert and your own position together (or back to the alert).
    private func toggleOpMij() {
        guard !opMij, let me = location.location?.coordinate else {
            opMij = false
            withAnimation(.easeInOut(duration: 0.5)) { position = .region(startRegion) }
            if location.location == nil { location.start() }
            return
        }
        opMij = true
        drieD = false
        let points = [MKMapPoint(me), MKMapPoint(coordinate)]
        var rect = points.map { MKMapRect(origin: $0, size: MKMapSize(width: 1, height: 1)) }.reduce(MKMapRect.null) { $0.union($1) }
        rect = rect.insetBy(dx: -max(rect.width * 0.35, 600), dy: -max(rect.height * 0.35, 600))
        withAnimation(.easeInOut(duration: 0.6)) { position = .rect(rect) }
    }

    /// The measured inset reads 0 once the view ignores the top safe area. The window still knows the status bar:
    /// only the part of it that overlaps this view counts (none in a sheet that starts lower on screen).
    static func statusBarInset(_ measured: CGFloat, minY: CGFloat) -> CGFloat {
        #if os(iOS)
        let window = UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap(\.windows)
            .first(where: \.isKeyWindow)
        return max(measured, (window?.safeAreaInsets.top ?? 0) - max(minY, 0))
        #else
        return measured
        #endif
    }

    /// Just below the status bar (full screen) or the top edge of the sheet: the real safe area plus a small margin.
    private var topInset: CGFloat {
        #if os(iOS)
        return topSafeArea + 6
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
                DienstIcon(dienst: melding.dienst, size: 32)
                Text(melding.title)
                    .font(AppFont.body(16, .medium))
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
                toonRoute = true
            } label: {
                Label(L("Route naar incident"), systemImage: "arrow.triangle.turn.up.right.diamond.fill")
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
                Text(title).font(AppFont.body(15, .semibold))
                if !subtitle.isEmpty {
                    Text(subtitle).font(AppFont.body(13)).foregroundStyle(.secondary)
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
        let today = store.statsVandaag, yesterday = store.statsGisteren
        if today.totaal + yesterday.totaal > 0 {
            parts.append(Lf("Vandaag is de brandweer %lld keer en de ambulance %lld keer gealarmeerd in gem. Apeldoorn; gisteren waren dat %lld en %lld keer.",
                            today.perDienst[.brandweer] ?? 0, today.perDienst[.ambulance] ?? 0,
                            yesterday.perDienst[.brandweer] ?? 0, yesterday.perDienst[.ambulance] ?? 0))
        }
        return parts.joined(separator: "\n\n")
    }

    /// Why this device got no push for this alert (it is in the list, but not in your notifications).
    private func geenPushCard(_ reden: String) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: "bell.slash.fill").font(.system(size: 18, weight: .semibold)).foregroundStyle(.secondary).frame(width: 26)
            VStack(alignment: .leading, spacing: 4) {
                Text(L("Geen pushmelding op dit toestel")).font(AppFont.body(15, .semibold))
                Text(reden).font(AppFont.body(14)).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
                Text(L("De melding staat wel in de lijst. Pas je meldingen aan in Instellingen › Meldingen.")).font(AppFont.body(12)).foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .detailCard()
    }

    // MARK: - Capcodes / vehicles

    private var capcodesCard: some View {
        VStack(alignment: .leading, spacing: 14) {
            heading(Lf("Capcodes (%lld)", melding.eenheden.count))
            Text(L("Tik op de ster om een eenheid te volgen. Je krijgt dan ook meldingen van die capcode buiten je plaatsen en straal."))
                .font(AppFont.body(12)).foregroundStyle(.secondary)
            ForEach(Array(melding.eenheden.enumerated()), id: \.offset) { _, e in
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 3) {
                        Text(e.naam ?? e.code ?? "–").font(AppFont.body(15, .medium))
                        let sub = [e.type, e.regio].compactMap { $0 }.joined(separator: " / ")
                        if !sub.isEmpty { Text(sub).font(AppFont.body(12)).foregroundStyle(.secondary) }
                        if let code = e.code {
                            Text(code).font(.system(size: 13, weight: .semibold, design: .monospaced)).foregroundStyle(Theme.red)
                        }
                    }
                    Spacer(minLength: 8)
                    // Star: follow this unit, also outside your places and radius.
                    if let code = e.code {
                        let volgt = settings.volgt(capcode: code)
                        Button {
                            settings.toggleVolg(capcode: code, naam: e.naam)
                        } label: {
                            Image(systemName: volgt ? "star.fill" : "star").font(.system(size: 18, weight: .semibold))
                                .foregroundStyle(volgt ? Color.yellow : Color.secondary).frame(width: 40, height: 40)
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(volgt ? L("Niet meer volgen") : L("Volg deze capcode"))
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
            if w.fromWeatherKit {
                if let attribution {
                    weatherAttribution(attribution)
                } else {
                    // Attribution could not be loaded from WeatherKit in the app: show the required mark and link anyway.
                    HStack(spacing: 8) {
                        Text(" Weather").font(AppFont.body(11, .semibold, relativeTo: .caption2))
                        Link(L("Overige gegevensbronnen"), destination: URL(string: "https://weatherkit.apple.com/legal-attribution.html")!)
                            .font(AppFont.body(11, .regular, relativeTo: .caption2))
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.top, 4)
                }
            }
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
            } placeholder: { Text(" Weather").font(AppFont.body(11, .semibold, relativeTo: .caption2)) }
            .frame(height: 12)
            Link(L("Overige gegevensbronnen"), destination: a.legalPageURL)
                .font(AppFont.body(11, .regular, relativeTo: .caption2))
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 4)
    }

    /// SF Symbol for a WeatherKit condition code from the API.
    static func symbol(for condition: String?) -> String {
        switch condition ?? "" {
        case "Clear", "MostlyClear", "Hot": return "sun.max.fill"
        case "PartlyCloudy": return "cloud.sun.fill"
        case "MostlyCloudy", "Cloudy": return "cloud.fill"
        case "Foggy", "Haze", "Smoky": return "cloud.fog.fill"
        case "Breezy", "Windy": return "wind"
        case "Drizzle", "FreezingDrizzle": return "cloud.drizzle.fill"
        case "Rain", "FreezingRain": return "cloud.rain.fill"
        case "HeavyRain": return "cloud.heavyrain.fill"
        case "SunShowers": return "cloud.sun.rain.fill"
        case "ScatteredThunderstorms", "IsolatedThunderstorms", "Thunderstorms", "StrongStorms": return "cloud.bolt.rain.fill"
        case "Flurries", "Snow", "HeavySnow", "BlowingSnow": return "cloud.snow.fill"
        case "Sleet", "MixedRainAndSnow", "WintryMix": return "cloud.sleet.fill"
        case "Hail": return "cloud.hail.fill"
        case "Frigid": return "thermometer.snowflake"
        default: return "cloud.fill"
        }
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

    /// WeatherKit (historical hourly at the alert's time and place); falls back to weather data in the alert, if any.
    private func loadWeather() async {
        if let w = melding.weather, let t = w.temp {
            meteo = Meteo(temperature: t, feelsLike: nil, clouds: w.clouds, windDirection: w.windDirection,
                          windSpeed: w.windSpeed, gust: nil)
        }
        // 1. Our API (WeatherKit REST via the Worker): the same weather as the website and Apple TV.
        if let w = await P2000API.shared.weather(guid: melding.guid), let t = w.temperature {
            meteo = Meteo(temperature: t,
                          feelsLike: w.apparent,
                          clouds: w.cloudCover.map { $0 * 100 },
                          windDirection: w.windDirection,
                          windSpeed: w.windSpeed,
                          gust: w.windGust,
                          symbol: Self.symbol(for: w.condition),
                          fromWeatherKit: true)
            attribution = try? await WeatherService.shared.attribution
            return
        }
        // 2. Fallback: WeatherKit in the app itself.
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
            // Keep the weather that came with the alert (if any).
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
            HStack(spacing: 16) {
                Link(destination: Config.whatsapp) {
                    Image(systemName: "message").frame(width: 46, height: 46)
                        .background(Color.innerCard, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                }
                .accessibilityLabel(L("WhatsApp-groep"))
            }
            .foregroundStyle(.primary)
            HStack(spacing: 4) {
                Text(verbatim: "© \(Calendar.current.component(.year, from: .now)) A-Alerts. All rights reserved. | Made & Powered by")
                Link("PixelForges", destination: Config.pixelForges).foregroundStyle(Theme.red)
            }
            .multilineTextAlignment(.center)
        }
        .font(AppFont.body(12))
        .foregroundStyle(.secondary)
        .padding(.vertical, 20)
    }

    private func heading(_ text: String) -> some View {
        Text(text).font(AppFont.heading(18))
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
                .font(AppFont.heading(18, relativeTo: .headline))
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
