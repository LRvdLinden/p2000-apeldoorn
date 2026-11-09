import SwiftUI
import Charts

/// "P2000 Statistieken": today compared with yesterday. Only these two days are kept;
/// everything is computed in the app from the alerts it already has.
struct StatsView: View {
    @Environment(MeldingStore.self) private var store

    private let columns = [GridItem(.adaptive(minimum: 320), spacing: 16)]

    var body: some View {
        let today = store.statsVandaag
        let yesterday = store.statsGisteren
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    totalsCard(today, yesterday)
                    LazyVGrid(columns: columns, alignment: .leading, spacing: 16) {
                        dienstCard(today, yesterday)
                        hourCard(today, yesterday)
                        priorityCard(today, yesterday)
                        categoryCard(today, yesterday)
                        waarschuwingCard
                    }
                }
                .padding()
                .frame(maxWidth: 1100)
                .frame(maxWidth: .infinity)
            }
            .background(Color.groupedBackground)
            .navigationTitle(L("Statistieken"))
            .refreshable {
                await store.refresh()
                await WaarschuwingStore.shared.refresh()
            }
            .task { if WaarschuwingStore.shared.lastUpdated == nil { await WaarschuwingStore.shared.refresh() } }
        }
    }

    private var todayLabel: String { L("Vandaag") }
    private var yesterdayLabel: String { L("Gisteren") }
    private let yesterdayColor = Color.gray.opacity(0.55)

    // MARK: Totals

    private func totalsCard(_ t: DayStats, _ y: DayStats) -> some View {
        Card(title: L("Vandaag vs. gisteren"), icon: "calendar") {
            HStack(alignment: .top, spacing: 12) {
                totalTile(todayLabel, date: t.day, value: t.totaal, tint: Theme.red)
                totalTile(yesterdayLabel, date: y.day, value: y.totaal, tint: .secondary)
            }
            let diff = t.totaal - y.totaalTotNu
            HStack(spacing: 8) {
                DeltaBadge(diff: diff)
                Text(Lf("Gisteren om deze tijd: %lld meldingen", y.totaalTotNu))
                    .font(AppFont.body(16, .light, relativeTo: .callout))
                    .foregroundStyle(.secondary)
            }
        }
    }

    private func totalTile(_ title: String, date: Date, value: Int, tint: Color) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title).font(AppFont.body(12, .bold, relativeTo: .caption)).textCase(.uppercase).foregroundStyle(tint)
            Text("\(value)")
                .font(AppFont.heading(40))
                .contentTransition(.numericText())
            Text(date.formatted(.dateTime.weekday(.wide).day().month(.wide)))
                .font(AppFont.body(12, .regular, relativeTo: .caption)).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(tint.opacity(0.08), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    // MARK: Per discipline

    private func dienstCard(_ t: DayStats, _ y: DayStats) -> some View {
        Card(title: L("Per discipline"), icon: "square.grid.2x2") {
            VStack(spacing: 10) {
                ForEach(Dienst.selectable) { d in
                    let a = t.perDienst[d] ?? 0, b = y.perDienst[d] ?? 0
                    HStack(spacing: 10) {
                        DienstIcon(dienst: d, size: 26)
                        Text(d == .traumaheli ? L("Lifeliner") : d.label)
                            .font(AppFont.body(16, .semibold, relativeTo: .callout)).lineLimit(1)
                        Spacer()
                        Text("\(a)").font(AppFont.heading(20, relativeTo: .title3).monospacedDigit())
                        Text("/ \(b)").font(AppFont.body(16, .light, relativeTo: .callout).monospacedDigit()).foregroundStyle(.secondary)
                        DeltaBadge(diff: a - b, compact: true)
                    }
                }
                Text(L("Vandaag / gisteren (hele dag)"))
                    .font(AppFont.body(12, .regular, relativeTo: .caption)).foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
    }

    // MARK: Waarschuwingen

    /// NL-Alert, Burgernet and KNMI: today, yesterday and the last seven days, and how many apply right now.
    private var waarschuwingCard: some View {
        let items = WaarschuwingStore.shared.items
        let cal = Calendar.current
        let week = Date.now.addingTimeInterval(-7 * 86_400)
        return Card(title: L("Waarschuwingen"), icon: "exclamationmark.triangle") {
            VStack(spacing: 10) {
                ForEach(Waarschuwing.Bron.allCases.filter { b in b == .nlalert || b == .burgernet || b == .knmi || items.contains { $0.bron == b } }, id: \.self) { bron in
                    let eigen = items.filter { $0.bron == bron }
                    let a = eigen.filter { cal.isDateInToday($0.start) }.count
                    let b = eigen.filter { cal.isDateInYesterday($0.start) }.count
                    let w = eigen.filter { $0.start >= week }.count
                    let nu = eigen.filter(\.isActief).count
                    HStack(spacing: 10) {
                        BronIcoon(bron: bron, size: 26)
                        VStack(alignment: .leading, spacing: 1) {
                            Text(verbatim: MeldingDetailView.bronNaam(bron))
                                .font(AppFont.body(16, .semibold, relativeTo: .callout)).lineLimit(1)
                            Text(nu > 0 ? Lf("%lld nu actief", nu) : Lf("%lld in 7 dagen", w))
                                .font(AppFont.body(12, .regular, relativeTo: .caption))
                                .foregroundStyle(nu > 0 ? AnyShapeStyle(Theme.red) : AnyShapeStyle(.secondary))
                        }
                        Spacer()
                        Text("\(a)").font(AppFont.heading(20, relativeTo: .title3).monospacedDigit())
                        Text("/ \(b)").font(AppFont.body(16, .light, relativeTo: .callout).monospacedDigit()).foregroundStyle(.secondary)
                        DeltaBadge(diff: a - b, compact: true)
                    }
                }
                Text(L("Vandaag / gisteren · gemeente Apeldoorn en Teuge"))
                    .font(AppFont.body(12, .regular, relativeTo: .caption)).foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
    }

    // MARK: Per hour

    private struct HourPoint: Identifiable {
        let day: String, hour: Int, count: Int
        var id: String { "\(day)-\(hour)" }
    }

    private func hourCard(_ t: DayStats, _ y: DayStats) -> some View {
        let currentHour = Calendar.current.component(.hour, from: .now)
        var points: [HourPoint] = []
        for h in 0..<24 {
            points.append(HourPoint(day: yesterdayLabel, hour: h, count: y.perUur[h]))
            if h <= currentHour { points.append(HourPoint(day: todayLabel, hour: h, count: t.perUur[h])) }
        }
        return Card(title: L("Per uur van de dag"), icon: "clock") {
            Chart(points) { p in
                BarMark(x: .value(L("Uur"), p.hour), y: .value(L("Aantal"), p.count))
                    .foregroundStyle(by: .value(L("Dag"), p.day))
                    .position(by: .value(L("Dag"), p.day))
                    .cornerRadius(2)
            }
            .chartForegroundStyleScale([todayLabel: Theme.red, yesterdayLabel: yesterdayColor])
            .chartXAxis {
                AxisMarks(values: [0, 6, 12, 18, 23]) { value in
                    AxisGridLine()
                    AxisValueLabel { if let h = value.as(Int.self) { Text(String(format: "%02d:00", h)) } }
                }
            }
            .chartLegend(position: .top, alignment: .leading)
            .frame(height: 190)
            if let peak = t.perUur.enumerated().max(by: { $0.element < $1.element }), peak.element > 0 {
                Text(Lf("Drukste uur vandaag: %@ (%lld meldingen)", String(format: "%02d:00", peak.offset), peak.element))
                    .font(AppFont.body(12, .regular, relativeTo: .caption)).foregroundStyle(.secondary)
            }
        }
    }

    // MARK: Priority

    private func priorityCard(_ t: DayStats, _ y: DayStats) -> some View {
        let keys = Set(t.perPrioriteit.keys).union(y.perPrioriteit.keys).sorted()
        return Card(title: L("Per prioriteit"), icon: "exclamationmark.triangle") {
            if keys.isEmpty {
                emptyText
            } else {
                Chart {
                    ForEach(keys, id: \.self) { k in
                        BarMark(x: .value(L("Prioriteit"), k), y: .value(L("Aantal"), y.perPrioriteit[k] ?? 0))
                            .foregroundStyle(by: .value(L("Dag"), yesterdayLabel))
                            .position(by: .value(L("Dag"), yesterdayLabel))
                            .cornerRadius(4)
                        BarMark(x: .value(L("Prioriteit"), k), y: .value(L("Aantal"), t.perPrioriteit[k] ?? 0))
                            .foregroundStyle(by: .value(L("Dag"), todayLabel))
                            .position(by: .value(L("Dag"), todayLabel))
                            .cornerRadius(4)
                    }
                }
                .chartForegroundStyleScale([todayLabel: Theme.red, yesterdayLabel: yesterdayColor])
                .chartLegend(position: .top, alignment: .leading)
                .frame(height: 180)
            }
        }
    }

    // MARK: Categories

    private func categoryCard(_ t: DayStats, _ y: DayStats) -> some View {
        let keys = Set(t.perCategorie.keys).union(y.perCategorie.keys)
        let top = keys.map { (key: $0, a: t.perCategorie[$0] ?? 0, b: y.perCategorie[$0] ?? 0) }
            .sorted { ($0.a + $0.b, $0.a) > ($1.a + $1.b, $1.a) }
            .prefix(8)
        let maxValue = Double(max(top.map { max($0.a, $0.b) }.max() ?? 1, 1))
        return Card(title: L("Meest voorkomend"), icon: "list.number") {
            if top.isEmpty {
                emptyText
            } else {
                VStack(spacing: 10) {
                    ForEach(Array(top), id: \.key) { item in
                        VStack(alignment: .leading, spacing: 3) {
                            HStack {
                                Text(item.key).font(AppFont.body(16, .light, relativeTo: .callout)).lineLimit(1)
                                Spacer()
                                Text("\(item.a)").font(AppFont.body(16, .semibold, relativeTo: .callout).monospacedDigit())
                                Text("/ \(item.b)").font(AppFont.body(12, .regular, relativeTo: .caption).monospacedDigit()).foregroundStyle(.secondary)
                            }
                            bar(Double(item.a) / maxValue, Theme.red)
                            bar(Double(item.b) / maxValue, yesterdayColor)
                        }
                    }
                }
            }
        }
    }

    private func bar(_ fraction: Double, _ color: Color) -> some View {
        GeometryReader { geo in
            Capsule().fill(color.opacity(0.15))
                .overlay(alignment: .leading) {
                    Capsule().fill(color).frame(width: max(geo.size.width * fraction, fraction > 0 ? 4 : 0))
                }
        }
        .frame(height: 5)
    }

    private var emptyText: some View {
        Text(L("Nog geen meldingen"))
            .font(AppFont.body(16, .light, relativeTo: .callout)).foregroundStyle(.secondary)
            .frame(maxWidth: .infinity, minHeight: 60)
    }
}

/// "+3" / "−2" / "=" compared with yesterday.
struct DeltaBadge: View {
    let diff: Int
    var compact = false

    var body: some View {
        let color: Color = diff > 0 ? Theme.red : (diff < 0 ? .green : .secondary)
        let text = diff == 0 ? "=" : (diff > 0 ? "+\(diff)" : "−\(-diff)")
        HStack(spacing: 2) {
            if !compact && diff != 0 { Image(systemName: diff > 0 ? "arrow.up.right" : "arrow.down.right") }
            Text(text)
        }
        .font((compact ? Font.caption : .callout).weight(.bold).monospacedDigit())
        .foregroundStyle(color)
        .padding(.horizontal, compact ? 6 : 8)
        .padding(.vertical, 3)
        .background(color.opacity(0.12), in: Capsule())
        .frame(minWidth: compact ? 40 : nil, alignment: .trailing)
    }
}
