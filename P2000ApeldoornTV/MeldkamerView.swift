import SwiftUI
import MapKit

/// The control-room screen: live map on the left, clock, today's counts and the latest alerts on the right.
struct MeldkamerView: View {
    @Environment(MeldingStore.self) private var store
    @Environment(AppSettings.self) private var settings
    @Environment(TVSettings.self) private var tv
    @State private var position: MapCameraPosition = .region(Self.overview)
    @State private var focusGuid: String?
    @State private var tourIndex = 0
    @State private var selected: Melding?
    @State private var selectedWaarschuwing: Waarschuwing?
    private var waarschuwingen: WaarschuwingStore { WaarschuwingStore.shared }

    /// NL-Alert and Burgernet of the last 24 hours, between the alerts (KNMI is the bar at the top).
    private var lijst: [TVLijstItem] {
        let cutoff = Date.now.addingTimeInterval(-24 * 3600)
        let w = waarschuwingen.items.filter { $0.bron != .knmi && ($0.isActief || $0.start >= cutoff) }.map(TVLijstItem.waarschuwing)
        return (items.prefix(40).map(TVLijstItem.melding) + w).sorted { $0.datum > $1.datum }
    }
    private var knmiActief: [Waarschuwing] { waarschuwingen.items.filter { $0.bron == .knmi && $0.isActief } }

    static let apeldoorn = CLLocationCoordinate2D(latitude: 52.2112, longitude: 5.9699)
    static let overview = MKCoordinateRegion(center: CLLocationCoordinate2D(latitude: 52.205, longitude: 5.95),
                                             span: MKCoordinateSpan(latitudeDelta: 0.24, longitudeDelta: 0.42))

    private var items: [Melding] { store.filtered(settings) }
    private var mapped: [Melding] { items.filter { $0.hasCoordinate } }
    private var layout: (pins: [MapPin], clusters: [PlaatsCluster]) { MapLayout.build(items) }

    var body: some View {
        HStack(alignment: .top, spacing: 40) {
            mapPanel
            sidePanel.frame(width: 600)
        }
        .padding(.horizontal, 60)
        .padding(.vertical, 30)
        .background(
            RadialGradient(colors: [Color(hex: 0x3A0710), Color(hex: 0x0B0B0F)], center: .topLeading, startRadius: 50, endRadius: 1400)
                .ignoresSafeArea()
        )
        .fullScreenCover(item: $selected) { m in TVDetailView(melding: m) }
        .fullScreenCover(item: $selectedWaarschuwing) { w in TVWaarschuwingDetail(waarschuwing: w) }
        .onChange(of: items.first?.guid) { _, guid in
            // A new alert: fly to it.
            guard let guid, let m = items.first(where: { $0.guid == guid }) else { return }
            fly(to: m)
        }
        .task(id: tv.autoTour) { await tour() }
    }

    // MARK: Map

