import SwiftUI

/// The "Pager" timeline, like the home screen of a-alerts.nl.
struct PagerView: View {
    @Environment(MeldingStore.self) private var store
    @Environment(AppSettings.self) private var settings
    @Environment(LocationManager.self) private var location
    @Environment(WaarschuwingStore.self) private var warnings

    enum Scope: String, CaseIterable, Identifiable {
        case alle, bewaard
        var id: String { rawValue }
        var label: String { self == .alle ? L("Alle meldingen") : L("Bewaard") }
    }

    @State private var search = ""
    @State private var scope: Scope = .alle
    @State private var selection: String?
    @State private var showFilters = false

    private var list: [Melding] {
        store.filtered(settings, search: search, onlyBewaard: scope == .bewaard)
    }

    /// P2000 alerts with NL-Alert and Burgernet in between, newest first (bewaard: alerts only).
    private var items: [PagerItem] {
        var all = list.map(PagerItem.melding)
        if scope == .alle { all += warnings.pager(settings, search: search).map(PagerItem.waarschuwing) }
        return all.sorted { $0.date > $1.date }
    }

    /// Viewed alerts that are hidden now ("Verberg bekeken meldingen").
    private var verborgen: Int { store.meldingen.filter { settings.isRead($0) }.count }

    private var bijRij: some View {
        HStack(spacing: 10) {
            Image(systemName: "checkmark.circle.fill").foregroundStyle(.green)
            VStack(alignment: .leading, spacing: 1) {
                Text(L("Je bent helemaal bij")).font(AppFont.body(15, .semibold))
                Text(Lf("%lld bekeken meldingen verborgen", verborgen)).font(AppFont.body(12)).foregroundStyle(.secondary)
            }
            Spacer()
            Button(L("Toon")) { settings.hideRead = false }.font(AppFont.body(14, .semibold))
        }
        .listRowBackground(Color.clear)
    }

    private var knmi: [Waarschuwing] { scope == .alle ? warnings.knmiBanner(settings) : [] }

    var body: some View {
        NavigationSplitView {
            content
                .navigationTitle(scope == .bewaard ? Text(L("Bewaard")) : Text(verbatim: "A-Alerts"))
                #if os(iOS)
                .navigationBarTitleDisplayMode(.inline)
                #endif
                .searchable(text: $search, prompt: L("Zoek op plaats, straat of capcode"))
                .refreshable {
                    await store.refresh()
                }
                .toolbar {
                    // Saved alerts behind a button top left; from there back to all alerts.
                    ToolbarItem(placement: .navigation) {
                        if scope == .bewaard {
                            Button {
                                withAnimation { scope = .alle }
                            } label: {
                                Label(L("Pager"), systemImage: "chevron.left").labelStyle(.titleAndIcon)
                            }
                            .accessibilityLabel(L("Terug naar alle meldingen"))
                        } else {
                            Button {
                                withAnimation { scope = .bewaard }
                            } label: {
                                Label(L("Bewaard"), systemImage: settings.bewaard.isEmpty ? "bookmark" : "bookmark.fill")
                            }
                            .accessibilityLabel(L("Bewaarde meldingen"))
                        }
                    }
                    ToolbarItem(placement: .primaryAction) {
                        // Quick switch: hide viewed alerts.
                        Button { withAnimation { settings.hideRead.toggle() } } label: {
                            Label(settings.hideRead ? L("Toon bekeken meldingen") : L("Verberg bekeken meldingen"),
                                  systemImage: settings.hideRead ? "eye.slash.circle.fill" : "eye.circle")
                        }
                    }
                    ToolbarItem(placement: .primaryAction) {
                        Button {
                            showFilters = true
                        } label: {
                            Label(L("Filteren"), systemImage: settings.listFilterActive
                                  ? "line.3.horizontal.decrease.circle.fill" : "line.3.horizontal.decrease.circle")
                        }
                    }
                }
                .sheet(isPresented: $showFilters) {
                    NavigationStack { FilterSettingsView(isSheet: true) }
                        #if os(macOS)
                        .frame(minWidth: 460, minHeight: 560)
                        #endif
                }
                .navigationSplitViewColumnWidth(min: 340, ideal: 400, max: 520)
        } detail: {
            if let selection, selection.hasPrefix("w:") {
                NavigationStack {
                    WaarschuwingDetailView(id: String(selection.dropFirst(2)))
                }
                .id(selection)
            } else if let selection, let melding = store.meldingen.first(where: { $0.guid == selection }) {
                NavigationStack {
                    MeldingDetailView(melding: melding)
                }
                .id(selection)
            } else {
                ContentUnavailableView(L("Kies een melding"),
                                       systemImage: "light.beacon.max",
                                       description: Text(L("Selecteer links een melding om alle details en de kaart te zien.")))
            }
        }
    }

