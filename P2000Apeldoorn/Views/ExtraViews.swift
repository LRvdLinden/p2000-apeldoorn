import SwiftUI
import MapKit
import UserNotifications

// A-Alerts build 53: helicopter zones, large incidents, map display, "Klopt deze melding niet?",
// the rain radar on the map and the banner when notifications are off in the system settings.

// MARK: - Helicopter zones

struct HeliZonesView: View {
    @Environment(AppSettings.self) private var settings
    @State private var nieuw: HeliZone?

    var body: some View {
        @Bindable var settings = settings
        Form {
            if settings.heliGepauzeerd {
                Section {
                    Label(Lf("Gepauzeerd tot %@", Date(timeIntervalSince1970: settings.heliPauzeTot).formatted(date: .omitted, time: .shortened)), systemImage: "pause.circle.fill")
                        .foregroundStyle(.orange)
                    Button(L("Hervat de zonemeldingen")) { settings.heliPauzeTot = 0 }
                }
            }
            Section {
                ForEach(settings.heliZones) { zone in
                    NavigationLink {
                        HeliZoneEditor(zone: zone) { bewaar($0) } verwijder: { verwijder(zone.id) }
                    } label: {
                        HStack {
                            Image(systemName: "circle.dashed.inset.filled").foregroundStyle(Dienst.traumaheli.color)
                            Text(zone.naam)
                            Spacer()
                            Text(Lf("%@ km", zone.km.formatted(.number.precision(.fractionLength(0...1))))).foregroundStyle(.secondary)
                        }
                    }
                }
                .onDelete { idx in settings.heliZones.remove(atOffsets: idx) }
                if settings.heliZones.count < HeliZone.maximum {
                    Button {
                        let c = settings.radiusCenter ?? (Config.center.lat, Config.center.lon)
                        nieuw = HeliZone(naam: settings.heliZones.isEmpty ? L("Thuis") : Lf("Zone %lld", settings.heliZones.count + 1), lat: c.lat, lon: c.lon)
                    } label: {
                        Label(L("Zone toevoegen"), systemImage: "plus.circle.fill")
                    }
                }
            } header: {
                Text(L("Zones"))
            } footer: {
                Text(L("Tip: houd een plek op de kaart ingedrukt om daar meteen een zone te maken. Maximaal vijf zones."))
            }

            Section {
                Toggle(L("Opstijgen in je zone"), isOn: $settings.heliOpstijgen)
                Toggle(L("Landen in je zone"), isOn: $settings.heliLanden)
                Toggle(L("Je zone in vliegen"), isOn: $settings.heliBinnen)
            } header: {
                Text(L("Meld mij bij"))
            }

            Section {
                Toggle(isOn: soort("trauma")) { Label(L("Traumahelikopters (Lifeliner)"), systemImage: "cross.fill") }
                Toggle(isOn: soort("politie")) { Label(L("Politiehelikopters (Zulu)"), systemImage: "shield.fill") }
            } header: {
                Text(L("Welke helikopters"))
            }

            if !settings.heliZones.isEmpty && !settings.heliGepauzeerd {
                Section {
                    Menu {
                        Button(L("1 uur")) { pauzeer(3600) }
                        Button(L("4 uur")) { pauzeer(4 * 3600) }
                        Button(L("Tot morgen 07:00")) { pauzeerTotMorgen() }
                    } label: {
                        Label(L("Pauzeer zonemeldingen"), systemImage: "pause.circle")
                    }
                } footer: {
                    Text(L("Handig als je een dagje weg bent of een helikopterbasis in je zone hebt. De stille modus geldt ook voor zonemeldingen."))
                }
            }
        }
        .formStyle(.grouped)
        .navigationTitle(L("Helikopters in je zone"))
        .sheet(item: $nieuw) { zone in
            NavigationStack {
                HeliZoneEditor(zone: zone, isNieuw: true) { bewaar($0); nieuw = nil }
            }
        }
    }

    private func soort(_ s: String) -> Binding<Bool> {
        Binding(get: { settings.heliSoorten.contains(s) }, set: { on in
            var v = settings.heliSoorten
            if on { v.insert(s) } else if v.count > 1 { v.remove(s) }
            settings.heliSoorten = v
        })
    }
    private func pauzeer(_ sec: Double) { settings.heliPauzeTot = Date.now.timeIntervalSince1970 + sec }
    private func pauzeerTotMorgen() {
        let morgen = Calendar.current.date(byAdding: .day, value: 1, to: .now) ?? .now
        let t = Calendar.current.date(bySettingHour: 7, minute: 0, second: 0, of: morgen) ?? morgen
        settings.heliPauzeTot = t.timeIntervalSince1970
    }
    private func bewaar(_ z: HeliZone) {
        if let i = settings.heliZones.firstIndex(where: { $0.id == z.id }) { settings.heliZones[i] = z }
        else if settings.heliZones.count < HeliZone.maximum { settings.heliZones.append(z) }
    }
    private func verwijder(_ id: String) { settings.heliZones.removeAll { $0.id == id } }
}