    private var mapPanel: some View {
        ZStack(alignment: .bottomLeading) {
            let groups = layout
            Map(position: $position, interactionModes: []) {
                // Alerts without a street name: one marker per town instead of a ring of identical pins.
                // Border of the working area.
                if settings.laag(.werkgebied) {
                    ForEach(Array(Werkgebied.shared.gemeente.gebied.enumerated()), id: \.offset) { _, ring in
                        MapPolyline(coordinates: (ring + ring.prefix(1)).map { CLLocationCoordinate2D(latitude: $0[1], longitude: $0[0]) })
                            .stroke(Theme.red.opacity(0.75), style: StrokeStyle(lineWidth: 3, dash: [12, 7]))
                    }
                }
                // KNMI areas.
                if settings.laag(.knmi) {
                    ForEach(waarschuwingen.items.filter { $0.bron == .knmi && $0.isActief }) { w in
                        ForEach(Array(w.rings.enumerated()), id: \.offset) { _, ring in
                            MapPolygon(coordinates: ring).foregroundStyle(w.color.opacity(0.18)).stroke(w.color, lineWidth: 2)
                        }
                    }
                }
                // Fire, ambulance and police stations.
                if settings.laag(.kazernes) {
                    ForEach(Kazernes.all) { k in
                        Annotation(k.naam, coordinate: k.coordinate, anchor: .center) { KazerneIcon(soort: k.soort, size: 30) }
                            .annotationTitles(.hidden)
                    }
                }
                ForEach(groups.clusters) { c in
                    Annotation(c.plaats, coordinate: c.coordinate, anchor: .bottom) {
                        ClusterMarker(cluster: c, size: 64, selected: c.meldingen.contains { $0.guid == focusGuid })
                    }
                    .annotationTitles(.hidden)
                }
                ForEach(groups.pins) { pin in
                    Annotation(pin.melding.title, coordinate: pin.coordinate, anchor: .bottom) {
                        TVMarker(melding: pin.melding, highlighted: pin.melding.guid == focusGuid)
                    }
                    .annotationTitles(.hidden)
                }
                // Active NL-Alert areas and Burgernet calls (A-Alerts).
                ForEach(waarschuwingen.items.filter { $0.isActief && $0.bron != .knmi && settings.laag($0.bron == .nlalert ? .nlalert : .burgernet) }) { w in
                    ForEach(Array(w.rings.enumerated()), id: \.offset) { _, ring in
                        MapPolygon(coordinates: ring).foregroundStyle(w.color.opacity(0.2)).stroke(w.color, lineWidth: 2)
                    }
                    if let c = w.coordinate {
                        Annotation(w.titel, coordinate: c, anchor: .bottom) { WaarschuwingMarker(waarschuwing: w, size: 56) }
                            .annotationTitles(.hidden)
                    }
                }
                // Live trauma and police helicopters (A-Alerts).
                if settings.laag(.helikopters) {
                    ForEach(HeliStore.shared.items) { h in
                        Annotation(h.naam, coordinate: h.coordinate, anchor: .center) {
                            HeliMarker(heli: h, size: 34)
                        }
                        .annotationTitles(.hidden)
                    }
                }
            }
            .onAppear { HeliStore.shared.start() }
            .onDisappear { HeliStore.shared.stop() }
            .mapStyle(mapStyle)
            .clipShape(RoundedRectangle(cornerRadius: 36, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 36, style: .continuous).stroke(.white.opacity(0.08), lineWidth: 2))

            if let m = items.first(where: { $0.guid == focusGuid }) ?? items.first {
                latestCard(m).padding(28)
            }
        }
        .overlay(alignment: .bottomTrailing) {
            // Helicopters in the air, with altitude and speed (the info card of the app).
            if settings.laag(.helikopters), !HeliStore.shared.items.isEmpty {
                VStack(alignment: .trailing, spacing: 10) {
                    ForEach(HeliStore.shared.items.prefix(4)) { h in
                        HStack(spacing: 12) {
                            Image(h.afbeelding).resizable().scaledToFit().frame(width: 70, height: 26)
                                .scaleEffect(x: h.vliegtWest ? -1 : 1, y: 1)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(h.naam).font(AppFont.body(18, .bold))
                                Text([h.opGrond ? L("Op de grond") : h.hoogteMeter.map { "\($0) m" }, h.snelheidKmh.map { "\($0) km/u" }, h.koersTekst]
                                        .compactMap { $0 }.joined(separator: " · "))
                                    .font(AppFont.body(14, .regular)).foregroundStyle(.secondary)
                            }
                        }
                        .padding(.horizontal, 16).padding(.vertical, 10)
                        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                    }
                }
                .padding(28)
            }
        }
        .overlay(alignment: .topLeading) {
            HStack(spacing: 14) {
                ForEach(Dienst.selectable) { d in
                    HStack(spacing: 8) {
                        DienstIcon(dienst: d, size: 28)
                        Text("\(mapped.filter { $0.dienst == d }.count)").font(AppFont.body(24, .bold).monospacedDigit())
                    }
                    .padding(.horizontal, 16).padding(.vertical, 8)
                    .background(.ultraThinMaterial, in: Capsule())
                }
                Text(L("Laatste 24 uur")).font(AppFont.body(20, .semibold))
                    .padding(.horizontal, 16).padding(.vertical, 10)
                    .background(.ultraThinMaterial, in: Capsule())
            }
            .padding(24)
        }
    }

    private var mapStyle: MapStyle {
        switch settings.mapType {
        case "satellite": return .imagery(elevation: .realistic)
        case "hybrid": return .hybrid(elevation: .realistic, pointsOfInterest: .excludingAll)
        default: return .standard(elevation: .realistic, emphasis: .muted, pointsOfInterest: .excludingAll)
        }
    }

    private func latestCard(_ m: Melding) -> some View {
        HStack(spacing: 22) {
            DienstIcon(dienst: m.dienst, size: 56)
            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 12) {
                    if m.isRecent { LivePill() }
                    Text(m.agoText).foregroundStyle(.secondary)
                }
                .font(AppFont.body(20, .semibold))
                Text(m.title).font(AppFont.heading(30)).lineLimit(2)
                Text(m.plaatsText).font(AppFont.body(22, .medium)).foregroundStyle(.secondary)
                if !m.prioriteitText.isEmpty {
                    Text(m.prioriteitText).font(AppFont.body(22, .semibold)).foregroundStyle(m.dienst.textColor)
                }
            }
        }
        .padding(22)
        .frame(maxWidth: 820, alignment: .leading)
        .background(.ultraThickMaterial, in: RoundedRectangle(cornerRadius: 28, style: .continuous))
        .shadow(color: .black.opacity(0.4), radius: 30, y: 12)
        .id(m.guid)
        .transition(.move(edge: .bottom).combined(with: .opacity))
        .animation(.spring(duration: 0.6), value: m.guid)
    }

    private func fly(to m: Melding) {
        guard let lat = m.lat, let lon = m.lon else { return }
        focusGuid = m.guid
        // Without a street the coordinate is only the town centre: show the town, not a street corner.
        withAnimation(.easeInOut(duration: 2.2)) {
            position = .camera(MapCamera(centerCoordinate: CLLocationCoordinate2D(latitude: lat, longitude: lon),
                                         distance: m.hasStreet ? 3200 : 9000, heading: 0, pitch: m.hasStreet ? 55 : 35))
        }
    }

    /// Automatic tour: every 12 seconds the next alert of the last 24 hours, now and then the overview.
    private func tour() async {
        guard tv.autoTour else {
            withAnimation(.easeInOut(duration: 1.5)) { position = .region(Self.overview) }
            return
        }
        while !Task.isCancelled {
            try? await Task.sleep(for: .seconds(12))
            // Each town without street names only once, so the tour doesn't keep flying to the same centre.
            var seenTowns = Set<String>()
            let list = Array(mapped.filter { $0.hasStreet || seenTowns.insert($0.plaatsNaam).inserted }.prefix(8))
            guard !list.isEmpty else { continue }
            if tourIndex >= list.count {
                tourIndex = 0
                focusGuid = nil
                withAnimation(.easeInOut(duration: 2.2)) { position = .region(Self.overview) }
            } else {
                fly(to: list[tourIndex])
                tourIndex += 1
            }
        }
    }

    // MARK: Side panel

    private var sidePanel: some View {
        VStack(alignment: .leading, spacing: 20) {
            HStack(alignment: .center, spacing: 14) {
                AppMark(size: 60)
                VStack(alignment: .leading, spacing: 2) {
                    Text(verbatim: "A-Alerts").font(AppFont.heading(28)).lineLimit(1).minimumScaleFactor(0.7)
                    HStack(spacing: 8) {
                        LiveDot(online: store.isOnline)
                        Text(store.isOnline ? L("Meldkamer · live") : L("Offline")).font(AppFont.body(18, .medium))
                            .foregroundStyle(.secondary).lineLimit(1)
                    }
                }
                .layoutPriority(1)
                Spacer(minLength: 10)
                TVClock(size: 40)
            }

            let today = store.vandaag
            HStack(spacing: 12) {
                TodayTile(value: today.totaal, label: L("Vandaag"), color: Theme.red, icon: nil)
                ForEach(Dienst.selectable) { d in
                    TodayTile(value: today.perDienst[d] ?? 0, label: d == .traumaheli ? L("Lifeliner") : d.label, color: d.color, icon: d)
                }
            }

            if !knmiActief.isEmpty {
                TVKnmiBalk(items: knmiActief) { selectedWaarschuwing = $0 }
            }

            Text(L("Laatste meldingen")).font(AppFont.body(22, .semibold)).foregroundStyle(.secondary)
            ScrollView {
                LazyVStack(spacing: 14) {
                    ForEach(lijst) { item in
                        switch item {
                        case .melding(let m):
                            Button { selected = m } label: { TVRow(melding: m, read: settings.isRead(m)) }
                                .buttonStyle(.card)
                        case .waarschuwing(let w):
                            Button { selectedWaarschuwing = w } label: { TVWaarschuwingRow(waarschuwing: w) }
                                .buttonStyle(.card)
                        }
                    }
                    if items.isEmpty {
                        Text(L("Geen meldingen in de laatste 24 uur"))
                            .foregroundStyle(.secondary)
                            .frame(maxWidth: .infinity, minHeight: 200)
                    }
                }
                .padding(.vertical, 10)
                .padding(.horizontal, 6)
            }
            .scrollClipDisabled()
        }
    }
}