    @ViewBuilder
    private var content: some View {
        List(selection: $selection) {
            Section {
                StatusHeader()
                    .listRowInsets(EdgeInsets(top: 8, leading: 12, bottom: 8, trailing: 12))
                    .listRowBackground(Color.clear)
                MeldingenUitBanner()
                    .listRowInsets(EdgeInsets(top: 0, leading: 12, bottom: 0, trailing: 12))
                    .listRowBackground(Color.clear)
                    .listRowSeparator(.hidden)
                    .listRowSeparator(.hidden)
                if !knmi.isEmpty {
                    KnmiBanner(items: knmi) { selection = $0.selectionTag }
                        .listRowInsets(EdgeInsets(top: 4, leading: 0, bottom: 4, trailing: 0))
                        .listRowBackground(Color.clear)
                        .listRowSeparator(.hidden)
                }
            }

            if items.isEmpty {
                emptyState
                    .listRowBackground(Color.clear)
                    .listRowSeparator(.hidden)
            } else if settings.groupByDay {
                ForEach(PagerItem.groupedByDay(items), id: \.day) { group in
                    Section {
                        rows(group.items)
                    } header: {
                        Text(Fmt.dayHeader(group.day))
                    }
                }
            } else {
                Section { rows(items) }
            }

            // Viewed alerts hidden: "you are all caught up", with a way to show them again.
            if settings.hideRead && scope == .alle && verborgen > 0 && !items.isEmpty {
                Section { bijRij }
            }

            Section {
                footer
                    .listRowBackground(Color.clear)
                    .listRowSeparator(.hidden)
            }
        }
        #if os(iOS)
        .listStyle(.insetGrouped)
        #else
        .listStyle(.inset)
        #endif
        .animation(.default, value: items.map(\.id))
    }

    private func rows(_ items: [PagerItem]) -> some View {
        ForEach(items) { item in
            switch item {
            case .melding(let m): meldingRow(m)
            case .waarschuwing(let w):
                WaarschuwingRow(waarschuwing: w)
                    .tag(w.selectionTag)
                    .contextMenu {
                        if let link = w.link, let url = URL(string: link) {
                            Link(destination: url) { Label(L("Bekijk de officiële bron"), systemImage: "safari") }
                        }
                    }
            }
        }
    }

    @ViewBuilder
    private func meldingRow(_ m: Melding) -> some View {
            MeldingRow(melding: m, distance: location.distance(to: m), bewaard: settings.bewaard.contains(m.guid),
                       gelezen: settings.isRead(m))
                .tag(m.guid)
                .swipeActions(edge: .leading) {
                    Button {
                        settings.toggleBewaard(m)
                    } label: {
                        Label(settings.bewaard.contains(m.guid) ? L("Verwijder") : L("Bewaar"),
                              systemImage: settings.bewaard.contains(m.guid) ? "bookmark.slash" : "bookmark")
                    }
                    .tint(.orange)
                }
                .contextMenu {
                    Button {
                        settings.toggleBewaard(m)
                    } label: {
                        Label(settings.bewaard.contains(m.guid) ? L("Niet meer bewaren") : L("Bewaar"),
                              systemImage: "bookmark")
                    }
                    ShareLink(item: m.shareText) { Label(L("Deel"), systemImage: "square.and.arrow.up") }
                }
    }

