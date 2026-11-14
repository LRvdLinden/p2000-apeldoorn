import SwiftUI

extension AppSettings {
    /// Warning pushes across all profiles (per profile it can still be changed under Notificaties › Profielen).
    func pushAan(_ bron: Waarschuwing.Bron) -> Bool {
        switch bron {
        case .nlalert: return profielen.contains { $0.actief && $0.nlalert }
        case .burgernet: return profielen.contains { $0.actief && $0.burgernet }
        case .knmi: return profielen.contains { $0.actief && !$0.knmi.isEmpty }
        case .amber: return pushAmber
        case .vermistkind: return pushVermistKind
        }
    }

    func zetPush(_ bron: Waarschuwing.Bron, _ aan: Bool) {
        if bron == .amber { pushAmber = aan; return }
        if bron == .vermistkind { pushVermistKind = aan; return }
        var list = profielen
        for i in list.indices {
            switch bron {
            case .nlalert: list[i].nlalert = aan
            case .burgernet: list[i].burgernet = aan
            case .knmi: list[i].knmi = aan ? (list[i].knmi.isEmpty ? ["orange", "red"] : list[i].knmi) : []
            case .amber, .vermistkind: break
            }
        }
        profielen = list
    }

    var knmiCodes: Set<String> {
        get { Set(profielen.filter(\.actief).flatMap(\.knmi)) }
        set {
            var list = profielen
            for i in list.indices { list[i].knmi = newValue }
            profielen = list
        }
    }
}

/// Instellingen › Waarschuwingen: pushes for NL-Alert, Burgernet and KNMI, and the history.
struct WaarschuwingenOverzichtView: View {
    @Environment(AppSettings.self) private var settings

    private var knmiSamenvatting: String {
        let c = settings.knmiCodes
        if c.isEmpty { return L("Uit") }
        if c.contains("yellow") { return L("Geel") }
        if c.contains("orange") { return L("Oranje") }
        return L("Rood")
    }

    var body: some View {
        Form {
            Section {
                Toggle(isOn: Binding(get: { settings.pushAan(.nlalert) }, set: { settings.zetPush(.nlalert, $0) })) {
                    rij(.nlalert, "NL-Alert", L("Waarschuwingen van de overheid bij noodsituaties, zoals een grote brand of gevaarlijke stoffen."))
                }
                Toggle(isOn: Binding(get: { settings.pushAan(.burgernet) }, set: { settings.zetPush(.burgernet, $0) })) {
                    rij(.burgernet, "Burgernet", L("Oproepen van de politie om mee te kijken, bijvoorbeeld bij een vermissing."))
                }
                Toggle(isOn: Binding(get: { settings.pushAan(.amber) }, set: { settings.zetPush(.amber, $0) })) {
                    rij(.amber, "AMBER Alert", L("Landelijke oproep van de politie als een kind vermist is en in levensgevaar kan zijn."))
                }
                Toggle(isOn: Binding(get: { settings.pushAan(.vermistkind) }, set: { settings.zetPush(.vermistkind, $0) })) {
                    rij(.vermistkind, L("Vermist Kind Alert"), L("Regionale oproep van de politie bij een vermist kind, als het zoekgebied in het werkgebied valt (Apeldoorn, alle dorpen en buurtschappen, en Teuge)."))
                }
                NavigationLink {
                    KnmiDrempelView()
                } label: {
                    HStack {
                        rij(.knmi, L("KNMI-weerwaarschuwingen"), L("Code geel, oranje en rood bij gevaarlijk weer."))
                        Spacer()
                        Text(knmiSamenvatting).foregroundStyle(.secondary)
                    }
                }
            } header: {
                Text(L("Pushmeldingen"))
            } footer: {
                Text(L("Geldt voor al je profielen; per profiel aanpassen kan bij Notificaties › Profielen. Je krijgt een waarschuwing als die de plaatsen van een profiel raakt (geen plaatsen gekozen = het hele werkgebied) en, als Mijn buurt aan staat, ook binnen je straal valt."))
            }
            Section {
                NavigationLink {
                    WaarschuwingenHistorieView()
                } label: {
                    Label {
                        Text(L("Alle waarschuwingen"))
                    } icon: {
                        Image(systemName: "list.bullet.rectangle.fill")
                            .foregroundStyle(.white)
                            .frame(width: 30, height: 30)
                            .background(.orange, in: RoundedRectangle(cornerRadius: 7, style: .continuous))
                    }
                }
            } footer: {
                Text(L("Een NL-Alert komt ook via je telefoon zelf binnen (Instellingen › Meldingen › Overheidsmeldingen), vaak iets eerder dan via deze app. Hier lees je hem rustig terug en zie je het gebied op de kaart."))
            }
        }
        .formStyle(.grouped)
        .navigationTitle(L("Waarschuwingen"))
    }

