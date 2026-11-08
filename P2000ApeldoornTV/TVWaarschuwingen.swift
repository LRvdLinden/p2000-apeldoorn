import SwiftUI
import MapKit

/// A-Alerts on Apple TV: NL-Alert and Burgernet between the alerts, KNMI as a bar, and a detail screen.

/// One entry in the meldkamer list: a P2000 alert or a warning.
enum TVLijstItem: Identifiable {
    case melding(Melding)
    case waarschuwing(Waarschuwing)

    var id: String {
        switch self {
        case .melding(let m): "m:\(m.guid)"
        case .waarschuwing(let w): "w:\(w.id)"
        }
    }
    var datum: Date {
        switch self {
        case .melding(let m): m.datum
        case .waarschuwing(let w): w.start
        }
    }
}

struct TVWaarschuwingRow: View {
    let waarschuwing: Waarschuwing

    var body: some View {
        HStack(alignment: .top, spacing: 18) {
            WaarschuwingIcon(waarschuwing: waarschuwing, size: 36)
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 10) {
                    Text(verbatim: waarschuwing.kop).font(AppFont.body(16, .bold))
                        .foregroundStyle(waarschuwing.bron == .nlalert ? Color.orange : waarschuwing.color)
                    Text(waarschuwing.statusLabel).font(AppFont.body(14, .semibold))
                        .padding(.horizontal, 8).padding(.vertical, 2)
                        .background(Color.white.opacity(0.12), in: Capsule())
                    Text(verbatim: TVWaarschuwingTijd.tekst(waarschuwing)).font(AppFont.body(16, .regular).monospacedDigit()).foregroundStyle(.secondary)
                }
                Text(waarschuwing.titel).font(AppFont.body(22, .semibold)).lineLimit(2)
                if let plaats = waarschuwing.plaats ?? (waarschuwing.bron == .nlalert ? L("Gemeente Apeldoorn") : nil) {
                    Text(plaats).font(AppFont.body(16, .regular)).foregroundStyle(.secondary)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .saturation(waarschuwing.isBeeindigd ? 0 : 1)
        .opacity(waarschuwing.isBeeindigd ? 0.5 : 1)
    }
}

enum TVWaarschuwingTijd {
    /// "13:15" (today) or "5 nov. 13:15", with the end time once ended.
    static func tekst(_ w: Waarschuwing) -> String {
        let begin = Calendar.current.isDateInToday(w.start)
            ? Fmt.time(w.start)
            : "\(w.start.formatted(.dateTime.day().month(.abbreviated))) \(Fmt.time(w.start))"
        if w.isBeeindigd, let einde = w.einde, einde > w.start { return "\(begin)–\(Fmt.time(einde))" }
        return begin
    }
}

/// KNMI weather warnings as a bar at the top of the side panel while they apply.
struct TVKnmiBalk: View {
    let items: [Waarschuwing]
    var open: (Waarschuwing) -> Void

    var body: some View {
        VStack(spacing: 10) {
            ForEach(items) { w in
                Button { open(w) } label: {
                    HStack(spacing: 14) {
                        Image(systemName: w.systemImage).font(.system(size: 26, weight: .semibold))
                        VStack(alignment: .leading, spacing: 2) {
                            Text(verbatim: w.kop).font(AppFont.body(20, .bold))
                            Text(w.titel).font(AppFont.body(16, .regular)).lineLimit(1)
                            if let regel = (w.knmiKop ?? w.advies ?? w.verwachting)?.split(separator: "\n").first {
                                Text(String(regel)).font(AppFont.body(15, .regular)).lineLimit(1).opacity(0.9)
                            }
                        }
                        Spacer(minLength: 0)
                    }
                    .foregroundStyle(w.onColor)
                    .padding(.horizontal, 18).padding(.vertical, 12)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(w.color, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                }
                .buttonStyle(.card)
            }
        }
    }
}

/// Full-screen detail of a warning: area on the map, text, status and times.
struct TVWaarschuwingDetail: View {
    let waarschuwing: Waarschuwing
    @Environment(\.dismiss) private var dismiss
    @Environment(AppSettings.self) private var settings
    @State private var meldingen: [Melding] = []
    @State private var weather: AlertWeather?
    @State private var selected: Melding?

