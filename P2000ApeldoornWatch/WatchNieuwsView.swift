import SwiftUI

/// Tab Nieuws on Apple Watch: a short list of titles; tap to read the text or the newest messages.
struct WatchNieuwsView: View {
    @State private var store = NieuwsStore.shared

    var body: some View {
        List {
            Section {
                if store.items.isEmpty {
                    Text(store.loading ? L("Laden…") : L("Geen nieuws")).foregroundStyle(.secondary)
                }
                ForEach(store.items.prefix(25)) { item in
                    NavigationLink { WatchNieuwsDetail(id: item.id) } label: {
                        VStack(alignment: .leading, spacing: 3) {
                            Text(item.label).font(.caption2.bold()).foregroundStyle(item.kleur == Color(hex: 0x1B265E) ? Color.yellow : item.kleur)
                            Text(item.titel).font(.footnote.weight(.semibold)).lineLimit(3)
                            Text(NieuwsItem.wanneer(item.soort == .liveblog ? item.laatste : item.at)).font(.caption2).foregroundStyle(.secondary)
                        }
                    }
                }
            } header: {
                Text(L("Nieuws"))
            }
        }
        .navigationTitle(L("Nieuws"))
        .task { await store.load() }
    }
}

struct WatchNieuwsDetail: View {
    let id: String
    @State private var detail: NieuwsDetail?

    var body: some View {
        ScrollView {
            if let weer = detail?.weer {
                // Weather: like knmi.nl, compact.
                VStack(alignment: .leading, spacing: 8) {
                    WeerKaart(weer: weer, hoogte: 150, interactief: false)
                    Text(weer.kop).font(.headline)
                    Text(weer.opgeheven ? L("Code groen") : weer.code).font(.caption.bold()).foregroundStyle(weer.opKleur)
                        .padding(.horizontal, 8).padding(.vertical, 3).background(weer.kleur, in: RoundedRectangle(cornerRadius: 5))
                    if let t = weer.tijdvak { Text(t).font(.footnote.bold()) }
                    if let o = weer.omschrijving, !o.isEmpty { Text(o).font(.footnote) }
                    if !weer.adviezen.isEmpty {
                        Text(L("Risico's en advies")).font(.footnote.bold()).foregroundStyle(Theme.red)
                        ForEach(weer.adviezen, id: \.self) { a in Text("› \(a)").font(.footnote) }
                    }
                    if let u = weer.uitgifte { Text(Lf("Uitgifte: %@", u)).font(.caption2).foregroundStyle(.secondary) }
                    Text(L("Bron: KNMI.")).font(.caption2).foregroundStyle(.secondary)
                }
            } else if let d = detail {
                VStack(alignment: .leading, spacing: 8) {
                    Text(d.item.label).font(.caption2.bold()).foregroundStyle(.secondary)
                    Text(d.item.titel).font(.headline)
                    if let intro = d.item.intro, !intro.isEmpty, d.item.soort != .liveblog { Text(intro).font(.footnote.weight(.semibold)) }
                    ForEach(d.alineas.prefix(6), id: \.self) { a in
                        if let t = a.titel, !t.isEmpty { Text(t).font(.footnote.bold()) }
                        Text(a.tekst).font(.footnote)
                    }
                    ForEach(d.tijdlijn.prefix(12)) { b in
                        VStack(alignment: .leading, spacing: 2) {
                            Text("\(b.at.formatted(date: .abbreviated, time: .shortened)) · \(b.isEigen ? "A-Alerts" : d.item.bronNaam)")
                                .font(.caption2).foregroundStyle(b.isEigen ? Color.red : .secondary)
                            if let t = b.titel, !t.isEmpty { Text(t).font(.footnote.bold()) }
                            Text(b.tekst).font(.footnote)
                        }
                        .padding(.vertical, 4)
                    }
                    Text(d.item.soort == .regionaal ? L("Bron: 112 Nieuws (112nieuws.net).") : d.item.soort == .politie ? L("Bron: politie.nl.") : d.item.soort == .weer ? L("Bron: KNMI.") : "")
                        .font(.caption2).foregroundStyle(.secondary)
                }
            } else {
                ProgressView()
            }
        }
        .task(id: id) { detail = try? await P2000API.shared.nieuws(id: id) }
    }
}
