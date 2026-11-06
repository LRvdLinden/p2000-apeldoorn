import WidgetKit
import SwiftUI
import AppIntents

// MARK: - Shared bits

private struct WidgetTime: View {
    let date: Date
    var body: some View {
        (Text(date, style: .time) + Text(" · ") + Text(date, style: .relative))
            .monospacedDigit()
    }
}

private struct TodayCounts: View {
    let entry: MeldingEntry
    var iconSize: CGFloat = 14

    var body: some View {
        HStack(spacing: 10) {
            ForEach(Dienst.selectable) { d in
                HStack(spacing: 3) {
                    DienstIcon(dienst: d, size: iconSize)
                    Text("\(entry.perDienst[d] ?? 0)").font(AppFont.body(11, .bold, relativeTo: .caption2)).monospacedDigit()
                }
            }
        }
    }
}

private func widgetTint(for dienst: Dienst?) -> some View {
    LinearGradient(colors: [(dienst?.color ?? Theme.red).opacity(0.28), Color.clear],
                   startPoint: .topLeading, endPoint: .bottomTrailing)
}

private struct EmptyWidget: View {
    var body: some View {
        VStack(spacing: 6) {
            AppMark(size: 30)
            Text(L("Geen meldingen")).font(AppFont.body(12, .semibold, relativeTo: .caption))
        }
    }
}

// MARK: - Latest alert

struct LatestMeldingView: View {
    let entry: MeldingEntry
    @Environment(\.widgetFamily) private var family

    var body: some View {
        Group {
            if let m = entry.latest {
                switch family {
                #if !os(macOS)
                case .accessoryRectangular: rectangular(m)
                case .accessoryInline: inline(m)
                #endif
                #if !os(watchOS)
                case .systemMedium: medium(m)
                #endif
                default: small(m)
                }
            } else {
                EmptyWidget()
            }
        }
        .widgetURL(entry.latest.map { AppGroup.link(for: $0.guid) })
        .containerBackground(for: .widget) { widgetTint(for: entry.latest?.dienst) }
        .redacted(reason: entry.isPlaceholder ? .placeholder : [])
    }

    private func small(_ m: Melding) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(alignment: .top) {
                DienstIcon(dienst: m.dienst, size: 30)
                Spacer()
                PrioBadge(melding: m)
            }
            Spacer(minLength: 2)
            Text(m.title)
                .font(AppFont.body(14, .bold))
                .lineLimit(3)
                .minimumScaleFactor(0.85)
            Label(m.plaatsText, systemImage: "mappin")
                .font(AppFont.body(11, .regular, relativeTo: .caption2))
                .foregroundStyle(.secondary)
                .lineLimit(1)
            WidgetTime(date: m.datum)
                .font(AppFont.body(11, .semibold, relativeTo: .caption2))
                .foregroundStyle(m.isUrgent ? Theme.red : m.dienst.textColor)
                .lineLimit(1)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }

    private func medium(_ m: Melding) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .top, spacing: 12) {
                DienstIcon(dienst: m.dienst, size: 44)
                VStack(alignment: .leading, spacing: 3) {
                    HStack(spacing: 6) {
                        Text(m.dienst.label.uppercased())
                            .font(AppFont.body(11, .bold, relativeTo: .caption2))
                            .tracking(1)
                            .foregroundStyle(m.dienst.textColor)
                        PrioBadge(melding: m)
                        Spacer()
                        WidgetTime(date: m.datum).font(AppFont.body(11, .regular, relativeTo: .caption2)).foregroundStyle(.secondary).lineLimit(1)
                    }
                    Text(m.title).font(AppFont.body(15, .bold)).lineLimit(2)
                    if !m.prioriteitText.isEmpty {
                        Text(m.prioriteitText).font(AppFont.body(12, .semibold, relativeTo: .caption))
                            .foregroundStyle(m.isUrgent ? Theme.red : .secondary).lineLimit(1)
                    }
                    Label(m.plaatsText, systemImage: "mappin.and.ellipse").font(AppFont.body(12, .regular, relativeTo: .caption)).foregroundStyle(.secondary).lineLimit(1)
                }
            }
            Spacer(minLength: 0)
            HStack {
                Text(Lf("Vandaag: %lld", entry.today)).font(AppFont.body(12, .bold, relativeTo: .caption))
                Spacer()
                TodayCounts(entry: entry)
            }
        }
    }

    #if !os(macOS)
    private func rectangular(_ m: Melding) -> some View {
        HStack(spacing: 6) {
            DienstIcon(dienst: m.dienst, size: 22).widgetAccentable()
            VStack(alignment: .leading, spacing: 0) {
                Text(m.title).font(AppFont.heading(18, relativeTo: .headline)).lineLimit(2).minimumScaleFactor(0.8)
                (Text(m.stad?.capitalizedPlaats ?? "Apeldoorn") + Text(" · ") + Text(m.datum, style: .time))
                    .font(AppFont.body(11, .regular, relativeTo: .caption2)).foregroundStyle(.secondary).lineLimit(1)
            }
            Spacer(minLength: 0)
        }
    }

    private func inline(_ m: Melding) -> some View {
        ViewThatFits {
            Text("\(m.dienst.label) · \(m.stad?.capitalizedPlaats ?? "Apeldoorn") · \(Fmt.time(m.datum))")
            Text("\(m.dienst.label) · \(Fmt.time(m.datum))")
        }
    }
    #endif
}

