import SwiftUI
import Charts

/// Today compared with yesterday, readable from across the room.
struct TVStatsView: View {
    @Environment(MeldingStore.self) private var store

    var body: some View {
        let t = store.statsVandaag, y = store.statsGisteren
        HStack(alignment: .top, spacing: 50) {
            VStack(alignment: .leading, spacing: 30) {
                HStack(spacing: 24) {
                    big(L("Vandaag"), t.totaal, Theme.red)
                    big(L("Gisteren"), y.totaal, .gray)
                }
                let diff = t.totaal - y.totaalTotNu
                Text(Lf("Gisteren om deze tijd: %lld meldingen", y.totaalTotNu))
                    .font(.system(size: 22)).foregroundStyle(.secondary)
                Text(diff == 0 ? "=" : (diff > 0 ? "+\(diff)" : "−\(-diff)"))
                    .font(.system(size: 40, weight: .black))
                    .foregroundStyle(diff > 0 ? Theme.red : (diff < 0 ? .green : .secondary))
                VStack(spacing: 16) {
                    ForEach(Dienst.selectable) { d in
                        HStack(spacing: 18) {
                            DienstIcon(dienst: d, size: 40)
                            Text(d == .traumaheli ? L("Lifeliner") : d.label).font(.system(size: 24, weight: .semibold))
                            Spacer()
                            Text("\(t.perDienst[d] ?? 0)").font(.system(size: 32, weight: .black).monospacedDigit())
                            Text("/ \(y.perDienst[d] ?? 0)").font(.system(size: 22).monospacedDigit()).foregroundStyle(.secondary)
                        }
                    }
                }
            }
            .frame(width: 640)

            VStack(alignment: .leading, spacing: 20) {
                Text(L("Per uur van de dag")).font(.system(size: 26, weight: .heavy))
                Chart {
                    ForEach(0..<24, id: \.self) { h in
                        BarMark(x: .value(L("Uur"), h), y: .value(L("Aantal"), y.perUur[h]))
                            .foregroundStyle(by: .value(L("Dag"), L("Gisteren")))
                            .position(by: .value(L("Dag"), L("Gisteren")))
                        BarMark(x: .value(L("Uur"), h), y: .value(L("Aantal"), t.perUur[h]))
                            .foregroundStyle(by: .value(L("Dag"), L("Vandaag")))
                            .position(by: .value(L("Dag"), L("Vandaag")))
                    }
                }
                .chartForegroundStyleScale([L("Vandaag"): Theme.red, L("Gisteren"): Color.gray.opacity(0.6)])
                .chartXAxis {
                    AxisMarks(values: [0, 6, 12, 18, 23]) { v in
                        AxisGridLine()
                        AxisValueLabel { if let h = v.as(Int.self) { Text(String(format: "%02d:00", h)) } }
                    }
                }
                .frame(height: 520)
                let top = t.perCategorie.sorted { $0.value > $1.value }.prefix(5)
                if !top.isEmpty {
                    Text(L("Meest voorkomend vandaag")).font(.system(size: 26, weight: .heavy)).padding(.top, 10)
                    ForEach(Array(top), id: \.key) { item in
                        HStack { Text(item.key); Spacer(); Text("\(item.value)").bold() }.font(.system(size: 20))
                    }
                }
            }
        }
        .padding(.horizontal, 80)
        .padding(.vertical, 40)
    }

    private func big(_ title: String, _ value: Int, _ color: Color) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title.uppercased()).font(.system(size: 20, weight: .black)).foregroundStyle(color)
            Text("\(value)").font(.system(size: 90, weight: .black, design: .rounded)).contentTransition(.numericText())
        }
        .padding(28)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(color.opacity(0.14), in: RoundedRectangle(cornerRadius: 30, style: .continuous))
    }
}