    var body: some View {
        HStack(alignment: .top, spacing: 50) {
            Map(initialPosition: startPositie, interactionModes: []) {
                ForEach(Array(waarschuwing.rings.enumerated()), id: \.offset) { _, ring in
                    MapPolygon(coordinates: ring)
                        .foregroundStyle(waarschuwing.color.opacity(0.28))
                        .stroke(waarschuwing.color, lineWidth: 3)
                }
                if let c = waarschuwing.coordinate {
                    Annotation(waarschuwing.titel, coordinate: c, anchor: .bottom) { WaarschuwingMarker(waarschuwing: waarschuwing, size: 64) }
                        .annotationTitles(.hidden)
                }
                ForEach(meldingen.filter(\.hasCoordinate)) { m in
                    Annotation(m.title, coordinate: CLLocationCoordinate2D(latitude: m.lat ?? 0, longitude: m.lon ?? 0), anchor: .bottom) {
                        DienstMarker(dienst: m.dienst, size: 40)
                    }
                    .annotationTitles(.hidden)
                }
            }
            .mapStyle(.standard(elevation: .realistic, pointsOfInterest: .excludingAll))
            .clipShape(RoundedRectangle(cornerRadius: 34, style: .continuous))
            .frame(maxWidth: .infinity)

            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    HStack(spacing: 20) {
                        WaarschuwingIcon(waarschuwing: waarschuwing, size: 64)
                        VStack(alignment: .leading, spacing: 6) {
                            Text(verbatim: waarschuwing.kop).font(AppFont.body(22, .bold)).foregroundStyle(waarschuwing.bron == .nlalert ? Color.orange : waarschuwing.color)
                            Text(waarschuwing.titel).font(AppFont.heading(32))
                        }
                    }
                    Label(waarschuwing.statusLabel, systemImage: waarschuwing.isBeeindigd ? "checkmark.circle" : "dot.radiowaves.left.and.right")
                        .font(AppFont.body(22, .medium))
                    Label(TVWaarschuwingTijd.tekst(waarschuwing), systemImage: "clock").font(AppFont.body(22, .medium))
                    if waarschuwing.isOpgeheven {
                        Label(L("Code groen: deze weerwaarschuwing is opgeheven."), systemImage: "checkmark.circle.fill")
                            .font(AppFont.body(22, .semibold)).foregroundStyle(Waarschuwing.codeColor("green"))
                    }
                    if let p = waarschuwing.plaats { Label(p, systemImage: "mappin.and.ellipse").font(AppFont.body(22, .medium)) }
                    if waarschuwing.heeftKnmiTekst {
                        if let k = waarschuwing.knmiKop { Text(k).font(AppFont.body(24, .bold)) }
                        if let o = waarschuwing.omschrijving { Text(o).font(AppFont.body(22, .regular)).foregroundStyle(.secondary) }
                        let regels = waarschuwing.knmiAdviesRegels
                        if !regels.isEmpty {
                            Text(L("Risico's en advies")).font(AppFont.body(22, .bold)).padding(.top, 4)
                            ForEach(Array(regels.enumerated()), id: \.offset) { _, r in
                                Text(verbatim: "•  \(r)").font(AppFont.body(21, .regular)).foregroundStyle(.secondary)
                            }
                        }
                        if let d = waarschuwing.details { Text(d).font(AppFont.body(20, .regular)).foregroundStyle(.secondary) }
                        if let vakken = waarschuwing.tijdvakken, vakken.count > 1 {
                            Text(L("Verloop")).font(AppFont.body(22, .bold)).padding(.top, 4)
                            ForEach(vakken, id: \.self) { t in
                                Text(verbatim: "\(Waarschuwing.codeLabel(t.niveau))  \(Fmt.dayTime(t.start)) – \(Fmt.time(t.einde))")
                                    .font(AppFont.body(20, .regular)).foregroundStyle(Waarschuwing.codeColor(t.niveau))
                            }
                        }
                    } else if let t = waarschuwing.tekst, !t.isEmpty {
                        Text(t).font(AppFont.body(22, .regular)).foregroundStyle(.secondary)
                    }
                    if let w = weather { TVWeerBlok(weather: w) }
                    if !meldingen.isEmpty {
                        Text(Lf("Meldingen in de buurt (%lld)", meldingen.count)).font(AppFont.heading(24)).padding(.top, 6)
                        ForEach(meldingen.prefix(8)) { m in
                            Button { selected = m } label: { TVRow(melding: m, read: settings.isRead(m)) }
                                .buttonStyle(.card)
                        }
                        Text(L("Mogelijk verband, geen zekerheid.")).font(AppFont.body(14, .regular)).foregroundStyle(.secondary)
                    }
                    Button(L("Sluiten")) { dismiss() }.padding(.top, 10)
                }
                .padding(.trailing, 20)
            }
            .frame(width: 760)
        }
        .padding(60)
        .background(Color(hex: 0x0B0B0F).ignoresSafeArea())
        .fullScreenCover(item: $selected) { m in TVDetailView(melding: m) }
        .task(id: waarschuwing.id) {
            // A weather code covers a whole region: no alerts nearby, and the weather is live.
            if waarschuwing.bron != .knmi, let d = try? await P2000API.shared.waarschuwing(id: waarschuwing.id) { meldingen = d.meldingen }
            weather = await P2000API.shared.waarschuwingWeather(id: waarschuwing.id)
            while waarschuwing.bron == .knmi, !Task.isCancelled {
                try? await Task.sleep(for: .seconds(300))
                if Task.isCancelled { break }
                if let w = await P2000API.shared.waarschuwingWeather(id: waarschuwing.id) { weather = w }
            }
        }
    }