// MARK: - Building blocks

struct TVMarker: View {
    let melding: Melding
    var highlighted: Bool
    @State private var pulse = false

    var body: some View {
        ZStack(alignment: .bottom) {
            if highlighted || melding.isRecent {
                Circle()
                    .stroke(melding.dienst.color, lineWidth: 4)
                    .frame(width: 60, height: 60)
                    .scaleEffect(pulse ? 2.4 : 0.6)
                    .opacity(pulse ? 0 : 0.9)
                    .offset(y: 20)
                    .animation(.easeOut(duration: 1.6).repeatForever(autoreverses: false), value: pulse)
                    .onAppear { pulse = true }
            }
            DienstMarker(dienst: melding.dienst, size: highlighted ? 86 : 58)
                .shadow(color: .black.opacity(0.4), radius: 6, y: 4)
                .animation(.spring(duration: 0.5), value: highlighted)
        }
    }
}

struct LivePill: View {
    @State private var blink = false
    var body: some View {
        Text("LIVE")
            .font(AppFont.heading(14))
            .padding(.horizontal, 8).padding(.vertical, 3)
            .background(Theme.red, in: Capsule())
            .foregroundStyle(.white)
            .opacity(blink ? 0.55 : 1)
            .animation(.easeInOut(duration: 0.7).repeatForever(), value: blink)
            .onAppear { blink = true }
    }
}

