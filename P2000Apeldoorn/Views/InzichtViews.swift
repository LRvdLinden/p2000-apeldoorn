import SwiftUI
import Charts
#if canImport(UIKit)
import UIKit
#elseif canImport(AppKit)
import AppKit
#endif

// MARK: - Abbreviations in an alert

/// The P2000 text with the abbreviations it explains lightly underlined; tap one for its meaning.
struct AfkortingTekst: View {
    let tekst: String
    var font: Font = AppFont.body(16, .medium)
    @State private var store = AfkortingenStore.shared
    @State private var gekozen: Afkorting?

    var body: some View {
        let gevonden = store.gevonden(in: tekst)
        Text(attributed(gevonden))
            .font(font)
            .tint(.primary)
            .fixedSize(horizontal: false, vertical: true)
            .textSelection(.enabled)
            .environment(\.openURL, OpenURLAction { url in
                guard url.scheme == "aalerts-afkorting", let i = Int(url.host ?? ""), gevonden.indices.contains(i) else { return .systemAction }
                gekozen = gevonden[i].afkorting
                return .handled
            })
            .popover(item: $gekozen) { a in
                AfkortingUitleg(afkorting: a)
                    .presentationCompactAdaptation(.popover)
            }
    }

    private func attributed(_ gevonden: [(range: Range<String.Index>, afkorting: Afkorting)]) -> AttributedString {
        var uit = AttributedString(tekst)
        for (i, g) in gevonden.enumerated() {
            guard let lo = AttributedString.Index(g.range.lowerBound, within: uit),
                  let hi = AttributedString.Index(g.range.upperBound, within: uit) else { continue }
            uit[lo..<hi].link = URL(string: "aalerts-afkorting://\(i)")
            uit[lo..<hi].swiftUI.underlineStyle = Text.LineStyle(pattern: .dot, color: .secondary)
        }
        return uit
    }
}

struct AfkortingUitleg: View {
    let afkorting: Afkorting
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(verbatim: afkorting.term).font(.headline.monospaced())
            Text(afkorting.tekst).font(.subheadline).fixedSize(horizontal: false, vertical: true)
        }
        .padding(16)
        .frame(minWidth: 220, maxWidth: 320, alignment: .leading)
    }
}

/// "Afkortingen in deze melding": every explained term once, also readable for VoiceOver.
struct AfkortingenInMelding: View {
    let melding: Melding
    @State private var store = AfkortingenStore.shared

