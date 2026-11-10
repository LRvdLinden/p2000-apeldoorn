import SwiftUI

/// Tab Nieuws on Apple TV: large image cards with the title on the photo; select one to read it.
struct TVNieuwsView: View {
    @State private var store = NieuwsStore.shared
    @State private var filter: NieuwsItem.Soort?

    private var zichtbaar: [NieuwsItem] { store.items.filter { filter == nil || $0.soort == filter } }
    private let kolommen = [GridItem(.adaptive(minimum: 540), spacing: 48)]

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 36) {
                    HStack(spacing: 20) {
                        filterKnop(L("Alles"), nil)
                        filterKnop(L("Liveblogs"), .liveblog)
                        filterKnop(L("Politie"), .politie)
                        filterKnop("112 Nieuws", .regionaal)
                        filterKnop(L("Weer"), .weer)
                    }
                    if store.loading && store.items.isEmpty {
                        ProgressView().frame(maxWidth: .infinity).padding(.top, 120)
                    } else if zichtbaar.isEmpty {
                        Text(L("Er is nu geen nieuws in deze categorie.")).font(AppFont.body(28)).foregroundStyle(.secondary).padding(.top, 80)
                    } else {
                        LazyVGrid(columns: kolommen, spacing: 56) {
                            ForEach(zichtbaar) { item in
                                NavigationLink { TVNieuwsDetail(id: item.id) } label: { TVNieuwsKaart(item: item) }
                                    .buttonStyle(.card)
                            }
                        }
                    }
                    Text(L("Politieberichten: bron politie.nl. Afbeeldingen bij politieberichten zijn stockfoto's."))
                        .font(AppFont.body(20)).foregroundStyle(.secondary)
                }
                .padding(.horizontal, 80).padding(.vertical, 40)
            }
            .task {
                await store.load()
                while !Task.isCancelled {
                    try? await Task.sleep(for: .seconds(120))
                    await store.load(force: true)
                }
            }
        }
    }

    private func filterKnop(_ titel: String, _ soort: NieuwsItem.Soort?) -> some View {
        Button { filter = soort } label: {
            Text(titel).font(AppFont.body(24, filter == soort ? .bold : .regular))
        }
        .buttonStyle(.bordered)
        .tint(filter == soort ? Theme.red : nil)
    }
}

struct TVNieuwsKaart: View {
    let item: NieuwsItem
    var body: some View {
        Color.clear
            .frame(maxWidth: .infinity).frame(height: 320)
            .overlay { NieuwsAfbeeldingTV(item: item) }
            .overlay { LinearGradient(colors: [.clear, .black.opacity(0.88)], startPoint: .center, endPoint: .bottom) }
            .overlay(alignment: .bottomLeading) {
                VStack(alignment: .leading, spacing: 10) {
                    Text(item.label.uppercased()).font(AppFont.body(18, .bold)).foregroundStyle(.black)
                        .padding(.horizontal, 12).padding(.vertical, 5).background(.white, in: Capsule())
                    Text(item.titel).font(AppFont.heading(30)).foregroundStyle(.white).lineLimit(2)
                    Text(TVNieuwsMeta.tekst(item)).font(AppFont.body(18)).foregroundStyle(.white.opacity(0.85))
                }
                .padding(24)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .clipped()
    }
}

struct NieuwsAfbeeldingTV: View {
    let item: NieuwsItem
    var body: some View {
        AsyncImage(url: item.afbeelding) { fase in
            if let img = fase.image { img.resizable().scaledToFill() }
            else { LinearGradient(colors: [item.kleur, item.kleur.opacity(0.6)], startPoint: .topLeading, endPoint: .bottomTrailing) }
        }
    }
}

enum TVNieuwsMeta {
    /// Same date format as the timeline in the app (dd/MM/yyyy).
    static func datum(_ d: Date) -> String {
        let f = DateFormatter()
        f.dateFormat = "dd/MM/yyyy"
        f.timeZone = TimeZone(identifier: "Europe/Amsterdam")
        return f.string(from: d)
    }

    static func tekst(_ item: NieuwsItem) -> String {
        switch item.soort {
        case .liveblog:
            return [Lf("%lld berichten", item.aantal ?? 0), NieuwsItem.wanneer(item.laatste), item.isAfgerond ? L("afgerond") : nil].compactMap { $0 }.joined(separator: " · ")
        case .weer, .politie, .regionaal:
            return [NieuwsItem.wanneer(item.at), item.plaats].compactMap { $0 }.joined(separator: " · ")
        }
    }
}

/// Reading an item on the TV: every block is focusable so the remote can scroll through it.
struct TVNieuwsDetail: View {
    let id: String
    @State private var detail: NieuwsDetail?

