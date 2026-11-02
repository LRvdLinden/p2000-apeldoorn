import SwiftUI
import MapKit

/// "Kaart": all recent alerts with the website's marker pins.
struct MapScreen: View {
    @Environment(MeldingStore.self) private var store
    @Environment(AppSettings.self) private var settings

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
    @State private var position: MapCameraPosition = .region(MapScreen.apeldoorn)
    @State private var visibleDiensten: Set<Dienst> = Set(Dienst.selectable)

    static let apeldoorn = MKCoordinateRegion(center: CLLocationCoordinate2D(latitude: Config.center.lat, longitude: Config.center.lon),
                                              span: MKCoordinateSpan(latitudeDelta: 0.15, longitudeDelta: 0.15))

    /// Pins on the map; alerts at the same spot are spread in a small circle (like the website).
    private var pins: [MapPin] {
        let cutoff = Date.now.addingTimeInterval(-Double(range.rawValue) * 3600)
        let list = store.meldingen.filter {
            $0.hasCoordinate && $0.datum >= cutoff
                && (visibleDiensten.contains($0.dienst) || !Dienst.selectable.contains($0.dienst))
                && settings.matchesList($0)
        }
        let groups = Dictionary(grouping: list) { m in
            "\(Int(((m.lat ?? 0) * 1000).rounded())),\(Int(((m.lon ?? 0) * 1000).rounded()))"
        }
        var result: [MapPin] = []
        for (_, group) in groups {
            let sorted = group.sorted { $0.datum < $1.datum }
            for (i, m) in sorted.enumerated() {
                var lat = m.lat ?? 0, lon = m.lon ?? 0
                if sorted.count > 1 {
                    let angle = Double(i) / Double(sorted.count) * .pi * 2
                    lat += cos(angle) * 0.0003
                    lon += sin(angle) * 0.0003
                }
                result.append(MapPin(melding: m, coordinate: CLLocationCoordinate2D(latitude: lat, longitude: lon)))
            }
        }
        // Newest on top.
        return result.sorted { $0.melding.datum < $1.melding.datum }
    }

    var body: some View {
        NavigationStack {
            Map(position: $position) {
                ForEach(pins) { pin in
                    Annotation(pin.melding.title, coordinate: pin.coordinate, anchor: .bottom) {
                        DienstMarker(dienst: pin.melding.dienst, size: 44, selected: selected?.guid == pin.melding.guid)
                            .onTapGesture { withAnimation { selected = pin.melding } }
                            .accessibilityAddTraits(.isButton)
                    }
                    .annotationTitles(.hidden)
                }
                UserAnnotation()
            }
            .mapStyle(MapStyleSetting.style(for: settings.mapType))
            .mapControls {
                MapCompass()
                MapScaleView()
                MapUserLocationButton()
            }
            .safeAreaInset(edge: .top) { controls }
            .safeAreaInset(edge: .bottom) {
                if let selected {
                    MapPreviewCard(melding: selected) { self.selected = nil }
                        .padding(.horizontal)
                        .padding(.bottom, 8)
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                }
            }
            .navigationTitle(L("Kaart"))
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(.visible, for: .navigationBar)
            #endif
            .toolbar {
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
        }
    }

    private var controls: some View {
        VStack(spacing: 8) {
            Picker(L("Periode"), selection: $range) {
                ForEach(Range.allCases) { Text($0.label).tag($0) }
            }
            .pickerStyle(.segmented)
            .labelsHidden()

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
                            Text("\(count(d))").font(.caption.weight(.bold).monospacedDigit())
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
        .padding(10)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .padding(.horizontal)
        .padding(.top, 6)
    }

    private func count(_ d: Dienst) -> Int {
        let cutoff = Date.now.addingTimeInterval(-Double(range.rawValue) * 3600)
        return store.meldingen.filter { $0.dienst == d && $0.hasCoordinate && $0.datum >= cutoff }.count
    }
}

struct MapPin: Identifiable {
    let melding: Melding
    let coordinate: CLLocationCoordinate2D
    var id: String { melding.guid }
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
                        .font(.callout.weight(.semibold))
                }
            }
            .padding(.top, 6)
        }
        .padding(14)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .shadow(color: .black.opacity(0.15), radius: 10, y: 4)
    }
}