    @ViewBuilder
    private var emptyState: some View {
        if settings.hideRead && scope == .alle && search.isEmpty && verborgen > 0 {
            ContentUnavailableView {
                Label(L("Je bent helemaal bij"), systemImage: "checkmark.circle")
            } description: {
                Text(Lf("Je hebt alle %lld meldingen al bekeken. Nieuwe meldingen verschijnen hier vanzelf.", verborgen))
            } actions: {
                Button(L("Toon bekeken meldingen")) { settings.hideRead = false }
            }
        } else if store.meldingen.isEmpty && store.isLoading {
            HStack {
                Spacer()
                ProgressView(L("Meldingen laden..."))
                Spacer()
            }
            .padding(.vertical, 40)
        } else if scope == .bewaard {
            ContentUnavailableView(L("Nog niets bewaard"), systemImage: "bookmark",
                                   description: Text(L("Veeg een melding naar rechts of open hem en tik op het bladwijzer-icoon.")))
        } else if !search.isEmpty {
            ContentUnavailableView.search(text: search)
        } else {
            ContentUnavailableView(L("Geen meldingen"), systemImage: "checkmark.shield",
                                   description: Text(settings.listFilterActive ? L("Er zijn geen meldingen die bij je filters passen.") : L("Er zijn op dit moment geen meldingen.")))
        }
    }

    private var footer: some View {
        VStack(spacing: 6) {
            Text(L("Niet alle meldingen van politie en ambulance staan in de app, omdat deze niet altijd via het P2000-netwerk worden verstuurd."))
                .multilineTextAlignment(.center)
        }
        .font(AppFont.body(12, .regular, relativeTo: .caption))
        .foregroundStyle(.secondary)
        .frame(maxWidth: .infinity)
        .padding(.vertical, 8)
    }
}

// MARK: - Header

/// Logo, live clock, online status and today's numbers.
struct StatusHeader: View {
    @Environment(MeldingStore.self) private var store