    var body: some View {
        let lijst = uniek(store.gevonden(in: [melding.title, melding.fullMelding ?? ""].joined(separator: " ")).map(\.afkorting))
        if !lijst.isEmpty {
            VStack(alignment: .leading, spacing: 12) {
                Text(L("Afkortingen in deze melding")).font(AppFont.heading(18))
                ForEach(lijst) { a in
                    HStack(alignment: .firstTextBaseline, spacing: 12) {
                        Text(verbatim: a.term)
                            .font(.system(size: 14, weight: .bold, design: .monospaced))
                            .foregroundStyle(Theme.red)
                            .frame(minWidth: 52, alignment: .leading)
                        Text(a.tekst).font(AppFont.body(14)).foregroundStyle(.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .accessibilityElement(children: .combine)
                }
                NavigationLink { AfkortingenView() } label: {
                    Label(L("Alle afkortingen"), systemImage: "character.book.closed")
                        .font(AppFont.body(13, .medium))
                }
            }
        }
    }

    private func uniek(_ a: [Afkorting]) -> [Afkorting] {
        var gezien = Set<String>()
        return a.filter { gezien.insert($0.term).inserted }
    }
}

/// Searchable list of every abbreviation (Instellingen › Over deze app).
struct AfkortingenView: View {
    @State private var store = AfkortingenStore.shared
    @State private var zoek = ""

    private var lijst: [Afkorting] {
        let q = zoek.trimmingCharacters(in: .whitespaces)
        let alle = store.items.sorted { $0.term.localizedCaseInsensitiveCompare($1.term) == .orderedAscending }
        guard !q.isEmpty else { return alle }
        return alle.filter { $0.term.localizedCaseInsensitiveContains(q) || $0.tekst.localizedCaseInsensitiveContains(q) }
    }

    var body: some View {
        List {
            if store.items.isEmpty {
                if let e = store.error {
                    ContentUnavailableView(L("Afkortingen niet geladen"), systemImage: "wifi.exclamationmark", description: Text(e))
                } else {
                    ProgressView().frame(maxWidth: .infinity)
                }
            } else if lijst.isEmpty {
                ContentUnavailableView.search(text: zoek)
            }
            ForEach(lijst) { a in
                VStack(alignment: .leading, spacing: 3) {
                    HStack(spacing: 8) {
                        Text(verbatim: a.term).font(.system(.headline, design: .monospaced))
                        if let d = a.dienst, !d.isEmpty {
                            let dienst = Dienst(raw: d)
                            if dienst != .onbekend {
                                Text(dienst.label).font(.caption2.weight(.semibold)).foregroundStyle(dienst.textColor)
                                    .padding(.horizontal, 6).padding(.vertical, 2)
                                    .background(dienst.color.opacity(0.14), in: Capsule())
                            }
                        }
                    }
                    Text(a.tekst).font(.subheadline).foregroundStyle(.secondary)
                }
                .accessibilityElement(children: .combine)
            }
        }
        .navigationTitle(L("Afkortingen"))
        .searchable(text: $zoek, prompt: L("Zoek een afkorting"))
        .task { await store.laad() }
        .refreshable { await store.laad(force: true) }
    }
}

// MARK: - Statistics of the last 28 days

@MainActor
@Observable
final class StatistiekStore {
    static let shared = StatistiekStore()
    var stat: Statistiek?
    var error: String?
    var loading = false
    private var geladen: Date?

    func laad(force: Bool = false) async {
        if !force, let geladen, Date().timeIntervalSince(geladen) < 15 * 60, stat != nil { return }
        loading = stat == nil
        defer { loading = false }
        do {
            stat = try await P2000API.shared.statistiek(dagen: 28)
            geladen = Date()
            error = nil
        } catch {
            if stat == nil { self.error = error.localizedDescription }
        }
    }
}

/// "Laatste 28 dagen" in Statistieken: figures from the server (all alerts, not only what this device loaded).
struct Laatste28DagenSectie: View {
    @State private var store = StatistiekStore.shared
    private let columns = [GridItem(.adaptive(minimum: 320), spacing: 16)]

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(alignment: .firstTextBaseline) {
                Text(L("Laatste 28 dagen")).font(AppFont.heading(24))
                Spacer()
                if let b = store.stat?.bijgewerkt {
                    Text(Lf("Bijgewerkt %@", b.formatted(date: .omitted, time: .shortened))).font(.caption).foregroundStyle(.secondary)
                }
            }
            .padding(.top, 8)
            if let s = store.stat {
                StatistiekKaarten(stat: s, metPlaatsen: true)
            } else if let e = store.error {
                Card(title: L("Laatste 28 dagen"), icon: "exclamationmark.triangle") {
                    Text(Lf("Cijfers konden niet worden geladen (%@).", e)).font(.callout).foregroundStyle(.secondary)
                }
            } else {
                ProgressView().frame(maxWidth: .infinity, minHeight: 80)
            }
        }
        .task { await store.laad() }
    }
}

/// The cards of a Statistiek (also used for one place or unit).
struct StatistiekKaarten: View {
    let stat: Statistiek
    var metPlaatsen = true
    var metEenheden = true
    private let columns = [GridItem(.adaptive(minimum: 320), spacing: 16)]

    var body: some View {
        LazyVGrid(columns: columns, alignment: .leading, spacing: 16) {
            totaalKaart
            if stat.perDag.count > 1 { verloopKaart }
            dienstKaart
            uurKaart
            weekdagKaart
            if metPlaatsen, !stat.topPlaatsen.isEmpty { plaatsenKaart }
            if metEenheden, !stat.topEenheden.isEmpty { eenhedenKaart }
            if let h = stat.helikopters, (h.inzetten ?? 0) > 0 || !h.perToestel.isEmpty { heliKaart(h) }
        }
    }

    private var totaalKaart: some View {
        Card(title: Lf("%lld dagen", stat.dagen), icon: "calendar") {
            HStack(alignment: .top, spacing: 12) {
                tegel(L("Meldingen"), "\(stat.totaal)")
                tegel(L("Per dag"), stat.dagen > 0 ? String(format: "%.1f", Double(stat.totaal) / Double(stat.dagen)) : "–")
            }
            if let g = stat.gisteren, let t = g.totaal {
                let gem = g.gemiddeld ?? 0
                HStack(spacing: 8) {
                    DeltaBadge(diff: t - Int(gem.rounded()))
                    Text(Lf("Gisteren %lld, gemiddeld %@ per dag", t, String(format: "%.1f", gem)))
                        .font(AppFont.body(14, .light, relativeTo: .callout)).foregroundStyle(.secondary)
                }
            }
            Text(L("Zonder testoproepen en proefalarmen."))
                .font(.caption).foregroundStyle(.secondary)
        }
    }

