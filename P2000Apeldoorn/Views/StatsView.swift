import SwiftUI
import Charts

/// "P2000 Statistieken": today, this month, per hour, per weekday and top categories.
struct StatsView: View {
    @Environment(MeldingStore.self) private var store

    private let columns = [GridItem(.adaptive(minimum: 320), spacing: 16)]

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    todayCard
                    LazyVGrid(columns: columns, alignment: .leading, spacing: 16) {
                        if let maand = store.maand {
                            monthCard(maand)
                            hourCard(maand)
                            weekdayCard(maand)
                            categoryCard(maand)
                            priorityCard(maand)
                        }
                    }
                    if store.maand == nil {
                        HStack { Spacer(); ProgressView(L("Statistieken laden...")); Spacer() }
                            .padding(.vertical, 40)
                    }
                    Link(destination: Config.source) {
                        Text(L("Bron: p2000.page"))
                    }
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity)
                }
                .padding()
                .frame(maxWidth: 1100)
                .frame(maxWidth: .infinity)
            }
            .background(Color.groupedBackground)
            .navigationTitle(L("Statistieken"))
            .refreshable { await store.refreshStats() }
            .task { await store.refreshStats() }
        }
    }

    // MARK: Today

    private var todayCard: some View {
        let today = store.vandaag
        return Card(title: Lf("Vandaag · %@", Date.now.formatted(.dateTime.day().month(.wide))), icon: "calendar") {
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Text("\(today.totaal)")
                    .font(.system(size: 44, weight: .black, design: .rounded))
                    .contentTransition(.numericText())
                Text(L("meldingen")).foregroundStyle(.secondary)
            }
            HStack(spacing: 10) {
                ForEach(Dienst.selectable) { d in
                    VStack(spacing: 6) {
                        DienstIcon(dienst: d, size: 28)
                        Text("\(today.perDienst[d] ?? 0)").font(.title3.weight(.bold).monospacedDigit())
                        Text(d == .traumaheli ? L("Lifeliner") : d.label)
                            .font(.caption2.weight(.semibold))
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 10)
                    .background(d.color.opacity(0.1), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                }
            }
        }
    }

    // MARK: Month

    private func monthCard(_ m: MaandStatistiek) -> some View {
        let data = Dienst.selectable.map { (dienst: $0, count: m.byDienst[$0.rawValue] ?? 0) }
        let prev = store.vorigeMaand?.totaal
        return Card(title: L("Deze maand"), icon: "calendar.badge.clock") {
            HStack(alignment: .firstTextBaseline) {
                Text("\(m.totaal)").font(.system(size: 34, weight: .black, design: .rounded))
                Text(L("meldingen")).foregroundStyle(.secondary)
                Spacer()
                if let prev {
                    Text(Lf("Vorige maand: %lld", prev)).font(.caption).foregroundStyle(.secondary)
                }
            }
            Chart(data, id: \.dienst) { item in
                BarMark(x: .value(L("Aantal"), item.count), y: .value(L("Discipline"), item.dienst.label))
                    .foregroundStyle(item.dienst.color)
                    .annotation(position: .trailing) {
                        Text("\(item.count)").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                    }
                    .cornerRadius(6)
            }
            .chartXAxis(.hidden)
            .frame(height: 150)
        }
    }

    private func hourCard(_ m: MaandStatistiek) -> some View {
        let hours = Array(m.byUur.prefix(24).enumerated())
        let peak = hours.max { $0.element < $1.element }
        return Card(title: L("Per uur van de dag"), icon: "clock") {
            Chart(hours, id: \.offset) { item in
                BarMark(x: .value(L("Uur"), item.offset), y: .value(L("Aantal"), item.element))
                    .foregroundStyle(item.offset == peak?.offset ? Theme.red : Theme.red.opacity(0.45))
                    .cornerRadius(3)
            }
            .chartXAxis {
                AxisMarks(values: [0, 6, 12, 18, 23]) { value in
                    AxisGridLine()
                    AxisValueLabel { if let h = value.as(Int.self) { Text(String(format: "%02d:00", h)) } }
                }
            }
            .frame(height: 170)
            if let peak {
                Text(Lf("Drukste uur: %@ (%lld meldingen)", String(format: "%02d:00", peak.offset), peak.element))
                    .font(.caption).foregroundStyle(.secondary)
            }
        }
    }

    private func weekdayCard(_ m: MaandStatistiek) -> some View {
        // API: index 0 = zondag. Show Monday first.
        let symbols = Calendar.current.shortWeekdaySymbols
        let order = [1, 2, 3, 4, 5, 6, 0]
        let data = order.compactMap { i -> (String, Int)? in
            guard i < m.byDag.count, i < symbols.count else { return nil }
            return (symbols[i], m.byDag[i])
        }
        return Card(title: L("Per dag van de week"), icon: "calendar.day.timeline.left") {
            Chart(data, id: \.0) { item in
                BarMark(x: .value(L("Dag"), item.0), y: .value(L("Aantal"), item.1))
                    .foregroundStyle(Theme.red.gradient)
                    .cornerRadius(6)
            }
            .frame(height: 170)
        }
    }

    private func categoryCard(_ m: MaandStatistiek) -> some View {
        let top = m.byCategorie.sorted { $0.value > $1.value }.prefix(8)
        let maxValue = Double(top.first?.value ?? 1)
        return Card(title: L("Meest voorkomend"), icon: "list.number") {
            VStack(spacing: 8) {
                ForEach(Array(top), id: \.key) { item in
                    VStack(alignment: .leading, spacing: 3) {
                        HStack {
                            Text(item.key).font(.callout).lineLimit(1)
                            Spacer()
                            Text("\(item.value)").font(.callout.weight(.semibold).monospacedDigit())
                        }
                        GeometryReader { geo in
                            Capsule().fill(Theme.red.opacity(0.18))
                                .overlay(alignment: .leading) {
                                    Capsule().fill(Theme.red)
                                        .frame(width: geo.size.width * Double(item.value) / maxValue)
                                }
                        }
                        .frame(height: 6)
                    }
                }
            }
        }
    }

    private func priorityCard(_ m: MaandStatistiek) -> some View {
        let items = m.byPrioriteit.filter { $0.key != "onbekend" }.sorted { $0.key < $1.key }
        return Card(title: L("Per prioriteit"), icon: "exclamationmark.triangle") {
            Chart(items, id: \.key) { item in
                SectorMark(angle: .value(L("Aantal"), item.value), innerRadius: .ratio(0.6), angularInset: 1.5)
                    .foregroundStyle(by: .value(L("Prioriteit"), item.key))
                    .cornerRadius(4)
            }
            .frame(height: 190)
        }
    }
}
