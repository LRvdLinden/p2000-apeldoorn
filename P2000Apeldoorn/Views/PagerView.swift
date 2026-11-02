import SwiftUI

/// The "Pager" timeline, like the home screen of p2000-apeldoorn.nl.
struct PagerView: View {
    @Environment(MeldingStore.self) private var store
    @Environment(AppSettings.self) private var settings
    @Environment(LocationManager.self) private var location

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

    var body: some View {
        NavigationSplitView {
            content
                .navigationTitle("P2000 Apeldoorn")
                #if os(iOS)
                .navigationBarTitleDisplayMode(.inline)
                #endif
                .searchable(text: $search, prompt: L("Zoek op plaats, straat of capcode"))
                .refreshable {
                    await store.refresh()
                }
                .toolbar {
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
            if let selection, let melding = store.meldingen.first(where: { $0.guid == selection }) {
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
                    .listRowSeparator(.hidden)
                Picker(L("Weergave"), selection: $scope) {
                    ForEach(Scope.allCases) { Text($0.label).tag($0) }
                }
                .pickerStyle(.segmented)
                .labelsHidden()
                .listRowBackground(Color.clear)
                .listRowSeparator(.hidden)
                if settings.listFilterActive && scope == .alle {
                    ActiveFilterBar(showFilters: $showFilters)
                        .listRowBackground(Color.clear)
                        .listRowSeparator(.hidden)
                }
            }

            if list.isEmpty {
                emptyState
                    .listRowBackground(Color.clear)
                    .listRowSeparator(.hidden)
            } else if settings.groupByDay {
                ForEach(MeldingStore.groupedByDay(list), id: \.day) { group in
                    Section {
                        rows(group.items)
                    } header: {
                        Text(Fmt.dayHeader(group.day))
                    }
                }
            } else {
                Section { rows(list) }
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
        .animation(.default, value: list.map(\.guid))
    }

    private func rows(_ items: [Melding]) -> some View {
        ForEach(items) { m in
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
                    if let link = m.link, let url = URL(string: link) {
                        Link(destination: url) { Label(L("Bekijk op p2000.page"), systemImage: "safari") }
                    }
                }
        }
    }

    @ViewBuilder
    private var emptyState: some View {
        if store.meldingen.isEmpty && store.isLoading {
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
            Link(destination: Config.source) {
                Text(L("Bron: p2000.page"))
            }
        }
        .font(.caption)
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
                    Text("P2000 Apeldoorn")
                        .font(.headline.weight(.black))
                    HStack(spacing: 6) {
                        LiveDot(online: store.isOnline)
                        Text(store.isOnline ? L("Online") : L("Offline"))
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(store.isOnline ? Theme.online : Theme.red)
                        if let updated = store.lastUpdated {
                            TimelineView(.periodic(from: .now, by: 15)) { ctx in
                                Text("· " + Lf("bijgewerkt %@", Fmt.agoShort(updated, now: ctx.date)))
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                }
                Spacer()
                TimelineView(.periodic(from: .now, by: 1)) { ctx in
                    VStack(alignment: .trailing, spacing: 0) {
                        Text(ctx.date.formatted(.dateTime.hour(.twoDigits(amPM: .omitted)).minute(.twoDigits).second(.twoDigits)))
                            .font(.title3.weight(.bold).monospacedDigit())
                        Text(ctx.date.formatted(.dateTime.weekday(.abbreviated).day().month(.abbreviated)))
                            .font(.caption2)
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
                .font(.headline.monospacedDigit())
                .contentTransition(.numericText())
            Text(label)
                .font(.system(size: 9, weight: .semibold))
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

struct ActiveFilterBar: View {
    @Environment(AppSettings.self) private var settings
    @Binding var showFilters: Bool

    var body: some View {
        HStack {
            Image(systemName: "line.3.horizontal.decrease")
            Text(summary).lineLimit(1)
            Spacer()
            Button(L("Wis")) {
                settings.diensten = []
                settings.plaatsen = []
                settings.prioriteiten = []
                settings.radiusEnabled = false
            }
            .font(.callout.weight(.semibold))
        }
        .font(.callout)
        .padding(.horizontal, 12).padding(.vertical, 8)
        .background(Theme.red.opacity(0.12), in: Capsule())
        .contentShape(Capsule())
        .onTapGesture { showFilters = true }
    }

    private var summary: String {
        var parts: [String] = []
        if !settings.diensten.isEmpty { parts.append(settings.diensten.compactMap { Dienst(rawValue: $0)?.label }.sorted().joined(separator: ", ")) }
        if !settings.plaatsen.isEmpty { parts.append(Lf("%lld plaatsen", settings.plaatsen.count)) }
        if !settings.prioriteiten.isEmpty { parts.append(settings.prioriteiten.sorted().joined(separator: ", ")) }
        if settings.radiusActive { parts.append(Lf("binnen %@ km", settings.radiusKm.formatted(.number.precision(.fractionLength(0...1))))) }
        return parts.joined(separator: " · ")
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
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    Spacer(minLength: 4)
                    if bewaard {
                        Image(systemName: "bookmark.fill").font(.caption2).foregroundStyle(.orange)
                    }
                    if melding.views > 0 {
                        Label("\(melding.views)x", systemImage: "eye")
                            .labelStyle(.titleAndIcon)
                            .font(.caption2.weight(.semibold))
                            .foregroundStyle(.secondary)
                    }
                }
                Text(melding.title)
                    .font(.subheadline.weight(.bold))
                    .foregroundStyle(.primary)
                    .lineLimit(2)
                HStack(spacing: 4) {
                    Image(systemName: "mappin.and.ellipse")
                    Text(melding.plaatsText)
                    if let distance {
                        Text("· " + Fmt.distance(distance))
                    }
                }
                .font(.caption)
                .foregroundStyle(.secondary)
                if !melding.prioriteitText.isEmpty {
                    Text(melding.prioriteitText)
                        .font(.caption.weight(.semibold))
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
