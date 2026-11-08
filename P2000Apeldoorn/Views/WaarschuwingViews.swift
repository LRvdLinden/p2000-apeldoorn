import SwiftUI
import MapKit

// MARK: - Pager row

/// NL-Alert or Burgernet in the pager, between the P2000 alerts.
struct WaarschuwingRow: View {
    let waarschuwing: Waarschuwing

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            WaarschuwingIcon(waarschuwing: waarschuwing, size: 38)
                .padding(.top, 2)
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 6) {
                    Text(verbatim: waarschuwing.kop)
                        .font(AppFont.body(12, .bold, relativeTo: .caption))
                        .foregroundStyle(waarschuwing.bron == .nlalert ? Color.orange : waarschuwing.color)
                    StatusChip(waarschuwing: waarschuwing)
                    Spacer(minLength: 4)
                    Text(verbatim: tijdTekst)
                        .monospacedDigit()
                    .font(AppFont.body(12, .regular, relativeTo: .caption))
                    .foregroundStyle(.secondary)
                }
                Text(waarschuwing.titel)
                    .font(AppFont.body(15, .bold, relativeTo: .subheadline))
                    .foregroundStyle(.primary)
                    .lineLimit(2)
                if let plaats = waarschuwing.plaats ?? (waarschuwing.bron == .nlalert ? L("Gemeente Apeldoorn") : nil) {
                    HStack(spacing: 4) {
                        Image(systemName: "mappin.and.ellipse")
                        Text(plaats)
                    }
                    .font(AppFont.body(12, .regular, relativeTo: .caption))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                }
            }
        }
        .padding(.vertical, 4)
        // Ended: greyed out like an alert you have already opened.
        .saturation(waarschuwing.isBeeindigd ? 0 : 1)
        .opacity(waarschuwing.isBeeindigd ? 0.5 : 1)
        .accessibilityElement(children: .combine)
    }

    /// The time of the warning (with the end time once it has ended), not "x minutes ago".
    private var tijdTekst: String {
        let start = waarschuwing.start
        let begin = Calendar.current.isDateInToday(start)
            ? Fmt.time(start)
            : "\(start.formatted(.dateTime.day().month(.abbreviated))) \(Fmt.time(start))"
        if waarschuwing.isBeeindigd, let einde = waarschuwing.einde, einde > start {
            return "\(begin)–\(Fmt.time(einde))"
        }
        return begin
    }
}

struct StatusChip: View {
    let waarschuwing: Waarschuwing

    var body: some View {
        Text(waarschuwing.statusLabel)
            .font(AppFont.body(11, .semibold, relativeTo: .caption2))
            .padding(.horizontal, 6).padding(.vertical, 2)
            .background(waarschuwing.isBeeindigd ? Color.secondary.opacity(0.18) : waarschuwing.color.opacity(0.22),
                        in: Capsule())
            .foregroundStyle(waarschuwing.isBeeindigd ? Color.secondary : Color.primary)
    }
}

// MARK: - KNMI bar

/// KNMI weather warnings are not in the timeline but shown as a bar at the top while they apply.
struct KnmiBanner: View {
    let items: [Waarschuwing]
    var open: (Waarschuwing) -> Void

    var body: some View {
        VStack(spacing: 8) {
            ForEach(items) { w in
                Button { open(w) } label: {
                    HStack(spacing: 12) {
                        Image(systemName: w.systemImage)
                            .font(.title3.weight(.semibold))
                            .frame(width: 30)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(verbatim: w.kop).font(AppFont.body(15, .bold, relativeTo: .subheadline))
                            Text(validity(w)).font(AppFont.body(12, .regular, relativeTo: .caption))
                            if let regel = (w.knmiKop ?? w.verwachting)?.split(separator: "\n").first {
                                Text(String(regel)).font(AppFont.body(12, .regular, relativeTo: .caption)).lineLimit(1).opacity(0.9)
                            }
                        }
                        Spacer(minLength: 0)
                        Image(systemName: "chevron.right").font(.caption.weight(.bold)).opacity(0.7)
                    }
                    .foregroundStyle(w.onColor)
                    .padding(12)
                    .background(w.color, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                }
                .buttonStyle(.plain)
                .accessibilityHint(L("Open de weerwaarschuwing"))
            }
        }
    }

