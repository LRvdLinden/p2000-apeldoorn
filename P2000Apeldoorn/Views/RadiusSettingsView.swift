import SwiftUI
import MapKit

/// "Mijn buurt": only alerts within a radius of your location or a fixed point –
/// in the list, on the map, in the widgets and for push notifications.
struct RadiusSettingsView: View {
    @Environment(AppSettings.self) private var settings
    @Environment(LocationManager.self) private var location

    @State private var position: MapCameraPosition = .automatic
    @State private var search = ""
    @State private var searching = false
    @State private var searchError: String?

    private var center: CLLocationCoordinate2D? {
        settings.radiusCenter.map { CLLocationCoordinate2D(latitude: $0.lat, longitude: $0.lon) }
    }

    var body: some View {
        @Bindable var settings = settings
        Form {
            Section {
                Toggle(isOn: Binding(get: { settings.radiusEnabled }, set: { on in
                    settings.radiusEnabled = on
                    if on { location.start() }
                })) {
                    SettingsRow(icon: "scope", color: .red, title: L("Alleen meldingen in mijn buurt"))
                }
            } footer: {
                Text(L("Geldt voor de lijst, de kaart, de widgets én je pushmeldingen."))
            }

            if settings.radiusEnabled {
                Section {
                    Picker(L("Vanaf"), selection: Binding(get: { settings.radiusMode }, set: { mode in
                        settings.radiusMode = mode
                        if mode == "huidig" { location.start() }
                        recenter()
                    })) {
                        Text(L("Mijn locatie")).tag("huidig")
                        Text(L("Vast punt")).tag("vast")
                    }
                    .pickerStyle(.segmented)

                    VStack(alignment: .leading, spacing: 6) {
                        HStack {
                            Text(L("Radius"))
                            Spacer()
                            Text(Lf("%@ km", settings.radiusKm.formatted(.number.precision(.fractionLength(settings.radiusKm < 10 ? 1 : 0)))))
                                .font(.body.weight(.semibold).monospacedDigit())
                                .foregroundStyle(Theme.red)
                        }
                        Slider(value: Binding(get: { settings.radiusKm }, set: { settings.radiusKm = $0; recenter() }),
                               in: 0.5...25, step: 0.5) {
                            Text(L("Radius"))
                        } minimumValueLabel: { Text("0,5") } maximumValueLabel: { Text("25") }
                    }
                } header: {
                    Text(L("Mijn buurt"))
                }

                Section {
                    mapPicker
                        .frame(height: 300)
                        .listRowInsets(EdgeInsets())
                    if settings.radiusMode == "vast" {
                        HStack {
                            TextField(L("Zoek een adres of plaats"), text: $search)
                                .onSubmit { Task { await find() } }
                                #if os(iOS)
                                .textInputAutocapitalization(.words)
                                #endif
                            if searching { ProgressView() }
                        }
                        if let searchError {
                            Text(searchError).font(.caption).foregroundStyle(.red)
                        }
                        Button {
                            if let loc = location.location {
                                setFixed(loc.coordinate, name: L("Mijn locatie"))
                            } else {
                                location.start()
                            }
                        } label: {
                            Label(L("Gebruik mijn huidige locatie"), systemImage: "location.fill")
                        }
                        if !settings.fixedName.isEmpty {
                            LabeledContent(L("Vast punt"), value: settings.fixedName)
                        }
                    }
                } footer: {
                    if settings.radiusMode == "vast" {
                        Text(L("Tik op de kaart om het middelpunt te kiezen."))
                    } else if center == nil {
                        Text(L("Je locatie is nog niet bekend. Sta locatietoegang toe voor P2000 Apeldoorn."))
                            .foregroundStyle(.red)
                    } else {
                        Text(L("Het middelpunt schuift mee als je de app opent op een andere plek. Je locatie wordt afgerond op zo'n 100 meter."))
                    }
                }
            }
        }
        .formStyle(.grouped)
        .navigationTitle(L("Mijn buurt"))
        .onAppear {
            location.start()
            recenter()
        }
    }

    private var mapPicker: some View {
        MapReader { proxy in
            Map(position: $position) {
                if let center {
                    MapCircle(center: center, radius: settings.radiusKm * 1000)
                        .foregroundStyle(Theme.red.opacity(0.14))
                        .stroke(Theme.red, lineWidth: 2)
                    Annotation(L("Middelpunt"), coordinate: center, anchor: .center) {
                        Circle()
                            .fill(Theme.red)
                            .frame(width: 16, height: 16)
                            .overlay(Circle().stroke(.white, lineWidth: 3))
                            .shadow(radius: 2)
                    }
                }
                UserAnnotation()
            }
            .mapStyle(MapStyleSetting.style(for: settings.mapType))
            .onTapGesture { point in
                guard settings.radiusMode == "vast", let coordinate = proxy.convert(point, from: .local) else { return }
                setFixed(coordinate, name: String(format: "%.3f, %.3f", coordinate.latitude, coordinate.longitude))
            }
        }
    }

    private func setFixed(_ c: CLLocationCoordinate2D, name: String) {
        settings.fixedLat = (c.latitude * 1000).rounded() / 1000
        settings.fixedLon = (c.longitude * 1000).rounded() / 1000
        settings.fixedName = name
        recenter()
    }

    private func recenter() {
        let c = center ?? CLLocationCoordinate2D(latitude: Config.center.lat, longitude: Config.center.lon)
        let meters = max(settings.radiusKm, 1) * 2600
        withAnimation {
            position = .region(MKCoordinateRegion(center: c, latitudinalMeters: meters, longitudinalMeters: meters))
        }
    }

    private func find() async {
        let query = search.trimmingCharacters(in: .whitespaces)
        guard !query.isEmpty else { return }
        searching = true
        searchError = nil
        defer { searching = false }
        let request = MKLocalSearch.Request()
        request.naturalLanguageQuery = query
        request.region = MKCoordinateRegion(center: CLLocationCoordinate2D(latitude: Config.center.lat, longitude: Config.center.lon),
                                            latitudinalMeters: 40_000, longitudinalMeters: 40_000)
        if let item = try? await MKLocalSearch(request: request).start().mapItems.first {
            setFixed(item.placemark.coordinate, name: item.name ?? query)
        } else {
            searchError = L("Niets gevonden.")
        }
    }
}