struct TodayTile: View {
    let value: Int
    let label: String
    let color: Color
    let icon: Dienst?

    var body: some View {
        VStack(spacing: 6) {
            if let icon { DienstIcon(dienst: icon, size: 26) } else {
                Image(systemName: "calendar").font(.system(size: 22)).foregroundStyle(color).frame(height: 26)
            }
            Text("\(value)").font(AppFont.heading(32).monospacedDigit()).contentTransition(.numericText())
            Text(label).font(AppFont.body(15, .semibold)).foregroundStyle(.secondary).lineLimit(1).minimumScaleFactor(0.7)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 10)
        .background(color.opacity(0.16), in: RoundedRectangle(cornerRadius: 20, style: .continuous))
    }
}

struct TVRow: View {
    let melding: Melding
    let read: Bool

    var body: some View {
        HStack(alignment: .top, spacing: 18) {
            DienstIcon(dienst: melding.dienst, size: 36)
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 10) {
                    if melding.isRecent { LivePill() }
                    Text("\(melding.agoText) · \(melding.datum.formatted(date: .omitted, time: .shortened))")
                        .font(AppFont.body(16, .regular)).foregroundStyle(.secondary)
                }
                Text(melding.title).font(AppFont.body(22, .semibold)).lineLimit(2)
                Text(melding.plaatsText).font(AppFont.body(16, .regular)).foregroundStyle(.secondary)
                if !melding.prioriteitText.isEmpty {
                    Text(melding.prioriteitText).font(AppFont.body(16, .semibold)).foregroundStyle(melding.dienst.textColor).lineLimit(1)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .opacity(read ? 0.6 : 1)
    }
}
