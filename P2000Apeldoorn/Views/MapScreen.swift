import SwiftUI
import MapKit

/// "Kaart": recent alerts with the website's marker pins, plus layers for NL-Alert, Burgernet,
/// KNMI areas, the working-area border, stations and live helicopters (each can be switched on or off).
struct MapScreen: View {
    @Environment(MeldingStore.self) private var store
    @Environment(AppSettings.self) private var settings
    @Environment(WaarschuwingStore.self) private var waarschuwingen

    enum Range: Int, CaseIterable, Identifiable {
        case uur6 = 6, uur24 = 24, dagen7 = 168
        var id: Int { rawValue }
        var label: String {
            switch self {
            case .uur6: return L("6 uur")
            case .uur24: return L("24 uur")
            case .dagen7: return L("7 dagen")
            }
        }
    }

    @State private var range: Range = .uur24
    @State private var selected: Melding?
    @State private var selectedCluster: PlaatsCluster?
    @State private var selectedHeli: Helikopter.ID?
    @State private var selectedKazerne: Kazerne?
    @State private var openedWaarschuwing: WaarschuwingRef?
    @State private var position: MapCameraPosition = .region(MapScreen.apeldoorn)
    @State private var visibleDiensten: Set<Dienst> = Set(Dienst.selectable)
    @State private var showLagen = false
    @State private var helis = HeliStore.shared
    @State private var volgen = false

    static let apeldoorn = MKCoordinateRegion(center: CLLocationCoordinate2D(latitude: Config.center.lat, longitude: Config.center.lon),
                                              span: MKCoordinateSpan(latitudeDelta: 0.15, longitudeDelta: 0.15))

    private var cutoff: Date { Date.now.addingTimeInterval(-Double(range.rawValue) * 3600) }

    /// Alerts with a street get their own pin; alerts with only a town name are grouped into one marker per town.
    private var layout: (pins: [MapPin], clusters: [PlaatsCluster]) {
        guard settings.laag(.p2000) else { return ([], []) }
        let cutoff = cutoff
        return MapLayout.build(store.meldingen.filter {
            $0.datum >= cutoff
                && (visibleDiensten.contains($0.dienst) || !Dienst.selectable.contains($0.dienst))
                && settings.matchesList($0)
        })
    }

    /// NL-Alert and Burgernet within the period (or still active), KNMI while it applies.
    private var zichtbareWaarschuwingen: [Waarschuwing] {
        let cutoff = cutoff
        return waarschuwingen.items.filter { w in
            switch w.bron {
            case .nlalert: guard settings.laag(.nlalert) else { return false }
            case .burgernet: guard settings.laag(.burgernet) else { return false }
            case .knmi: guard settings.laag(.knmi), !w.isBeeindigd else { return false }
            }
            guard !w.isBeeindigd || (w.einde ?? w.start) >= cutoff else { return false }
            return settings.matchesList(w)
        }
    }

    private var heli: Helikopter? { selectedHeli.flatMap { id in helis.items.first { $0.id == id } } }

    /// "Volg Lifeliner 3 op de kaart" from an alert: helicopter layer on, select it and follow it.
    private func volgGevraagd() {
        guard let id = Router.shared.volgHeli else { return }
        Router.shared.volgHeli = nil
        if !settings.laag(.helikopters) { settings.setLaag(.helikopters, true) }
        selected = nil; selectedKazerne = nil
        selectedHeli = id
        volgen = true
        if let h = helis.items.first(where: { $0.id == id }) {
            withAnimation { position = .region(MKCoordinateRegion(center: h.coordinate, latitudinalMeters: 15000, longitudinalMeters: 15000)) }
        } else {
            Task { await helis.refresh(); if let h = helis.items.first(where: { $0.id == id }) { withAnimation { position = .region(MKCoordinateRegion(center: h.coordinate, latitudinalMeters: 15000, longitudinalMeters: 15000)) } } }
        }
    }