    var body: some View {
        ScrollView {
            if let weer = detail?.weer {
                // Weather: like the warning on knmi.nl, the map left and the text right.
                HStack(alignment: .top, spacing: 60) {
                    WeerKaart(weer: weer, hoogte: 760, interactief: false).frame(width: 760)
                    VStack(alignment: .leading, spacing: 22) {
                        blok { WeerTekst(weer: weer, schaal: 1.45) }
                        Text(L("Bron: KNMI.")).font(AppFont.body(18)).foregroundStyle(.secondary)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                .padding(.horizontal, 80).padding(.vertical, 40)
            } else if let d = detail {
                HStack(alignment: .top, spacing: 60) {
                    VStack(alignment: .leading, spacing: 24) {
                        Color.clear.frame(width: 640, height: 360).overlay { NieuwsAfbeeldingTV(item: d.item) }.clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
                        Text(d.item.label.uppercased()).font(AppFont.body(20, .bold)).foregroundStyle(d.item.kleur)
                        Text(d.item.titel).font(AppFont.heading(40)).fixedSize(horizontal: false, vertical: true)
                        Text(TVNieuwsMeta.tekst(d.item)).font(AppFont.body(22)).foregroundStyle(.secondary)
                        Text(d.item.soort == .regionaal ? L("Bron: 112 Nieuws Nederland (112nieuws.net), met toestemming. De foto is een stockfoto.") : d.item.soort == .politie ? L("Bron: politie.nl. De afbeelding is een stockfoto.") : d.item.soort == .weer ? L("Bron: KNMI.") : L("Berichten met het label A-Alerts zijn aangevuld door A-Alerts."))
                            .font(AppFont.body(18)).foregroundStyle(.secondary)
                    }
                    .frame(width: 640)
                    VStack(alignment: .leading, spacing: 22) {
                        if let intro = d.item.intro, !intro.isEmpty, d.item.soort != .liveblog {
                            blok { Text(intro).font(AppFont.body(28, .semibold)) }
                        }
                        ForEach(d.alineas, id: \.self) { a in
                            blok {
                                VStack(alignment: .leading, spacing: 8) {
                                    if let t = a.titel, !t.isEmpty { Text(t).font(AppFont.heading(28)) }
                                    Text(a.tekst).font(AppFont.body(26))
                                }
                            }
                        }
                        ForEach(d.tijdlijn) { b in
                            blok {
                                VStack(alignment: .leading, spacing: 8) {
                                    HStack(spacing: 12) {
                                        Text(TVNieuwsMeta.datum(b.at) + " · " + Fmt.time(b.at)).font(AppFont.body(20)).foregroundStyle(.secondary)
                                        Text(b.isEigen ? "A-Alerts" : d.item.bronNaam).font(AppFont.body(18, .bold))
                                            .foregroundStyle(b.isEigen ? Theme.red : d.item.kleur)
                                    }
                                    if let t = b.titel, !t.isEmpty { Text(t).font(AppFont.body(26, .bold)) }
                                    if !b.tekst.isEmpty { Text(b.tekst).font(AppFont.body(26)) }
                                    if let foto = b.foto {
                                        AsyncImage(url: foto) { img in img.resizable().scaledToFit() } placeholder: { Color.secondary.opacity(0.15) }
                                            .frame(maxHeight: 420).clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                                    }
                                }
                            }
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                .padding(.horizontal, 80).padding(.vertical, 40)
            } else {
                ProgressView().padding(.top, 200).frame(maxWidth: .infinity)
            }
        }
        .task(id: id) {
            detail = try? await P2000API.shared.nieuws(id: id)
            while !Task.isCancelled, detail?.item.isLive == true {
                try? await Task.sleep(for: .seconds(45))
                if let d = try? await P2000API.shared.nieuws(id: id) { detail = d }
            }
        }
    }

    /// Focusable block: the remote moves from block to block and the page scrolls along.
    private func blok<C: View>(@ViewBuilder _ inhoud: () -> C) -> some View {
        TVFocusBlok(inhoud: inhoud())
    }
}

private struct TVFocusBlok<C: View>: View {
    let inhoud: C
    @FocusState private var focus: Bool
    var body: some View {
        inhoud
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(24)
            .background(Color.white.opacity(focus ? 0.16 : 0.06), in: RoundedRectangle(cornerRadius: 20, style: .continuous))
            .scaleEffect(focus ? 1.01 : 1)
            .animation(.easeOut(duration: 0.15), value: focus)
            .focusable()
            .focused($focus)
    }
}