    private func tegel(_ titel: String, _ waarde: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(titel).font(AppFont.body(12, .bold, relativeTo: .caption)).textCase(.uppercase).foregroundStyle(Theme.red)
            Text(waarde).font(AppFont.heading(34)).monospacedDigit()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(Theme.red.opacity(0.08), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .accessibilityElement(children: .combine)
    }

    private struct DagPunt: Identifiable {
        let datum: Date, dienst: String, aantal: Int
        var id: String { "\(datum.timeIntervalSince1970)-\(dienst)" }
    }

    private var verloopKaart: some View {
        // Per discipline when the server splits the days; else one bar per day.
        let perDienst = stat.perDag.contains { !$0.perDienst.isEmpty }
        let punten: [DagPunt] = stat.perDag.flatMap { d -> [DagPunt] in
            guard let datum = d.date else { return [] }
            if !perDienst { return [DagPunt(datum: datum, dienst: "", aantal: d.totaal)] }
            return Dienst.selectable.compactMap { dienst in
                d.perDienst[dienst.rawValue].map { DagPunt(datum: datum, dienst: dienst.label, aantal: $0) }
            }
        }
        return Card(title: L("Per dag"), icon: "chart.bar.xaxis") {
            if perDienst {
                Chart(punten) { p in
                    BarMark(x: .value(L("Dag"), p.datum, unit: .day), y: .value(L("Aantal"), p.aantal))
                        .foregroundStyle(by: .value(L("Dienst"), p.dienst))
                }
                .chartForegroundStyleScale(domain: Dienst.selectable.map(\.label), range: Dienst.selectable.map(\.color))
                .chartLegend(position: .top, alignment: .leading)
                .frame(height: 190)
            } else {
                Chart(punten) { p in
                    BarMark(x: .value(L("Dag"), p.datum, unit: .day), y: .value(L("Aantal"), p.aantal))
                        .foregroundStyle(Theme.red.gradient)
                }
                .frame(height: 190)
            }
        }
    }

    private var dienstKaart: some View {
        let maxV = Double(max(stat.perDienst.values.max() ?? 1, 1))
        return Card(title: L("Per discipline"), icon: "square.grid.2x2") {
            VStack(spacing: 10) {
                ForEach(Dienst.selectable) { d in
                    let n = stat.perDienst[d.rawValue] ?? 0
                    VStack(alignment: .leading, spacing: 4) {
                        HStack(spacing: 10) {
                            DienstIcon(dienst: d, size: 24)
                            Text(d == .traumaheli ? L("Lifeliner") : d.label).font(AppFont.body(15, .semibold, relativeTo: .callout))
                            Spacer()
                            Text("\(n)").font(AppFont.heading(18, relativeTo: .title3).monospacedDigit())
                        }
                        balk(Double(n) / maxV, d.color)
                    }
                    .accessibilityElement(children: .combine)
                }
            }
        }
    }

    private var uurKaart: some View {
        Card(title: L("Per uur van de dag"), icon: "clock") {
            Chart(Array(stat.perUur.enumerated()), id: \.offset) { item in
                BarMark(x: .value(L("Uur"), item.offset), y: .value(L("Aantal"), item.element))
                    .foregroundStyle(Theme.red.gradient)
                    .cornerRadius(2)
            }
            .chartXAxis {
                AxisMarks(values: [0, 6, 12, 18, 23]) { value in
                    AxisGridLine()
                    AxisValueLabel { if let h = value.as(Int.self) { Text(String(format: "%02d:00", h)) } }
                }
            }
            .frame(height: 170)
            if let u = stat.druksteUur {
                Text(Lf("Drukste uur: %@", String(format: "%02d:00–%02d:00", u, (u + 1) % 24)))
                    .font(.caption).foregroundStyle(.secondary)
            }
        }
    }

    private var weekdagKaart: some View {
        let namen = Statistiek.weekdagKort
        return Card(title: L("Per dag van de week"), icon: "calendar.day.timeline.left") {
            Chart(Array(stat.perWeekdag.enumerated()), id: \.offset) { item in
                BarMark(x: .value(L("Dag"), namen[item.offset]), y: .value(L("Aantal"), item.element))
                    .foregroundStyle(item.offset == stat.druksteWeekdag ? Theme.red : Theme.red.opacity(0.45))
                    .cornerRadius(4)
            }
            .frame(height: 160)
        }
    }

    private var plaatsenKaart: some View {
        let top = Array(stat.topPlaatsen.prefix(8))
        let maxV = Double(max(top.first?.aantal ?? 1, 1))
        return Card(title: L("Drukste plaatsen"), icon: "mappin.and.ellipse") {
            VStack(spacing: 8) {
                ForEach(top, id: \.plaats) { p in
                    NavigationLink { MeldingenLijstView(filter: .plaats(p.plaats)) } label: {
                        rij(p.plaats.capitalizedPlaats, p.aantal, maxV, Color(hex: 0x3B82F6))
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private var eenhedenKaart: some View {
        let top = Array(stat.topEenheden.prefix(8))
        let maxV = Double(max(top.first?.aantal ?? 1, 1))
        return Card(title: L("Meest ingezette eenheden"), icon: "person.3.fill") {
            VStack(spacing: 8) {
                ForEach(Array(top.enumerated()), id: \.offset) { _, e in
                    if let code = e.code, !code.isEmpty {
                        NavigationLink { MeldingenLijstView(filter: .eenheid(code: code, naam: e.naam)) } label: {
                            rij(e.titel, e.aantal, maxV, Dienst(raw: e.dienst).color)
                        }
                        .buttonStyle(.plain)
                    } else {
                        rij(e.titel, e.aantal, maxV, Dienst(raw: e.dienst).color)
                    }
                }
            }
        }
    }

    private func heliKaart(_ h: Statistiek.Helis) -> some View {
        Card(title: L("Traumahelikopters"), icon: "airplane") {
            if let n = h.inzetten {
                Text(Lf("%lld inzetten", n)).font(AppFont.heading(22))
            }
            let maxV = Double(max(h.perToestel.map(\.aantal).max() ?? 1, 1))
            ForEach(h.perToestel, id: \.naam) { t in rij(t.naam, t.aantal, maxV, Dienst.traumaheli.color) }
        }
    }

    private func rij(_ titel: String, _ n: Int, _ maxV: Double, _ kleur: Color) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack {
                Text(titel).font(AppFont.body(15, .regular, relativeTo: .callout)).lineLimit(1)
                Spacer()
                Text("\(n)").font(AppFont.body(15, .semibold, relativeTo: .callout).monospacedDigit())
            }
            balk(Double(n) / maxV, kleur)
        }
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
    }

    private func balk(_ fraction: Double, _ color: Color) -> some View {
        GeometryReader { geo in
            Capsule().fill(color.opacity(0.15))
                .overlay(alignment: .leading) { Capsule().fill(color).frame(width: max(geo.size.width * fraction, fraction > 0 ? 4 : 0)) }
        }
        .frame(height: 5)
    }
}

// MARK: - Alerts of one place or unit

struct MeldingenLijstView: View {
    let filter: MeldingFilter
    @Environment(AppSettings.self) private var settings
    @State private var meldingen: [Melding] = []
    @State private var stat: Statistiek?
    @State private var fout: String?
    @State private var laden = true

    var body: some View {
        List {
            if let stat {
                Section {
                    VStack(alignment: .leading, spacing: 10) {
                        HStack(alignment: .firstTextBaseline) {
                            Text("\(stat.totaal)").font(AppFont.heading(34)).monospacedDigit()
                            Text(Lf("meldingen in %lld dagen", stat.dagen)).foregroundStyle(.secondary)
                        }
                        HStack(spacing: 8) {
                            ForEach(Dienst.selectable) { d in
                                if let n = stat.perDienst[d.rawValue], n > 0 {
                                    Label("\(n)", systemImage: d.systemImage)
                                        .font(.caption.weight(.semibold)).foregroundStyle(d.textColor)
                                        .padding(.horizontal, 8).padding(.vertical, 4)
                                        .background(d.color.opacity(0.14), in: Capsule())
                                        .accessibilityLabel("\(d.label): \(n)")
                                }
                            }
                        }
                        if let u = stat.druksteUur {
                            Text(Lf("Drukste uur: %@", String(format: "%02d:00–%02d:00", u, (u + 1) % 24))).font(.caption).foregroundStyle(.secondary)
                        }
                        if stat.totaal > 0 {
                            Chart(Array(stat.perUur.enumerated()), id: \.offset) { item in
                                BarMark(x: .value(L("Uur"), item.offset), y: .value(L("Aantal"), item.element))
                                    .foregroundStyle(Theme.red.gradient)
                            }
                            .chartXAxis {
                                AxisMarks(values: [0, 6, 12, 18]) { v in
                                    AxisValueLabel { if let h = v.as(Int.self) { Text(String(format: "%02d", h)) } }
                                }
                            }
                            .chartYAxis(.hidden)
                            .frame(height: 70)
                            .accessibilityHidden(true)
                        }
                    }
                    .padding(.vertical, 4)
                }
            }
            Section(L("Meldingen")) {
                if laden && meldingen.isEmpty {
                    ProgressView().frame(maxWidth: .infinity)
                } else if let fout, meldingen.isEmpty {
                    Text(fout).foregroundStyle(.secondary)
                } else if meldingen.isEmpty {
                    Text(L("Geen meldingen gevonden")).foregroundStyle(.secondary)
                }
                ForEach(meldingen) { m in
                    NavigationLink { MeldingDetailView(melding: m) } label: {
                        MeldingRow(melding: m, gelezen: settings.isRead(m))
                    }
                }
            }
        }
        .navigationTitle(filter.titel)
        #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
        #endif
        .task(id: filter) { await laad() }
        .refreshable { await laad() }
    }

    private func laad() async {
        laden = true
        defer { laden = false }
        async let lijst = P2000API.shared.meldingen(filter, limit: 100)
        async let cijfers = P2000API.shared.statistiek(dagen: 28, filter: filter)
        do {
            meldingen = try await lijst
            fout = nil
        } catch {
            fout = Lf("Meldingen konden niet worden geladen (%@).", error.localizedDescription)
        }
        stat = try? await cijfers
    }
}

// MARK: - Share as image

/// In the share sheet: the server draws the alert as an image (landscape, square or story), shared as a PNG.
struct DeelAlsAfbeelding: View {
    let melding: Melding
    @State private var formaat: AfbeeldingFormaat = .og
    @State private var bestand: URL?
    @State private var bezig = false
    @State private var fout: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(L("Deel als afbeelding")).font(.headline)
            Picker(L("Formaat"), selection: $formaat) {
                ForEach(AfbeeldingFormaat.allCases) { f in Text(f.label).tag(f) }
            }
            .pickerStyle(.segmented)
            Text(formaat.uitleg).font(.footnote).foregroundStyle(.secondary)
            if let bestand, let preview = laadVoorbeeld(bestand) {
                preview
                    .resizable().scaledToFit()
                    .frame(maxHeight: 260)
                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                    .frame(maxWidth: .infinity)
                    .accessibilityLabel(L("Voorbeeld van de afbeelding"))
                ShareLink(item: bestand, preview: SharePreview(melding.title, image: preview)) {
                    Label(L("Deel afbeelding"), systemImage: "square.and.arrow.up")
                        .font(.subheadline.weight(.semibold))
                        .frame(maxWidth: .infinity).padding(.vertical, 12)
                        .foregroundStyle(.white)
                        .background(Theme.red, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                }
                .buttonStyle(.plain)
            } else if bezig {
                ProgressView(L("Afbeelding maken…")).frame(maxWidth: .infinity, minHeight: 80)
            } else if let fout {
                Text(fout).font(.footnote).foregroundStyle(.secondary)
                Button(L("Opnieuw proberen")) { Task { await maak() } }
            }
        }
        .padding(14)
        .background(Color.detailCard, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .task(id: formaat) { await maak() }
    }

    private func maak() async {
        bezig = true
        bestand = nil
        fout = nil
        defer { bezig = false }
        do {
            bestand = try await P2000API.shared.afbeelding(guid: melding.guid, formaat: formaat)
        } catch is CancellationError {
        } catch {
            fout = Lf("De afbeelding kon niet worden gemaakt (%@).", error.localizedDescription)
        }
    }

    private func laadVoorbeeld(_ url: URL) -> Image? {
        #if canImport(UIKit)
        return UIImage(contentsOfFile: url.path).map { Image(uiImage: $0) }
        #else
        return NSImage(contentsOf: url).map { Image(nsImage: $0) }
        #endif
    }
}