/// Name, spot (the middle of the map) and size of a zone.
struct HeliZoneEditor: View {
    @State var zone: HeliZone
    var isNieuw = false
    var onSave: (HeliZone) -> Void
    var verwijder: (() -> Void)?
    @Environment(\.dismiss) private var dismiss
    @State private var position: MapCameraPosition = .automatic
    @State private var midden: CLLocationCoordinate2D?

    var body: some View {
        Form {
            Section { TextField(L("Naam"), text: $zone.naam) } header: { Text(L("Naam")) }
            Section {
                ZStack {
                    Map(position: $position) {
                        MapCircle(center: midden ?? zone.coordinate, radius: zone.km * 1000)
                            .foregroundStyle(Dienst.traumaheli.color.opacity(0.18))
                            .stroke(Dienst.traumaheli.color, lineWidth: 2)
                    }
                    .onMapCameraChange(frequency: .continuous) { midden = $0.region.center }
                    .kaartThema()
                    Image(systemName: "plus").font(.title2.weight(.semibold)).foregroundStyle(.primary).allowsHitTesting(false)
                }
                .frame(height: 260)
                .listRowInsets(EdgeInsets())
                VStack(alignment: .leading) {
                    Text(Lf("Straal: %@ km", zone.km.formatted(.number.precision(.fractionLength(0...1)))))
                    Slider(value: $zone.km, in: 1...25, step: 0.5)
                }
            } header: {
                Text(L("Plek"))
            } footer: {
                Text(L("Schuif de kaart tot het kruisje op de goede plek staat."))
            }
            if let verwijder {
                Section { Button(L("Verwijder zone"), role: .destructive) { verwijder(); dismiss() } }
            }
        }
        .formStyle(.grouped)
        .navigationTitle(isNieuw ? L("Nieuwe zone") : zone.naam)
        .onAppear {
            position = .region(MKCoordinateRegion(center: zone.coordinate, latitudinalMeters: zone.km * 2600, longitudinalMeters: zone.km * 2600))
        }
        .toolbar {
            if isNieuw {
                ToolbarItem(placement: .cancellationAction) { Button(L("Annuleer")) { dismiss() } }
            }
            ToolbarItem(placement: .confirmationAction) {
                Button(L("Bewaar")) {
                    var z = zone
                    if let m = midden { z.lat = (m.latitude * 1e4).rounded() / 1e4; z.lon = (m.longitude * 1e4).rounded() / 1e4 }
                    if z.naam.trimmingCharacters(in: .whitespaces).isEmpty { z.naam = L("Zone") }
                    onSave(z)
                    if !isNieuw { dismiss() }
                }
            }
        }
    }
}

// MARK: - Large incidents

struct GrootIncidentSection: View {
    @Environment(AppSettings.self) private var settings

    var body: some View {
        @Bindable var settings = settings
        Section {
            Toggle(isOn: $settings.grootIncident) {
                SettingsRow(icon: "flame.fill", color: .red, title: L("Groot incident"))
            }
            if settings.grootIncident {
                NavigationLink {
                    MultiSelectView(title: L("Plaatsen"), options: Config.plaatsen, selection: $settings.grootPlaatsen,
                                    footer: L("Niets geselecteerd = het hele werkgebied."), groups: Config.plaatsGroepen)
                } label: {
                    LabeledContent(L("Plaatsen"), value: settings.grootPlaatsen.isEmpty ? L("Hele werkgebied") : AppSettings.summary(settings.grootPlaatsen) { $0 })
                }
            }
            NavigationLink {
                HeliZonesView()
            } label: {
                SettingsRow(icon: "scope", color: .orange, title: L("Helikopters in je zone"),
                            value: settings.heliZones.isEmpty ? L("Uit") : settings.heliGepauzeerd ? L("Gepauzeerd") : "\(settings.heliZones.count)")
            }
        } header: {
            Text(L("Extra meldingen"))
        } footer: {
            Text(L("Groot incident: een pushmelding bij GRIP, opschaling, een grote of middelbrand of een inzet met tien of meer eenheden, ook als het buiten je profielen valt."))
        }
    }
}

// MARK: - Map display

struct KaartWeergaveView: View {
    @Environment(AppSettings.self) private var settings

