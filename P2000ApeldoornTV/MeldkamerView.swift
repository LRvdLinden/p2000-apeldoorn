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

    static let apeldoorn = CLLocationCoordinate2D(latitude: 52.2112, longitude: 5.9699)
    static let overview = MKCoordinateRegion(center: CLLocationCoordinate2D(latitude: 52.205, longitude: 5.95),
                                             span: MKCoordinateSpan(latitudeDelta: 0.24, longitudeDelta: 0.42))

    private var items: [Melding] { store.filtered(settings) }
    private var mapped: [Melding] { items.filter { $0.hasCoordinate } }

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
            Map(position: $position, interactionModes: []) {
                ForEach(mapped) { m in
                    Annotation(m.title, coordinate: CLLocationCoordinate2D(latitude: m.lat ?? 0, longitude: m.lon ?? 0), anchor: .bottom) {
                        TVMarker(melding: m, highlighted: m.guid == focusGuid)
                    }
                    .annotationTitles(.hidden)
                }
            }
            .mapStyle(mapStyle)
            .clipShape(RoundedRectangle(cornerRadius: 36, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 36, style: .continuous).stroke(.white.opacity(0.08), lineWidth: 2))

            if let m = items.first(where: { $0.guid == focusGuid }) ?? items.first {
                latestCard(m).padding(28)
            }
        }
        .overlay(alignment: .topLeading) {
            HStack(spacing: 14) {
                ForEach(Dienst.selectable) { d in
                    HStack(spacing: 8) {
                        DienstIcon(dienst: d, size: 28)
                        Text("\(mapped.filter { $0.dienst == d }.count)").font(.system(size: 24, weight: .bold).monospacedDigit())
                    }
                    .padding(.horizontal, 16).padding(.vertical, 8)
                    .background(.ultraThinMaterial, in: Capsule())
                }
                Text(L("Laatste 24 uur")).font(.system(size: 20, weight: .semibold))
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
                .font(.system(size: 20, weight: .semibold))
                Text(m.title).font(.system(size: 30, weight: .heavy)).lineLimit(2)
                Text(m.plaatsText).font(.system(size: 22, weight: .medium)).foregroundStyle(.secondary)
                if !m.prioriteitText.isEmpty {
                    Text(m.prioriteitText).font(.system(size: 22, weight: .semibold)).foregroundStyle(m.dienst.textColor)
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
        withAnimation(.easeInOut(duration: 2.2)) {
            position = .camera(MapCamera(centerCoordinate: CLLocationCoordinate2D(latitude: lat, longitude: lon),
                                         distance: 3200, heading: 0, pitch: 55))
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
            let list = Array(mapped.prefix(8))
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
                    Text("P2000 Apeldoorn").font(.system(size: 28, weight: .black)).lineLimit(1).minimumScaleFactor(0.7)
                    HStack(spacing: 8) {
                        LiveDot(online: store.isOnline)
                        Text(store.isOnline ? L("Meldkamer · live") : L("Offline")).font(.system(size: 18, weight: .medium))
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

            Text(L("Laatste meldingen")).font(.system(size: 22, weight: .semibold)).foregroundStyle(.secondary)
            ScrollView {
                LazyVStack(spacing: 14) {
                    ForEach(items.prefix(40)) { m in
                        Button { selected = m } label: { TVRow(melding: m, read: settings.isRead(m)) }
                            .buttonStyle(.card)
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
            .font(.system(size: 14, weight: .black))
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
            Text("\(value)").font(.system(size: 32, weight: .black).monospacedDigit()).contentTransition(.numericText())
            Text(label).font(.system(size: 15, weight: .semibold)).foregroundStyle(.secondary).lineLimit(1).minimumScaleFactor(0.7)
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
                        .font(.system(size: 16)).foregroundStyle(.secondary)
                }
                Text(melding.title).font(.system(size: 22, weight: .semibold)).lineLimit(2)
                Text(melding.plaatsText).font(.system(size: 16)).foregroundStyle(.secondary)
                if !melding.prioriteitText.isEmpty {
                    Text(melding.prioriteitText).font(.system(size: 16, weight: .semibold)).foregroundStyle(melding.dienst.textColor).lineLimit(1)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .opacity(read ? 0.6 : 1)
    }
}