#if !os(watchOS)
// MARK: - List

struct MeldingenListView: View {
    let entry: MeldingEntry
    @Environment(\.widgetFamily) private var family

    private var count: Int {
        switch family {
        case .systemMedium: return 3
        #if !os(watchOS)
        case .systemExtraLarge: return 8
        #endif
        default: return 6
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: family == .systemMedium ? 6 : 8) {
            header
            if entry.meldingen.isEmpty {
                Spacer(); EmptyWidget().frame(maxWidth: .infinity); Spacer()
            } else {
                rows
                Spacer(minLength: 0)
            }
        }
        .containerBackground(for: .widget) { widgetTint(for: entry.discipline.dienst) }
        .redacted(reason: entry.isPlaceholder ? .placeholder : [])
    }

    private var header: some View {
        HStack(spacing: 8) {
            AppMark(size: family == .systemMedium ? 20 : 26)
            Text(entry.discipline == .alle ? "A-Alerts" : "A-Alerts · \(entry.discipline.dienst?.label ?? "")")
                .font(AppFont.heading(family == .systemMedium ? 13 : 15))
                .lineLimit(1)
            Spacer()
            if family != .systemMedium {
                TodayCounts(entry: entry, iconSize: 13)
                Button(intent: RefreshWidgetIntent()) {
                    Image(systemName: "arrow.clockwise").font(.caption.weight(.bold))
                }
                .buttonStyle(.plain)
                .foregroundStyle(Theme.red)
            } else {
                Text(Lf("Vandaag: %lld", entry.today)).font(AppFont.body(11, .bold, relativeTo: .caption2)).foregroundStyle(.secondary)
            }
        }
    }

    @ViewBuilder
    private var rows: some View {
        let items = Array(entry.meldingen.prefix(count))
        #if !os(watchOS)
        if family == .systemExtraLarge {
            let half = (items.count + 1) / 2
            HStack(alignment: .top, spacing: 16) {
                VStack(spacing: 8) { ForEach(items.prefix(half)) { row($0) } }
                VStack(spacing: 8) { ForEach(items.dropFirst(half)) { row($0) } }
            }
        } else {
            ForEach(items) { row($0) }
        }
        #else
        ForEach(items) { row($0) }
        #endif
    }

    private func row(_ m: Melding) -> some View {
        Link(destination: AppGroup.link(for: m.guid)) {
            HStack(spacing: 8) {
                DienstIcon(dienst: m.dienst, size: family == .systemMedium ? 20 : 24)
                VStack(alignment: .leading, spacing: 1) {
                    Text(m.title).font(AppFont.body(12.5, .semibold)).lineLimit(1)
                    Text("\(m.plaatsText) · \(m.prioriteitText)")
                        .font(AppFont.body(10.5, .regular))
                        .foregroundStyle(m.isUrgent ? Theme.red : .secondary)
                        .lineLimit(1)
                }
                Spacer(minLength: 4)
                Text(m.datum, style: .time)
                    .font(AppFont.body(11, .semibold)).monospacedDigit()
                    .foregroundStyle(.secondary)
            }
        }
    }
}
#endif

// MARK: - Today

struct TodayView: View {
    let entry: MeldingEntry
    @Environment(\.widgetFamily) private var family

    var body: some View {
        Group {
            switch family {
            #if !os(macOS)
            case .accessoryCircular: circular
            case .accessoryInline: Text(Lf("P2000 vandaag: %lld", entry.today))
            #endif
            #if os(watchOS)
            case .accessoryCorner: corner
            #endif
            default: small
            }
        }
        .widgetURL(URL(string: "p2000apeldoorn://statistieken"))
        .containerBackground(for: .widget) { widgetTint(for: nil) }
    }

    private var small: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                AppMark(size: 22)
                Text(L("Vandaag")).font(AppFont.body(12, .bold, relativeTo: .caption))
                Spacer()
            }
            Text("\(entry.today)")
                .font(AppFont.heading(40))
                .contentTransition(.numericText())
                .minimumScaleFactor(0.6)
            Spacer(minLength: 0)
            Grid(horizontalSpacing: 10, verticalSpacing: 4) {
                GridRow { cell(.brandweer); cell(.ambulance) }
                GridRow { cell(.politie); cell(.traumaheli) }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func cell(_ d: Dienst) -> some View {
        HStack(spacing: 4) {
            DienstIcon(dienst: d, size: 15)
            Text("\(entry.perDienst[d] ?? 0)").font(AppFont.body(12, .bold, relativeTo: .caption)).monospacedDigit()
            Spacer(minLength: 0)
        }
    }

    #if !os(macOS)
    private var circular: some View {
        ZStack {
            AccessoryWidgetBackground()
            VStack(spacing: -2) {
                Text("\(entry.today)").font(AppFont.body(22, .bold)).minimumScaleFactor(0.5)
                Text(verbatim: "A-Alerts").font(AppFont.body(9, .semibold))
            }
        }
        .widgetAccentable()
    }
    #endif

    #if os(watchOS)
    private var corner: some View {
        Text("\(entry.today)")
            .font(AppFont.body(20, .bold))
            .widgetLabel { Text(L("P2000 vandaag")) }
    }
    #endif
}
