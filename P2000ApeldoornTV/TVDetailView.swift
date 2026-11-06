import SwiftUI
import MapKit

/// Detail of one alert on the TV: big 3D map, all data, capcodes and the weather.
struct TVDetailView: View {
    let melding: Melding
    @Environment(AppSettings.self) private var settings
    @Environment(\.dismiss) private var dismiss
    @State private var weather: AlertWeather?
    @State private var routes: [KazerneRoute] = []

    var body: some View {
        HStack(alignment: .top, spacing: 50) {
            VStack(spacing: 24) {
                if let lat = melding.lat, let lon = melding.lon, melding.hasCoordinate {
                    let coord = CLLocationCoordinate2D(latitude: lat, longitude: lon)
                    Map(initialPosition: routes.isEmpty ? .camera(MapCamera(centerCoordinate: coord, distance: 1400, heading: 0, pitch: 45)) : .automatic, interactionModes: []) {
                        // Alarmed stations: a dashed line to the alert (tvOS has no driving routes).
                        ForEach(routes) { r in
                            MapPolyline(coordinates: r.polyline.map { line in
                                var pts = [CLLocationCoordinate2D](repeating: .init(), count: line.pointCount)
                                line.getCoordinates(&pts, range: NSRange(location: 0, length: line.pointCount))
                                return pts
                            } ?? [r.kazerne.coordinate, coord])
                            .stroke(r.kazerne.dienst.color, style: StrokeStyle(lineWidth: 5, lineCap: .round, dash: [12, 8]))
                            Annotation(r.kazerne.naam, coordinate: r.kazerne.coordinate, anchor: .center) { KazerneIcon(soort: r.kazerne.soort, size: 36) }
                                .annotationTitles(.hidden)
                        }
                        Annotation("", coordinate: coord, anchor: .bottom) { TVMarker(melding: melding, highlighted: true) }
                    }
                    .id(routes.count)
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
        .task {
            settings.markRead(melding)
            MeldingStore.shared.registerView(melding)
            weather = await P2000API.shared.weather(guid: melding.guid)
            routes = await Aanrijtijd.routes(voor: melding)
        }
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