    private func rij(_ bron: Waarschuwing.Bron, _ titel: String, _ tekst: String) -> some View {
        HStack(alignment: .top, spacing: 12) {
            BronIcoon(bron: bron, size: 30)
            VStack(alignment: .leading, spacing: 2) {
                Text(titel)
                Text(tekst).font(.footnote).foregroundStyle(.secondary)
            }
        }
    }
}

/// From which KNMI code a push comes.
struct KnmiDrempelView: View {
    @Environment(AppSettings.self) private var settings

    var body: some View {
        Form {
            Section {
                ForEach([("yellow", L("Vanaf code geel"), Color(hex: 0xFFD500)), ("orange", L("Vanaf code oranje"), Color(hex: 0xFF8A00)),
                         ("red", L("Alleen code rood"), Color(hex: 0xE30613)), ("", L("Uit"), Color.secondary)], id: \.0) { code, titel, kleur in
                    Button {
                        settings.knmiCodes = code == "yellow" ? ["yellow", "orange", "red"] : code == "orange" ? ["orange", "red"] : code == "red" ? ["red"] : []
                    } label: {
                        HStack(spacing: 12) {
                            Circle().fill(kleur).frame(width: 14, height: 14)
                            Text(titel).foregroundStyle(.primary)
                            Spacer()
                            if huidig == code { Image(systemName: "checkmark").foregroundStyle(Theme.red).fontWeight(.semibold) }
                        }
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            } footer: {
                Text(L("Bij een hogere code krijg je opnieuw een pushmelding (bijvoorbeeld als geel oranje wordt)."))
            }
        }
        .formStyle(.grouped)
        .navigationTitle(L("KNMI-weerwaarschuwingen"))
    }

    private var huidig: String {
        let c = settings.knmiCodes
        if c.isEmpty { return "" }
        if c.contains("yellow") { return "yellow" }
        if c.contains("orange") { return "orange" }
        return "red"
    }
}

/// Small source icon: NL-Alert logo, Burgernet house, KNMI weather tile.
struct BronIcoon: View {
    let bron: Waarschuwing.Bron
    var size: CGFloat = 30
    var body: some View {
        Image("icon_\(bron.rawValue)")
            .resizable().scaledToFit().frame(width: size, height: size)
    }
}

/// "Alle waarschuwingen": NL-Alert, Burgernet and KNMI of the last two weeks, per day.
struct WaarschuwingenHistorieView: View {
    @State private var items: [Waarschuwing] = []
    @State private var loading = true
    @State private var failed = false

    private var perDag: [(dag: Date, items: [Waarschuwing])] {
        let cal = Calendar.current
        let groups = Dictionary(grouping: items) { cal.startOfDay(for: $0.start) }
        return groups.keys.sorted(by: >).map { ($0, groups[$0]!.sorted { $0.start > $1.start }) }
    }

    var body: some View {
        List {
            if items.isEmpty && !loading {
                ContentUnavailableView(failed ? L("Kon de waarschuwingen niet laden") : L("Geen waarschuwingen"),
                                       systemImage: "checkmark.shield",
                                       description: Text(failed ? L("Controleer je internetverbinding en probeer het opnieuw.") : L("Er waren de afgelopen dertig dagen geen waarschuwingen voor de gemeente Apeldoorn en Teuge.")))
            }
            ForEach(perDag, id: \.dag) { groep in
                Section {
                    ForEach(groep.items) { w in
                        NavigationLink { WaarschuwingDetailView(id: w.id) } label: { rij(w) }
                    }
                } header: {
                    Text(groep.dag.formatted(.dateTime.weekday(.wide).day().month(.wide).year()))
                }
            }
        }
        .overlay { if loading && items.isEmpty { ProgressView() } }
        .navigationTitle(L("Waarschuwingen"))
        .refreshable { await load() }
        .task { await load() }
    }

    private func rij(_ w: Waarschuwing) -> some View {
        HStack(alignment: .top, spacing: 12) {
            WaarschuwingIcon(waarschuwing: w, size: 36)
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 6) {
                    Text(verbatim: w.kop).font(.subheadline.weight(.semibold))
                        .foregroundStyle(w.bron == .nlalert ? Color.orange : w.color)
                        .lineLimit(1)
                    StatusChip(waarschuwing: w)
                }
                Text(w.titel).font(.body).lineLimit(3)
                Text(Lf("%@ om %@", w.start.formatted(.dateTime.weekday(.wide).day().month(.wide)), Fmt.time(w.start)))
                    .font(.subheadline).foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 4)
        .accessibilityElement(children: .combine)
    }

    private func load() async {
        loading = true
        defer { loading = false }
        do {
            items = try await P2000API.shared.waarschuwingen(days: 30)
            failed = false
        } catch {
            failed = true
        }
    }
}