    private var startPositie: MapCameraPosition {
        let punten = waarschuwing.rings.flatMap { $0 } + [waarschuwing.coordinate].compactMap { $0 }
        guard !punten.isEmpty else { return .region(MeldkamerView.overview) }
        let lats = punten.map(\.latitude), lons = punten.map(\.longitude)
        let center = CLLocationCoordinate2D(latitude: (lats.min()! + lats.max()!) / 2, longitude: (lons.min()! + lons.max()!) / 2)
        let span = MKCoordinateSpan(latitudeDelta: max((lats.max()! - lats.min()!) * 1.4, 0.04),
                                    longitudeDelta: max((lons.max()! - lons.min()!) * 1.4, 0.07))
        return .region(MKCoordinateRegion(center: center, span: span))
    }
}

/// Alarmed stations with an estimated arrival time, and alerts that may belong to the same incident.
struct TVInzetBlok: View {
    let melding: Melding
    @Environment(MeldingStore.self) private var store
    @State private var routes: [KazerneRoute] = []

    var body: some View {
        let verbanden = Verband.gekoppeld(aan: melding, in: store.meldingen, max: 6)
        VStack(alignment: .leading, spacing: 14) {
            if !routes.isEmpty {
                Text(L("Gealarmeerde kazernes")).font(AppFont.heading(24)).padding(.top, 6)
                ForEach(routes) { r in
                    HStack(spacing: 16) {
                        KazerneIcon(soort: r.kazerne.soort, size: 36)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(r.kazerne.naam).font(AppFont.body(20, .semibold))
                            Text("\(r.afstandTekst) · \(r.rijtijdTekst)").font(AppFont.body(16, .regular)).foregroundStyle(.secondary)
                        }
                        Spacer()
                        Text(r.aankomst <= .now ? L("Waarschijnlijk ter plaatse") : Lf("± %@", Fmt.time(r.aankomst)))
                            .font(AppFont.body(18, .semibold).monospacedDigit())
                    }
                }
                Text(L("Geschatte tijden, zonder voertuigposities.")).font(AppFont.body(14, .regular)).foregroundStyle(.secondary)
            }
            if !verbanden.isEmpty {
                Text(L("Verloop")).font(AppFont.heading(24)).padding(.top, 6)
                let lijst = ([melding] + verbanden.map(\.melding)).sorted { $0.datum < $1.datum }
                ForEach(lijst) { m in
                    HStack(spacing: 16) {
                        Text(Fmt.time(m.datum)).font(AppFont.body(18, .semibold).monospacedDigit()).frame(width: 80, alignment: .leading)
                        DienstIcon(dienst: m.dienst, size: 28)
                        Text(m.guid == melding.guid ? L("Deze melding") : m.title).font(AppFont.body(18, m.guid == melding.guid ? .bold : .regular)).lineLimit(1)
                    }
                }
                Text(L("Mogelijk verband, geen zekerheid.")).font(AppFont.body(14, .regular)).foregroundStyle(.secondary)
            }
        }
        .task(id: melding.guid) { routes = await Aanrijtijd.routes(voor: melding) }
    }
}

/// Weather at the time and place (warnings), in the same style as the alert detail.
struct TVWeerBlok: View {
    let weather: AlertWeather
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(L("METEO-gegevens")).font(AppFont.heading(24)).padding(.top, 6)
            HStack(spacing: 30) {
                if let t = weather.temperature { metric("thermometer.medium", "\(Int(t.rounded()))°C", L("Temperatuur")) }
                if let c = weather.cloudCover { metric("cloud.fill", "\(Int((c * 100).rounded()))%", L("Bewolking")) }
                if let s = weather.windSpeed { metric("wind", "\(Int(s.rounded())) km/h", L("Wind")) }
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

/// Tab "Waarschuwingen": NL-Alert, Burgernet and KNMI of the last two weeks, per day (like "Alle waarschuwingen").
struct TVWaarschuwingenView: View {
    @State private var items: [Waarschuwing] = []
    @State private var loaded = false
    @State private var selected: Waarschuwing?

    private var perDag: [(dag: Date, items: [Waarschuwing])] {
        let groups = Dictionary(grouping: items) { Calendar.current.startOfDay(for: $0.start) }
        return groups.keys.sorted(by: >).map { ($0, groups[$0]!.sorted { $0.start > $1.start }) }
    }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 14) {
                Text(L("NL-Alert, Burgernet en KNMI van de laatste 14 dagen voor de gemeente Apeldoorn en Teuge."))
                    .font(AppFont.body(20, .regular)).foregroundStyle(.secondary)
                if loaded && items.isEmpty {
                    Text(L("Geen waarschuwingen in de laatste twee weken.")).foregroundStyle(.secondary).frame(maxWidth: .infinity, minHeight: 200)
                }
                ForEach(perDag, id: \.dag) { groep in
                    Text(groep.dag.formatted(.dateTime.weekday(.wide).day().month(.wide))).font(AppFont.heading(24)).padding(.top, 14)
                    ForEach(groep.items) { w in
                        Button { selected = w } label: { TVWaarschuwingRow(waarschuwing: w) }
                            .buttonStyle(.card)
                    }
                }
            }
            .padding(.horizontal, 80)
            .padding(.vertical, 30)
        }
        .fullScreenCover(item: $selected) { w in TVWaarschuwingDetail(waarschuwing: w) }
        .task {
            items = (try? await P2000API.shared.waarschuwingen(days: 14)) ?? []
            loaded = true
        }
    }
}