    var body: some View {
        NavigationStack {
            let groups = layout
            let ws = zichtbareWaarschuwingen
            Map(position: $position) {
                werkgebiedLaag
                gebiedenLaag(ws)
                kazernesLaag
                meldingenLaag(groups)
                waarschuwingMarkers(ws)
                radiusLaag
                helikoptersLaag
                UserAnnotation()
            }
            .mapStyle(MapStyleSetting.style(for: settings.mapType))
            .mapControls {
                MapCompass()
                MapScaleView()
                MapUserLocationButton()
            }
            .safeAreaInset(edge: .top) { controls }
            .safeAreaInset(edge: .bottom) { onderkaart }
            .sheet(item: $selectedCluster) { cluster in
                ClusterSheet(cluster: cluster)
                    .presentationDetents([.medium, .large])
            }
            .sheet(item: $openedWaarschuwing) { ref in
                NavigationStack { WaarschuwingDetailView(id: ref.id) }
            }
            .sheet(isPresented: $showLagen) {
                KaartLagenView()
                    .presentationDetents([.medium, .large])
            }
            .navigationTitle(L("Kaart"))
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(.visible, for: .navigationBar)
            #endif
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button { showLagen = true } label: {
                        Label(L("Kaartlagen"), systemImage: "square.3.layers.3d")
                    }
                }
                ToolbarItem(placement: .primaryAction) {
                    Menu {
                        Picker(L("Kaarttype"), selection: Bindable(settings).mapType) {
                            Text(L("Standaard")).tag("standard")
                            Text(L("Satelliet")).tag("satellite")
                            Text(L("Hybride")).tag("hybrid")
                        }
                        Button {
                            withAnimation { position = .region(Self.apeldoorn) }
                        } label: {
                            Label(L("Terug naar Apeldoorn"), systemImage: "scope")
                        }
                    } label: {
                        Label(L("Kaartopties"), systemImage: "map")
                    }
                }
            }
            .onAppear { if settings.laag(.helikopters) { helis.start() }; volgGevraagd() }
            .onChange(of: Router.shared.volgHeli) { _, _ in volgGevraagd() }
            // Following a helicopter: the camera moves along with every new position, until the user moves the map.
            .onChange(of: heli?.lat) { _, _ in
                guard volgen, let h = heli else { return }
                withAnimation(.easeInOut(duration: 1)) { position = .region(MKCoordinateRegion(center: h.coordinate, latitudinalMeters: 15000, longitudinalMeters: 15000)) }
            }
            .onMapCameraChange(frequency: .onEnd) { ctx in
                if volgen, let h = heli, Werkgebied.distanceKm(ctx.region.center.latitude, ctx.region.center.longitude, h.lat, h.lon) > 3 { volgen = false }
            }
            .onDisappear { if settings.laag(.helikopters) { helis.stop() } }
            .onChange(of: settings.laag(.helikopters)) { _, on in
                if on { helis.start() } else { helis.stop(); selectedHeli = nil }
            }
        }
    }

    // MARK: Map layers (split up so the compiler can type-check them)

    /// A ring of [lon, lat] as a closed line.
    private static func gesloten(_ ring: [[Double]]) -> [CLLocationCoordinate2D] {
        var coords: [CLLocationCoordinate2D] = []
        for p in ring where p.count == 2 { coords.append(CLLocationCoordinate2D(latitude: p[1], longitude: p[0])) }
        if let first = coords.first { coords.append(first) }
        return coords
    }

    @MapContentBuilder private var werkgebiedLaag: some MapContent {
        if settings.laag(.werkgebied) {
            ForEach(Array(Werkgebied.shared.gemeente.gebied.enumerated()), id: \.offset) { _, ring in
                MapPolyline(coordinates: Self.gesloten(ring))
                    .stroke(Theme.red.opacity(0.75), style: StrokeStyle(lineWidth: 2.5, dash: [10, 6]))
            }
        }
    }

    @MapContentBuilder private func gebiedenLaag(_ ws: [Waarschuwing]) -> some MapContent {
        ForEach(ws) { w in
            ForEach(Array(w.rings.enumerated()), id: \.offset) { _, ring in
                MapPolygon(coordinates: ring)
                    .foregroundStyle(w.color.opacity(w.bron == .knmi ? 0.16 : 0.22))
                    .stroke(w.bron == .nlalert ? Color.orange : w.color, lineWidth: 2)
            }
        }
    }

    @MapContentBuilder private var kazernesLaag: some MapContent {
        if settings.laag(.kazernes) {
            ForEach(Kazernes.all) { k in
                Annotation(k.naam, coordinate: k.coordinate, anchor: .center) {
                    KazerneIcon(soort: k.soort, size: selectedKazerne?.id == k.id ? 30 : 24)
                        .onTapGesture { withAnimation { selectedKazerne = k; selected = nil; selectedHeli = nil } }
                        .accessibilityAddTraits(.isButton)
                        .accessibilityLabel("\(k.soortLabel) \(k.naam)")
                }
                .annotationTitles(.hidden)
            }
        }
    }

    @MapContentBuilder private func meldingenLaag(_ groups: (pins: [MapPin], clusters: [PlaatsCluster])) -> some MapContent {
        ForEach(groups.clusters) { cluster in
            Annotation(cluster.plaats, coordinate: cluster.coordinate, anchor: .bottom) {
                ClusterMarker(cluster: cluster, selected: selectedCluster?.id == cluster.id)
                    .onTapGesture { selected = nil; selectedCluster = cluster }
                    .accessibilityAddTraits(.isButton)
            }
            .annotationTitles(.hidden)
        }
        ForEach(groups.pins) { pin in
            Annotation(pin.melding.title, coordinate: pin.coordinate, anchor: .bottom) {
                DienstMarker(dienst: pin.melding.dienst, size: 44, selected: selected?.guid == pin.melding.guid)
                    .onTapGesture { withAnimation { selected = pin.melding; selectedHeli = nil; selectedKazerne = nil } }
                    .accessibilityAddTraits(.isButton)
            }
            .annotationTitles(.hidden)
        }
    }

    @MapContentBuilder private func waarschuwingMarkers(_ ws: [Waarschuwing]) -> some MapContent {
        ForEach(ws.filter { $0.bron != .knmi && $0.coordinate != nil }) { w in
            Annotation(w.kop, coordinate: w.coordinate ?? CLLocationCoordinate2D(latitude: Config.center.lat, longitude: Config.center.lon), anchor: .bottom) {
                WaarschuwingMarker(waarschuwing: w, size: 44)
                    .opacity(w.isBeeindigd ? 0.6 : 1)
                    .onTapGesture { openedWaarschuwing = WaarschuwingRef(id: w.id) }
                    .accessibilityAddTraits(.isButton)
            }
            .annotationTitles(.hidden)
        }
    }

    @MapContentBuilder private var radiusLaag: some MapContent {
        if settings.radiusActive, let c = settings.radiusCenter {
            MapCircle(center: CLLocationCoordinate2D(latitude: c.lat, longitude: c.lon), radius: settings.radiusKm * 1000)
                .foregroundStyle(Theme.red.opacity(0.08))
                .stroke(Theme.red, style: StrokeStyle(lineWidth: 2, dash: [8, 6]))
        }
    }

    @MapContentBuilder private var helikoptersLaag: some MapContent {
        if settings.laag(.helikopters) {
            ForEach(helis.items) { h in
                Annotation(h.naam, coordinate: h.coordinate, anchor: .center) {
                    HeliMarker(heli: h, size: 24, selected: selectedHeli == h.id)
                        .onTapGesture { withAnimation { selectedHeli = h.id; selected = nil; selectedKazerne = nil } }
                        .accessibilityAddTraits(.isButton)
                }
                .annotationTitles(.hidden)
            }
        }
    }

    private var onderkaart: some View {
        Group {
            if let selected {
                MapPreviewCard(melding: selected) { self.selected = nil }
            } else if let heli {
                HeliInfoKaart(heli: heli, afstandKm: afstand(heli.lat, heli.lon)) { selectedHeli = nil }
            } else if let k = selectedKazerne {
                KazerneKaart(kazerne: k) { selectedKazerne = nil }
            }
        }
        .padding(.horizontal)
        .padding(.bottom, 8)
        .transition(.move(edge: .bottom).combined(with: .opacity))
    }

    private func afstand(_ lat: Double, _ lon: Double) -> Double? {
        guard settings.currentLat != 0 else { return nil }
        return AppSettings.distanceKm(settings.currentLat, settings.currentLon, lat, lon)
    }

    private var controls: some View {
        VStack(spacing: 8) {
            Picker(L("Periode"), selection: $range) {
                ForEach(Range.allCases) { Text($0.label).tag($0) }
            }
            .pickerStyle(.segmented)
            .labelsHidden()

            if settings.laag(.p2000) {
                HStack(spacing: 6) {
                    ForEach(Dienst.selectable) { d in
                        let on = visibleDiensten.contains(d)
                        Button {
                            withAnimation {
                                if on { visibleDiensten.remove(d) } else { visibleDiensten.insert(d) }
                            }
                        } label: {
                            HStack(spacing: 4) {
                                DienstIcon(dienst: d, size: 14)
                                Text("\(count(d))").font(AppFont.body(12, .bold, relativeTo: .caption).monospacedDigit())
                            }
                            .padding(.horizontal, 9).padding(.vertical, 5)
                            .background(on ? d.color.opacity(0.22) : Color.secondary.opacity(0.08), in: Capsule())
                            .overlay(Capsule().strokeBorder(on ? d.color : .clear, lineWidth: 1))
                            .opacity(on ? 1 : 0.5)
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("\(d.label): \(count(d))")
                        .accessibilityValue(on ? L("Zichtbaar") : L("Verborgen"))
                    }
                }
            }
            if settings.laag(.helikopters), !helis.items.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 6) {
                        ForEach(helis.items) { h in
                            Button {
                                withAnimation {
                                    selectedHeli = h.id; selected = nil; selectedKazerne = nil
                                    position = .region(MKCoordinateRegion(center: h.coordinate, latitudinalMeters: 20000, longitudinalMeters: 20000))
                                }
                            } label: {
                                Label(h.naam, systemImage: "helicopter")
                                    .font(AppFont.body(12, .semibold, relativeTo: .caption))
                                    .padding(.horizontal, 9).padding(.vertical, 5)
                                    .background(h.color.opacity(0.2), in: Capsule())
                                    .overlay(Capsule().strokeBorder(h.color, lineWidth: 1))
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            }
        }
        .padding(10)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .padding(.horizontal)
        .padding(.top, 6)
    }

    private func count(_ d: Dienst) -> Int {
        let cutoff = cutoff
        return store.meldingen.filter { $0.dienst == d && $0.hasCoordinate && $0.datum >= cutoff }.count
    }
}

/// "Kaartlagen": switch each layer on or off (synced between devices).
struct KaartLagenView: View {
    @Environment(AppSettings.self) private var settings
    @Environment(\.dismiss) private var dismiss
    @State private var helis = HeliStore.shared

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    ForEach(KaartLaag.allCases) { laag in
                        Toggle(isOn: Binding(get: { settings.laag(laag) }, set: { settings.setLaag(laag, $0) })) {
                            Label(laag.titel, systemImage: laag.systemImage)
                        }
                    }
                } footer: {
                    Text(L("Helikopterposities komen van adsb.lol (open data). Een helikopter die laag vliegt of op de grond staat, is soms niet te zien. Kazernes en posten komen uit OpenStreetMap."))
                }
                if settings.laag(.helikopters) {
                    Section {
                        if helis.items.isEmpty {
                            Text(helis.failed ? L("Helikopterposities zijn nu niet beschikbaar.") : L("Er is nu geen trauma- of politiehelikopter in de lucht."))
                                .foregroundStyle(.secondary)
                        }
                        ForEach(helis.items) { h in
                            HStack {
                                Image(systemName: "helicopter").foregroundStyle(h.color)
                                Text(h.naam)
                                Spacer()
                                Text(h.opGrond ? L("Op de grond") : (h.hoogteMeter.map { "\($0) m" } ?? "–")).foregroundStyle(.secondary)
                            }
                        }
                    } header: {
                        Text(L("Nu in de lucht"))
                    }
                }
            }
            .formStyle(.grouped)
            .navigationTitle(L("Kaartlagen"))
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .confirmationAction) { Button(L("Klaar")) { dismiss() } }
            }
        }
    }
}