    var body: some View {
        VStack(spacing: 14) {
            HStack(spacing: 12) {
                AppMark(size: 46)
                VStack(alignment: .leading, spacing: 2) {
                    Text(verbatim: "A-Alerts")
                        .font(AppFont.heading(18, relativeTo: .headline))
                    HStack(spacing: 6) {
                        LiveDot(online: store.isOnline)
                        Text(store.isOnline ? L("Online") : L("Offline"))
                            .font(AppFont.body(12, .semibold, relativeTo: .caption))
                            .foregroundStyle(store.isOnline ? Theme.online : Theme.red)
                        if let updated = store.lastUpdated {
                            TimelineView(.periodic(from: .now, by: 15)) { ctx in
                                Text("· " + Lf("bijgewerkt %@", Fmt.agoShort(updated, now: ctx.date)))
                                    .font(AppFont.body(12, .regular, relativeTo: .caption))
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                }
                Spacer()
                TimelineView(.periodic(from: .now, by: 1)) { ctx in
                    VStack(alignment: .trailing, spacing: 0) {
                        Text(ctx.date.formatted(.dateTime.hour(.twoDigits(amPM: .omitted)).minute(.twoDigits).second(.twoDigits)))
                            .font(AppFont.heading(20, relativeTo: .title3).monospacedDigit())
                        Text(ctx.date.formatted(.dateTime.weekday(.abbreviated).day().month(.abbreviated)))
                            .font(AppFont.body(11, .regular, relativeTo: .caption2))
                            .foregroundStyle(.secondary)
                    }
                }
            }
            TodayStrip()
        }
        .padding(14)
        .background(.background.secondary, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
    }
}

/// "Vandaag": total plus a tile per discipline (same as the website's statistics block).
struct TodayStrip: View {
    @Environment(MeldingStore.self) private var store

    var body: some View {
        let today = store.vandaag
        HStack(spacing: 8) {
            tile(value: today.totaal, label: L("Vandaag"), icon: nil, color: Theme.red)
            ForEach(Dienst.selectable) { d in
                tile(value: today.perDienst[d] ?? 0, label: d.label, icon: d, color: d.color)
            }
        }
    }

    private func tile(value: Int, label: String, icon: Dienst?, color: Color) -> some View {
        VStack(spacing: 4) {
            if let icon {
                DienstIcon(dienst: icon, size: 18)
            } else {
                Image(systemName: "calendar").font(.system(size: 15, weight: .bold)).foregroundStyle(color)
                    .frame(height: 18)
            }
            Text("\(value)")
                .font(AppFont.heading(18, relativeTo: .headline).monospacedDigit())
                .contentTransition(.numericText())
            Text(label)
                .font(AppFont.body(9, .semibold))
                .foregroundStyle(.secondary)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 8)
        .background(color.opacity(0.1), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .accessibilityElement(children: .combine)
    }
}

// MARK: - Row

struct MeldingRow: View {
    let melding: Melding
    var distance: Double?
    var bewaard = false
    /// Opened before → shown greyed out (like the website).
    var gelezen = false

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            DienstIcon(dienst: melding.dienst, size: 38)
                .padding(.top, 2)
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 6) {
                    TimelineView(.periodic(from: .now, by: 30)) { ctx in
                        Text("\(Fmt.ago(melding.datum, now: ctx.date)) - \(Fmt.time(melding.datum))")
                    }
                    .font(AppFont.body(12, .regular, relativeTo: .caption))
                    .foregroundStyle(.secondary)
                    Spacer(minLength: 4)
                    if bewaard {
                        Image(systemName: "bookmark.fill").font(.caption2).foregroundStyle(.orange)
                    }
                    if melding.views > 0 {
                        Label("\(melding.views)x", systemImage: "eye")
                            .labelStyle(.titleAndIcon)
                            .font(AppFont.body(11, .semibold, relativeTo: .caption2))
                            .foregroundStyle(.secondary)
                    }
                }
                Text(melding.title)
                    .font(AppFont.body(15, .bold, relativeTo: .subheadline))
                    .foregroundStyle(.primary)
                    .lineLimit(2)
                HStack(spacing: 4) {
                    Image(systemName: "mappin.and.ellipse")
                    Text(melding.plaatsText)
                    if let distance {
                        Text("· " + Fmt.distance(distance))
                    }
                }
                .font(AppFont.body(12, .regular, relativeTo: .caption))
                .foregroundStyle(.secondary)
                if !melding.prioriteitText.isEmpty {
                    Text(melding.prioriteitText)
                        .font(AppFont.body(12, .semibold, relativeTo: .caption))
                        .foregroundStyle(melding.isUrgent ? Theme.red : melding.dienst.textColor)
                        .lineLimit(1)
                }
            }
        }
        .padding(.vertical, 4)
        .saturation(gelezen ? 0 : 1)
        .opacity(gelezen ? 0.5 : 1)
        .accessibilityElement(children: .combine)
        .accessibilityValue(gelezen ? L("Gelezen") : "")
    }
}

// MARK: - Combined timeline

/// One entry in the pager: a P2000 alert or an NL-Alert / Burgernet warning.
enum PagerItem: Identifiable, Equatable {
    case melding(Melding)
    case waarschuwing(Waarschuwing)

    var id: String {
        switch self {
        case .melding(let m): return m.guid
        case .waarschuwing(let w): return w.selectionTag
        }
    }

    var date: Date {
        switch self {
        case .melding(let m): return m.datum
        case .waarschuwing(let w): return w.start
        }
    }

    static func == (a: PagerItem, b: PagerItem) -> Bool { a.id == b.id }

    /// Groups by calendar day, newest day first.
    static func groupedByDay(_ list: [PagerItem]) -> [(day: Date, items: [PagerItem])] {
        let cal = Calendar.current
        let groups = Dictionary(grouping: list) { cal.startOfDay(for: $0.date) }
        return groups.keys.sorted(by: >).map { ($0, groups[$0]!.sorted { $0.date > $1.date }) }
    }
}