    var body: some View {
        @Bindable var settings = settings
        Form {
            Section {
                Picker(L("Kaarttype"), selection: $settings.mapType) {
                    Text(L("Standaard")).tag("standard")
                    Text(L("Satelliet")).tag("satellite")
                    Text(L("Hybride")).tag("hybrid")
                }
                Picker(L("Kleuren"), selection: $settings.kaartThema) {
                    Text(L("Licht")).tag("licht")
                    Text(L("Donker")).tag("donker")
                    Text(L("Automatisch")).tag("auto")
                }
                Toggle(L("Rustige kaartkleuren"), isOn: $settings.gedemptKaart)
            } header: {
                Text(L("Kaart"))
            } footer: {
                Text(L("Automatisch volgt de lichte of donkere modus van je apparaat. Met rustige kleuren vallen meldingen en helikopters beter op. Satelliet en hybride tonen ook het reliëf in 3D."))
            }
            Section {
                Picker(L("Routespoor"), selection: $settings.spoorStandaard) {
                    ForEach(SpoorBereik.allCases) { Text($0.label).tag($0.rawValue) }
                }
                Toggle(L("Eigen kleur per helikopter"), isOn: $settings.heliKleurPerToestel)
                Picker(L("Grootte op de kaart"), selection: $settings.heliIcoon) {
                    Text(L("Klein")).tag("klein")
                    Text(L("Normaal")).tag("normaal")
                    Text(L("Groot")).tag("groot")
                }
                Picker(L("Eenheden"), selection: $settings.eenheden) {
                    Text(L("Meter en km/u")).tag("metrisch")
                    Text(L("Voet en knopen")).tag("luchtvaart")
                }
            } header: {
                Text(L("Helikopters"))
            } footer: {
                Text(L("Het routespoor is wat je ziet als je een helikopter aantikt: alleen de huidige vlucht, de laatste 30 minuten of de laatste 2 uur."))
            }
            Section {
                Toggle(isOn: $settings.prestatieModus) {
                    SettingsRow(icon: "gauge.with.dots.needle.33percent", color: .gray, title: L("Prestatiemodus"))
                }
            } footer: {
                Text(L("Minder animaties en de helikopters bewegen niet vloeiend tussen twee posities. Fijn op oudere apparaten. Geldt alleen voor dit apparaat."))
            }
        }
        .formStyle(.grouped)
        .navigationTitle(L("Kaart en helikopters"))
    }
}

extension MapStyleSetting {
    @MainActor static func style(for settings: AppSettings, pointsOfInterest: Bool = false) -> MapStyle {
        let poi: PointOfInterestCategories = pointsOfInterest ? .all : .excludingAll
        let nadruk: MapStyle.StandardEmphasis = settings.gedemptKaart ? .muted : .automatic
        switch settings.mapType {
        case "satellite": return .imagery(elevation: .realistic)
        case "hybrid": return .hybrid(elevation: .realistic, pointsOfInterest: poi)
        default: return .standard(elevation: .realistic, emphasis: nadruk, pointsOfInterest: poi)
        }
    }
}

// MARK: - Rain radar on the map

/// Places the KNMI radar image over the Netherlands on a SwiftUI map (it has no image overlays of its own).
struct RadarOverlay: View {
    let proxy: MapProxy
    /// Changes with every camera move, so the image follows the map.
    let camera: Int
    @State private var radar = RadarStore.shared

    var body: some View {
        if let img = radar.afbeelding, let b = radar.info?.bbox,
           let nw = proxy.convert(CLLocationCoordinate2D(latitude: b.north, longitude: b.west), to: .local),
           let ne = proxy.convert(CLLocationCoordinate2D(latitude: b.north, longitude: b.east), to: .local),
           let sw = proxy.convert(CLLocationCoordinate2D(latitude: b.south, longitude: b.west), to: .local),
           let se = proxy.convert(CLLocationCoordinate2D(latitude: b.south, longitude: b.east), to: .local) {
            let w = hypot(ne.x - nw.x, ne.y - nw.y), h = hypot(sw.x - nw.x, sw.y - nw.y)
            img.resizable()
                .frame(width: w, height: h)
                .rotationEffect(.radians(atan2(ne.y - nw.y, ne.x - nw.x)))
                .position(x: (nw.x + se.x) / 2, y: (nw.y + se.y) / 2)
                .opacity(0.6)
                .allowsHitTesting(false)
                .accessibilityHidden(true)
                .id(camera)
        }
    }
}

// MARK: - "Klopt deze melding niet?"