    private func validity(_ w: Waarschuwing) -> String {
        let end = w.einde.map { Fmt.dayTime($0) } ?? "?"
        if w.status == "verwacht" { return Lf("Vanaf %@ tot %@", Fmt.dayTime(w.start), end) }
        return Lf("Geldig tot %@", end)
    }
}

// MARK: - Detail

/// The warning area (or Burgernet place) on a map, with the linked P2000 alerts.
struct WaarschuwingMap: View {
    let waarschuwing: Waarschuwing
    let meldingen: [Melding]
    @State private var position: MapCameraPosition = .automatic

    var body: some View {
        Map(position: $position) {
            ForEach(Array(waarschuwing.rings.enumerated()), id: \.offset) { _, ring in
                MapPolygon(coordinates: ring)
                    .foregroundStyle(waarschuwing.color.opacity(0.22))
                    .stroke(waarschuwing.bron == .nlalert ? Color.orange : waarschuwing.color, lineWidth: 2)
            }
            if (waarschuwing.rings.isEmpty || waarschuwing.bron != .knmi), let c = waarschuwing.coordinate {
                Annotation(waarschuwing.plaats ?? "", coordinate: c, anchor: .bottom) {
                    WaarschuwingMarker(waarschuwing: waarschuwing, size: 44)
                }
                .annotationTitles(.hidden)
            }
            ForEach(meldingen.filter(\.hasCoordinate)) { m in
                Annotation(m.title, coordinate: CLLocationCoordinate2D(latitude: m.lat ?? 0, longitude: m.lon ?? 0), anchor: .bottom) {
                    DienstMarker(dienst: m.dienst, size: 30)
                }
                .annotationTitles(.hidden)
            }
        }
        .mapStyle(.standard(pointsOfInterest: .excludingAll))
        .onAppear { position = .rect(fitRect) }
    }

    private var fitRect: MKMapRect {
        var coords = waarschuwing.rings.flatMap { $0 }
        if coords.isEmpty, let c = waarschuwing.coordinate {
            let d = 0.03
            coords = [.init(latitude: c.latitude - d, longitude: c.longitude - d * 1.6),
                      .init(latitude: c.latitude + d, longitude: c.longitude + d * 1.6)]
        }
        if coords.isEmpty { coords = [.init(latitude: Config.center.lat, longitude: Config.center.lon)] }
        let rect = coords.map { MKMapRect(origin: MKMapPoint($0), size: MKMapSize(width: 1, height: 1)) }
            .reduce(MKMapRect.null) { $0.union($1) }
        return rect.insetBy(dx: -rect.width * 0.15 - 400, dy: -rect.height * 0.15 - 400)
    }
}

/// Warnings that cover a P2000 alert, shown on its detail page (reverse link).
struct GerelateerdeWaarschuwingen: View {
    let melding: Melding
    @Environment(WaarschuwingStore.self) private var store

    var body: some View {
        let list = store.related(to: melding)
        if !list.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                Text(L("Waarschuwingen in dit gebied"))
                    .font(AppFont.heading(18, relativeTo: .headline))
                ForEach(list) { w in
                    NavigationLink { WaarschuwingDetailView(id: w.id) } label: {
                        WaarschuwingRow(waarschuwing: w)
                            .padding(12)
                            .background(.background.secondary, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                    }
                    .buttonStyle(.plain)
                }
                Text(L("Deze melding ligt in het gebied van de waarschuwing, rond het tijdstip waarop hij gold. Dit is een mogelijk verband, geen bevestiging."))
                    .font(AppFont.body(12, .regular, relativeTo: .caption))
                    .foregroundStyle(.secondary)
            }
        }
    }
}

// MARK: - Settings

/// "Waarschuwingen": push for NL-Alert, Burgernet and the KNMI codes.
struct WaarschuwingenSettingsView: View {
    @Environment(AppSettings.self) private var settings