/// Card for a tapped station.
struct KazerneKaart: View {
    let kazerne: Kazerne
    var onClose: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            KazerneIcon(soort: kazerne.soort, size: 40)
            VStack(alignment: .leading, spacing: 2) {
                Text(kazerne.naam).font(AppFont.heading(20))
                Text("\(kazerne.soortLabel) · \(kazerne.plaats)").font(AppFont.body(12, .regular, relativeTo: .caption)).foregroundStyle(.secondary)
            }
            Spacer()
            Button(action: onClose) {
                Image(systemName: "xmark.circle.fill").font(.title3).foregroundStyle(.secondary)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(L("Sluit"))
        }
        .padding(14)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .shadow(color: .black.opacity(0.15), radius: 10, y: 4)
    }
}

/// The alerts behind a town marker: all alerts without a street name in that town.
struct ClusterSheet: View {
    let cluster: PlaatsCluster
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List {
                Section {
                    ForEach(cluster.meldingen) { m in
                        NavigationLink { MeldingDetailView(melding: m) } label: { MeldingRow(melding: m) }
                    }
                } footer: {
                    Text(L("De meldkamer heeft bij deze meldingen geen straatnaam doorgegeven. Daarom staan ze samen op één punt in de plaats."))
                }
            }
            .navigationTitle(Lf("%lld in %@", cluster.meldingen.count, cluster.plaats))
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button(L("Klaar")) { dismiss() }
                }
            }
        }
    }
}

/// Small card at the bottom of the map for the tapped pin.
struct MapPreviewCard: View {
    let melding: Melding
    var onClose: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            HStack(alignment: .top) {
                NavigationLink {
                    MeldingDetailView(melding: melding)
                } label: {
                    MeldingRow(melding: melding)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                Button(action: onClose) {
                    Image(systemName: "xmark.circle.fill")
                        .font(.title3)
                        .foregroundStyle(.secondary)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(L("Sluit"))
            }
            HStack {
                Spacer()
                NavigationLink {
                    MeldingDetailView(melding: melding)
                } label: {
                    Label(L("Details"), systemImage: "chevron.right")
                        .labelStyle(.titleAndIcon)
                        .font(AppFont.body(16, .semibold, relativeTo: .callout))
                }
            }
            .padding(.top, 6)
        }
        .padding(14)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .shadow(color: .black.opacity(0.15), radius: 10, y: 4)
    }
}