struct MeldingFeedbackSheet: View {
    let melding: Melding
    @Environment(\.dismiss) private var dismiss
    @State private var reden: FeedbackReden = .locatie
    @State private var toelichting = ""
    @State private var plekKiezen = false
    @State private var position: MapCameraPosition = .automatic
    @State private var midden: CLLocationCoordinate2D?
    @State private var status: Status = .klaar
    enum Status: Equatable { case klaar, bezig, verstuurd, fout(String) }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text(melding.title).font(.headline)
                    Text(melding.plaatsText).foregroundStyle(.secondary)
                }
                Section {
                    Picker(L("Wat klopt er niet?"), selection: $reden) {
                        ForEach(FeedbackReden.allCases) { Text($0.label).tag($0) }
                    }
                    TextField(L("Toelichting (niet verplicht)"), text: $toelichting, axis: .vertical)
                        .lineLimit(2...5)
                }
                if reden == .locatie {
                    Section {
                        Toggle(L("Geef de juiste plek aan"), isOn: $plekKiezen)
                        if plekKiezen {
                            ZStack {
                                Map(position: $position).onMapCameraChange(frequency: .continuous) { midden = $0.region.center }.kaartThema()
                                Image(systemName: "mappin").font(.title).foregroundStyle(.red).offset(y: -12).allowsHitTesting(false)
                            }
                            .frame(height: 240)
                            .listRowInsets(EdgeInsets())
                        }
                    } footer: {
                        if plekKiezen { Text(L("Schuif de kaart tot de speld op de juiste plek staat.")) }
                    }
                }
                Section {
                    switch status {
                    case .verstuurd: Label(L("Bedankt! We kijken ernaar."), systemImage: "checkmark.circle.fill").foregroundStyle(.green)
                    case .fout(let t): Label(t, systemImage: "exclamationmark.triangle.fill").foregroundStyle(.orange)
                    default: EmptyView()
                    }
                } footer: {
                    Text(L("Je melding gaat anoniem naar de beheerder van A-Alerts. De gegevens komen van P2000; een foute plek of tekst komt meestal uit de meldkamer zelf."))
                }
            }
            .formStyle(.grouped)
            .navigationTitle(L("Klopt deze melding niet?"))
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .onAppear {
                let c = melding.hasCoordinate ? CLLocationCoordinate2D(latitude: melding.lat ?? 0, longitude: melding.lon ?? 0)
                    : CLLocationCoordinate2D(latitude: Config.center.lat, longitude: Config.center.lon)
                position = .region(MKCoordinateRegion(center: c, latitudinalMeters: 1500, longitudinalMeters: 1500))
            }
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button(status == .verstuurd ? L("Klaar") : L("Annuleer")) { dismiss() } }
                if status != .verstuurd {
                    ToolbarItem(placement: .confirmationAction) {
                        Button(L("Verstuur")) { Task { await verstuur() } }.disabled(status == .bezig)
                    }
                }
            }
        }
    }

    private func verstuur() async {
        status = .bezig
        do {
            try await P2000API.shared.meldingFeedback(guid: melding.guid, reden: reden, toelichting: toelichting,
                                                      plek: reden == .locatie && plekKiezen ? midden : nil)
            status = .verstuurd
        } catch {
            status = .fout(error.localizedDescription)
        }
    }
}

// MARK: - Notifications off in the system settings

/// Observes whether the system blocks notifications for the app (checked when the app becomes active).
@MainActor
@Observable
final class MeldingToestemming {
    static let shared = MeldingToestemming()
    private(set) var geweigerd = false
    func controleer() async {
        let s = await UNUserNotificationCenter.current().notificationSettings()
        geweigerd = s.authorizationStatus == .denied || (s.authorizationStatus == .authorized && s.alertSetting == .disabled && s.notificationCenterSetting == .disabled)
    }
}

/// "Meldingen staan uit" with a button to the system settings. Only when the user did turn on push in the app.
struct MeldingenUitBanner: View {
    @Environment(AppSettings.self) private var settings
    @State private var status = MeldingToestemming.shared

    var body: some View {
            if settings.notificationsEnabled && status.geweigerd {
                HStack(alignment: .top, spacing: 10) {
                    Image(systemName: "bell.slash.fill").foregroundStyle(.white).font(.title3)
                    VStack(alignment: .leading, spacing: 4) {
                        Text(L("Pushmeldingen staan uit")).font(.subheadline.weight(.semibold)).foregroundStyle(.white)
                        Text(L("Je hebt meldingen aangezet in A-Alerts, maar je apparaat houdt ze tegen.")).font(.caption).foregroundStyle(.white.opacity(0.9))
                        Button(L("Open instellingen")) { openSettings() }
                            .font(.caption.weight(.bold)).buttonStyle(.borderedProminent).tint(.white).foregroundStyle(.red)
                    }
                    Spacer(minLength: 0)
                }
                .padding(12)
                .background(Color.red.gradient, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            }
    }

    private func openSettings() {
        #if os(iOS)
        if let url = URL(string: UIApplication.openNotificationSettingsURLString) { UIApplication.shared.open(url) }
        #elseif os(macOS)
        if let url = URL(string: "x-apple.systempreferences:com.apple.Notifications-Settings.extension") { NSWorkspace.shared.open(url) }
        #endif
    }
}
