import SwiftUI
import MapKit

/// Detail of one alert on the TV: big 3D map, all data, capcodes and the weather.
struct TVDetailView: View {
    let melding: Melding
    @Environment(AppSettings.self) private var settings
    @Environment(\.dismiss) private var dismiss
    @State private var weather: AlertWeather?
    @State private var routes: [KazerneRoute] = []
    @State private var helis = HeliStore.shared
    @State private var heliSpoor = HeliSpoorStore()
    /// The Lifeliner/Zulu named in the alert, live.
    private var liveHeli: Helikopter? { HeliKoppeling.relevant(melding) ? HeliKoppeling.heli(voor: melding, in: helis.items) : nil }

    var body: some View {
        HStack(alignment: .top, spacing: 50) {
            VStack(spacing: 24) {
                if let lat = melding.lat, let lon = melding.lon, melding.hasCoordinate {
                    let coord = CLLocationCoordinate2D(latitude: lat, longitude: lon)
                    Map(initialPosition: routes.isEmpty && liveHeli == nil ? .camera(MapCamera(centerCoordinate: coord, distance: 1400, heading: 0, pitch: 45)) : .automatic, interactionModes: []) {
                        // Alarmed stations: the road route from the A-Alerts API (else a straight dashed line).
                        ForEach(routes) { r in
                            MapPolyline(coordinates: r.polyline.map { line in
                                var pts = [CLLocationCoordinate2D](repeating: .init(), count: line.pointCount)
                                line.getCoordinates(&pts, range: NSRange(location: 0, length: line.pointCount))
                                return pts
                            } ?? [r.kazerne.coordinate, coord])
                            .stroke(r.kazerne.dienst.color, style: StrokeStyle(lineWidth: 3.5, lineCap: .round, dash: [9, 7]))
                            Annotation(r.kazerne.naam, coordinate: r.kazerne.coordinate, anchor: .center) { KazerneIcon(soort: r.kazerne.soort, size: 36) }
                                .annotationTitles(.hidden)
                        }
                        if let h = liveHeli {
                            let gevlogen = heliSpoor.heliID == h.id ? heliSpoor.coordinates(live: h.geschat()) : []
                            if gevlogen.count >= 2 {
                                MapPolyline(coordinates: gevlogen)
                                    .stroke(h.color, style: StrokeStyle(lineWidth: 6, lineCap: .round, lineJoin: .round))
                            }
                            MapPolyline(coordinates: [h.geschat(), coord])
                                .stroke(h.color, style: StrokeStyle(lineWidth: 5, lineCap: .round, dash: [6, 10]))
                            Annotation(h.naam, coordinate: h.geschat(), anchor: .center) { HeliMarker(heli: h, size: 34) }
                                .annotationTitles(.hidden)
                        }
                        Annotation("", coordinate: coord, anchor: .bottom) { TVMarker(melding: melding, highlighted: true) }
                    }
                    .id("\(routes.count)-\(liveHeli?.id ?? "")")
                    .mapStyle(.standard(elevation: .realistic, pointsOfInterest: .excludingAll))
                    .clipShape(RoundedRectangle(cornerRadius: 34, style: .continuous))
                } else {
                    RoundedRectangle(cornerRadius: 34, style: .continuous).fill(.white.opacity(0.06))
                        .overlay(Text(L("Geen exacte locatie bekend")).foregroundStyle(.secondary))
                }
            }
            .frame(maxWidth: .infinity)

            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    HStack(spacing: 20) {
                        DienstIcon(dienst: melding.dienst, size: 60)
                        VStack(alignment: .leading, spacing: 6) {
                            Text(melding.title).font(AppFont.heading(32))
                            Text(melding.prioriteitText).font(AppFont.body(22, .semibold)).foregroundStyle(melding.dienst.textColor)
                        }
                    }
                    infoRow("mappin.and.ellipse", melding.plaatsText)
                    infoRow("clock", "\(melding.datum.formatted(date: .complete, time: .standard)) · \(melding.agoText)")
                    TVInzetBlok(melding: melding)
                    if HeliKoppeling.relevant(melding) { heliBlok }
                    if let w = weather { weatherBlock(w) }
                    if !melding.eenheden.isEmpty {
                        section(Lf("Capcodes (%lld)", melding.eenheden.count))
                        ForEach(Array(melding.eenheden.enumerated()), id: \.offset) { _, e in
                            VStack(alignment: .leading, spacing: 2) {
                                Text(e.naam ?? e.code ?? "").font(AppFont.body(20, .semibold))
                                Text([e.type, e.regio].compactMap { $0 }.joined(separator: " / ")).font(AppFont.body(16, .regular)).foregroundStyle(.secondary)
                                Text(e.code ?? "").font(AppFont.body(16, .regular).monospaced()).foregroundStyle(Theme.red)
                            }
                        }
                    }
                    if !melding.voertuigen.isEmpty {
                        section(Lf("Voertuigen (%lld)", melding.voertuigen.count))
                        ForEach(Array(melding.voertuigen.enumerated()), id: \.offset) { _, v in
                            Text("\(v.label ?? L("Voertuig")) · \(v.nrb ?? v.nra ?? "")").font(AppFont.body(20, .semibold))
                        }
                    }
                    if let f = melding.fullMelding {
                        section(L("Volledige melding"))
                        Text(f).font(AppFont.body(18, .regular).monospaced()).foregroundStyle(.secondary)
                    }
                    Button(L("Sluiten")) { dismiss() }.padding(.top, 10)
                }
                .padding(.trailing, 20)
            }
            .frame(width: 760)
        }
        .padding(60)
        .background(Color(hex: 0x0B0B0F).ignoresSafeArea())
        .onAppear { if HeliKoppeling.relevant(melding) { helis.start() } }
        .onDisappear { if HeliKoppeling.relevant(melding) { helis.stop() }; heliSpoor.volg(nil) }
        .onChange(of: liveHeli?.id, initial: true) { _, id in heliSpoor.volg(id) }
        .task {
            settings.markRead(melding)
            MeldingStore.shared.registerView(melding)
            weather = await P2000API.shared.weather(guid: melding.guid)
            routes = await Aanrijtijd.routes(voor: melding)
        }
    }

    /// Lifeliner/Zulu of this alert, live.
    @ViewBuilder private var heliBlok: some View {
        section(liveHeli?.naam ?? HeliKoppeling.genoemd(melding).map(HeliKoppeling.naam) ?? L("Traumahelikopter"))
        if let h = liveHeli {
            HStack(spacing: 18) {
                Image(h.afbeelding).resizable().scaledToFit().frame(width: 150, height: 54).scaleEffect(x: h.vliegtWest ? -1 : 1, y: 1)
                VStack(alignment: .leading, spacing: 4) {
                    Text([h.opGrond ? L("Op de grond") : h.hoogteMeter.map { "\($0) m" }, h.snelheidKmh.map { "\($0) km/u" }, h.koersTekst].compactMap { $0 }.joined(separator: " · "))
                        .font(AppFont.body(20, .semibold))
                    if let lat = melding.lat, let lon = melding.lon {
                        Text(Lf("%@ km van de melding", Werkgebied.distanceKm(h.lat, h.lon, lat, lon).formatted(.number.precision(.fractionLength(1)))))
                            .font(AppFont.body(18, .regular)).foregroundStyle(.secondary)
                    }
                }
            }
        } else {
            Text(L("De helikopter is nu niet live te zien. Laag vliegend of aan de grond ontbreekt de positie soms.")).font(AppFont.body(18, .regular)).foregroundStyle(.secondary)
        }
        if !heliSpoor.vluchten.isEmpty { HeliVluchtenLijst(vluchten: heliSpoor.vluchten, aantal: 3) }
    }

    private func section(_ title: String) -> some View {
        Text(title).font(AppFont.heading(24)).padding(.top, 6)
    }

    private func infoRow(_ icon: String, _ text: String) -> some View {
        Label(text, systemImage: icon).font(AppFont.body(22, .medium))
    }

    private func weatherBlock(_ w: AlertWeather) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            section(L("METEO-gegevens"))
            HStack(spacing: 30) {
                if let t = w.temperature { metric("thermometer.medium", "\(Int(t.rounded()))°C", L("Temperatuur")) }
                if let c = w.cloudCover { metric("cloud.fill", "\(Int((c * 100).rounded()))%", L("Bewolking")) }
                if let s = w.windSpeed { metric("wind", "\(Int(s.rounded())) km/h", L("Wind")) }
            }
            Text(" Weather").font(AppFont.body(12, .regular, relativeTo: .caption)).foregroundStyle(.secondary)
        }
    }

    private func metric(_ icon: String, _ value: String, _ label: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Image(systemName: icon).font(.system(size: 24)).foregroundStyle(.blue)
            Text(value).font(AppFont.body(26, .bold))
            Text(label).font(AppFont.body(16, .regular)).foregroundStyle(.secondary)
        }
    }
}