    var body: some View {
        @Bindable var settings = settings
        Form {
            Section {
                Toggle(isOn: $settings.pushNLAlert) {
                    settingRow(icon: "exclamationmark.triangle.fill", tint: .black, fg: Color(hex: 0xFFC800), title: "NL-Alert",
                               text: L("Waarschuwingen van de overheid bij noodsituaties, zoals een grote brand of gevaarlijke stoffen."))
                }
                Toggle(isOn: $settings.pushBurgernet) {
                    settingRow(icon: "megaphone.fill", tint: Color(hex: 0x0067B1), fg: Color(hex: 0xF39200), title: "Burgernet",
                               text: L("Oproepen van de politie om mee te kijken, bijvoorbeeld bij een vermissing."))
                }
                NavigationLink { KnmiCodesView() } label: {
                    HStack {
                        settingRow(icon: "cloud.sun.rain.fill", tint: .orange, fg: .white, title: L("KNMI-weerwaarschuwingen"),
                                   text: L("Code geel, oranje en rood bij gevaarlijk weer."))
                        Spacer()
                        Text(knmiSummary).foregroundStyle(.secondary)
                    }
                }
            } header: {
                Text(L("Pushmeldingen"))
            } footer: {
                Text(L("Je krijgt alleen waarschuwingen die gelden voor de gemeente Apeldoorn en je gekozen plaatsen. Een NL-Alert komt ook rechtstreeks via je telefoon binnen; hier lees je hem terug en zie je het gebied op de kaart."))
            }
        }
        .navigationTitle(L("Waarschuwingen"))
    }

    private var knmiSummary: String {
        let order = ["yellow", "orange", "red"]
        let names = order.filter(settings.pushKnmi.contains).map { Waarschuwing.codeLabel($0).replacingOccurrences(of: "Code ", with: "") }
        return names.isEmpty ? L("Uit") : names.joined(separator: ", ")
    }

    private func settingRow(icon: String, tint: Color, fg: Color, title: String, text: String) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: icon)
                .font(.subheadline.weight(.bold))
                .foregroundStyle(fg)
                .frame(width: 30, height: 30)
                .background(tint, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
            VStack(alignment: .leading, spacing: 2) {
                Text(verbatim: title)
                Text(text).font(AppFont.body(12, .regular, relativeTo: .caption)).foregroundStyle(.secondary)
            }
        }
    }
}

struct KnmiCodesView: View {
    @Environment(AppSettings.self) private var settings

    var body: some View {
        Form {
            Section {
                code("yellow", L("Wees alert: het weer kan gevaarlijk zijn."))
                code("orange", L("Wees voorbereid: grote kans op gevaar, schade en overlast."))
                code("red", L("Onderneem actie: extreem weer met grote kans op schade en letsel."))
            } header: {
                Text(L("KNMI-weerwaarschuwingen"))
            } footer: {
                Text(L("Kies per code of je een melding wilt. Je krijgt een melding bij een nieuwe waarschuwing of als hij wordt opgeschaald, niet bij elke aanpassing. Bron: KNMI."))
            }
        }
        .navigationTitle(Text(verbatim: "KNMI"))
    }

    private func code(_ niveau: String, _ text: String) -> some View {
        Toggle(isOn: Binding(
            get: { settings.pushKnmi.contains(niveau) },
            set: { on in if on { settings.pushKnmi.insert(niveau) } else { settings.pushKnmi.remove(niveau) } }
        )) {
            HStack(alignment: .top, spacing: 12) {
                Circle().fill(Waarschuwing.codeColor(niveau)).frame(width: 16, height: 16).padding(.top, 3)
                VStack(alignment: .leading, spacing: 2) {
                    Text(Waarschuwing.codeLabel(niveau))
                    Text(text).font(AppFont.body(12, .regular, relativeTo: .caption)).foregroundStyle(.secondary)
                }
            }
        }
    }
}

/// Filter section for the pager: which warnings to show.
struct WaarschuwingFilterSection: View {
    @Environment(AppSettings.self) private var settings
    private let keys: [(String, String)] = [
        ("nlalert", "NL-Alert"), ("burgernet", "Burgernet"),
        ("knmi:yellow", L("KNMI code geel")), ("knmi:orange", L("KNMI code oranje")), ("knmi:red", L("KNMI code rood")),
    ]

    var body: some View {
        Section {
            ForEach(keys, id: \.0) { key, label in
                Toggle(isOn: Binding(
                    get: { settings.waarschuwingFilter.isEmpty || settings.waarschuwingFilter.contains(key) },
                    set: { on in
                        var set = settings.waarschuwingFilter.isEmpty ? Set(keys.map(\.0)) : settings.waarschuwingFilter
                        if on { set.insert(key) } else { set.remove(key) }
                        settings.waarschuwingFilter = set.count == keys.count ? [] : set
                    }
                )) { Text(verbatim: label) }
            }
        } header: {
            Text(L("Waarschuwingen"))
        } footer: {
            Text(L("NL-Alert en Burgernet staan tussen de meldingen; KNMI-waarschuwingen staan als balk bovenaan."))
        }
    }
}
