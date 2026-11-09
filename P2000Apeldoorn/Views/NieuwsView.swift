import SwiftUI

/// Tab Nieuws: police news about our places, weather articles and liveblogs (newest first).
struct NieuwsView: View {
    @Environment(Router.self) private var router
    @State private var store = NieuwsStore.shared
    @State private var filter: NieuwsItem.Soort?
    @State private var pad: [String] = []
    @Environment(\.horizontalSizeClass) private var sizeClass

    private var zichtbaar: [NieuwsItem] { store.items.filter { filter == nil || $0.soort == filter } }

    var body: some View {
        NavigationStack(path: $pad) {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    chips
                    if store.loading && store.items.isEmpty {
                        ProgressView().frame(maxWidth: .infinity).padding(.top, 60)
                    } else if let fout = store.error, store.items.isEmpty {
                        ContentUnavailableView(L("Nieuws laden mislukt"), systemImage: "wifi.exclamationmark", description: Text(fout))
                    } else if zichtbaar.isEmpty {
                        ContentUnavailableView(L("Geen nieuws"), systemImage: "newspaper", description: Text(L("Er is nu geen nieuws in deze categorie.")))
                    } else if sizeClass == .regular {
                        LazyVGrid(columns: [GridItem(.adaptive(minimum: 330), spacing: 16)], spacing: 16) {
                            ForEach(zichtbaar) { item in NavigationLink(value: item.id) { NieuwsHeroCard(item: item, hoogte: 230) } .buttonStyle(.plain) }
                        }
                    } else {
                        ForEach(Array(zichtbaar.enumerated()), id: \.element.id) { i, item in
                            NavigationLink(value: item.id) {
                                if i == 0 { NieuwsHeroCard(item: item, hoogte: 230) } else { NieuwsRij(item: item) }
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    Text(L("Politieberichten: bron politie.nl. Afbeeldingen bij politieberichten zijn stockfoto's van Pixabay."))
                        .font(AppFont.body(11)).foregroundStyle(.secondary).frame(maxWidth: .infinity).multilineTextAlignment(.center).padding(.top, 6)
                }
                .padding()
                .frame(maxWidth: 1100)
                .frame(maxWidth: .infinity)
            }
            .background(Color.groupedBackground)
            .navigationTitle(L("Nieuws"))
            .navigationDestination(for: String.self) { id in NieuwsDetailView(id: id) }
            .refreshable { await store.load(force: true) }
            .task {
                await store.load()
                openUitRouter()
                // Refresh while the tab is open (liveblogs move up with each new message).
                while !Task.isCancelled {
                    try? await Task.sleep(for: .seconds(120))
                    await store.load(force: true)
                }
            }
            .onChange(of: router.nieuwsOpen) { _, _ in openUitRouter() }
        }
    }

    private func openUitRouter() {
        guard let id = router.nieuwsOpen else { return }
        router.nieuwsOpen = nil
        pad = [id]
    }

    private var chips: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                chip(L("Alles"), nil)
                chip(L("Liveblogs"), .liveblog)
                chip(L("Politie"), .politie)
                chip("112 Nieuws", .regionaal)
                chip(L("Weer"), .weer)
            }
        }
    }

    private func chip(_ titel: String, _ soort: NieuwsItem.Soort?) -> some View {
        let aan = filter == soort
        return Button { withAnimation(.snappy) { filter = soort } } label: {
            Text(titel).font(AppFont.body(14, .semibold))
                .padding(.horizontal, 14).padding(.vertical, 8)
                .foregroundStyle(aan ? Color.white : Color.primary)
                .background(aan ? Theme.red : Color.detailCard, in: Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(aan ? .isSelected : [])
    }
}

/// Small pill with icon on the image: "Liveblog · Burgernet".
struct NieuwsLabel: View {
    let item: NieuwsItem
    var body: some View {
        HStack(spacing: 6) {
            if let icoon = item.icoon { Image(icoon).resizable().scaledToFit().frame(width: 16, height: 16) }
            Text(item.label.uppercased()).font(AppFont.body(11, .bold)).lineLimit(1)
            if item.isLive {
                Circle().fill(Color.red).frame(width: 7, height: 7).accessibilityHidden(true)
            }
        }
        .foregroundStyle(Color.black)
        .padding(.horizontal, 9).padding(.vertical, 5)
        .background(.white, in: Capsule())
    }
}

/// The image of an item (A-Alerts image, own photo from the beheer); a colour block while loading.
struct NieuwsAfbeelding: View {
    let item: NieuwsItem
    var body: some View {
        AsyncImage(url: item.afbeelding) { fase in
            if let img = fase.image { img.resizable().scaledToFill() }
            else { LinearGradient(colors: [item.kleur, item.kleur.opacity(0.6)], startPoint: .topLeading, endPoint: .bottomTrailing) }
        }
        .accessibilityHidden(true)
    }
}

struct NieuwsHeroCard: View {
    let item: NieuwsItem
    var hoogte: CGFloat = 230
    var body: some View {
        // The photo is an overlay of a fixed-size frame: a wide photo (scaledToFill) can then never make the card wider than the screen.
        Color.clear
            .frame(maxWidth: .infinity).frame(height: hoogte)
            .overlay { NieuwsAfbeelding(item: item) }
            .overlay { LinearGradient(colors: [.clear, .black.opacity(0.85)], startPoint: .center, endPoint: .bottom) }
            .overlay(alignment: .bottomLeading) {
                VStack(alignment: .leading, spacing: 6) {
                    NieuwsLabel(item: item)
                    Text(item.titel).font(AppFont.heading(20)).foregroundStyle(.white).lineLimit(3).multilineTextAlignment(.leading)
                    Text(NieuwsMeta.tekst(item)).font(AppFont.body(12)).foregroundStyle(.white.opacity(0.85))
                }
                .padding(16)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
        .contentShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
        .accessibilityElement(children: .combine)
    }
}

struct NieuwsRij: View {
    let item: NieuwsItem
    var body: some View {
        HStack(spacing: 12) {
            Color.clear.frame(width: 104, height: 80)
                .overlay { NieuwsAfbeelding(item: item) }
                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            VStack(alignment: .leading, spacing: 4) {
                Text(item.label).font(AppFont.body(11, .bold)).foregroundStyle(item.kleur).lineLimit(1)
                Text(item.titel).font(AppFont.body(15, .semibold)).lineLimit(3).multilineTextAlignment(.leading).foregroundStyle(.primary)
                Text(NieuwsMeta.tekst(item)).font(AppFont.body(12)).foregroundStyle(.secondary)
            }
            Spacer(minLength: 0)
        }
        .padding(10)
        .background(Color.detailCard, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .accessibilityElement(children: .combine)
    }
}

enum NieuwsMeta {
    static func tekst(_ item: NieuwsItem) -> String {
        switch item.soort {
        case .liveblog:
            var delen = [Lf("%lld berichten", item.aantal ?? 0), "\(L("laatste")) \(NieuwsItem.wanneer(item.laatste))"]
            if item.isAfgerond { delen.append(L("afgerond")) }
            return delen.joined(separator: " · ")
        case .weer:
            return [NieuwsItem.wanneer(item.at), item.isAfgerond ? L("opgeheven") : nil].compactMap { $0 }.joined(separator: " · ")
        case .politie, .regionaal:
            return NieuwsItem.wanneer(item.at)
        }
    }
}

/// Article or liveblog: photo with title, the text (police / weather) or the timeline (newest on top).
struct NieuwsDetailView: View {
    let id: String
    @State private var detail: NieuwsDetail?
    @State private var fout: String?

    var body: some View {
        ScrollView {
            if let d = detail {
                VStack(alignment: .leading, spacing: 18) {
                    if let weer = d.weer {
                        // Weather: like the warning on knmi.nl.
                        WeerKaart(weer: weer).padding(.horizontal).padding(.top, 8)
                    } else {
                        kop(d.item)
                    }
                    VStack(alignment: .leading, spacing: 16) {
                        if let weer = d.weer {
                            WeerTekst(weer: weer)
                            Text(kopMeta(d.item)).font(AppFont.body(13)).foregroundStyle(.secondary)
                        }
                        if d.weer == nil, let intro = d.item.intro, !intro.isEmpty, d.item.soort != .liveblog {
                            Text(intro).font(AppFont.body(17, .semibold)).lineSpacing(4).fixedSize(horizontal: false, vertical: true).textSelection(.enabled)
                        }
                        ForEach(d.weer == nil ? d.alineas : [], id: \.self) { a in
                            VStack(alignment: .leading, spacing: 6) {
                                if let t = a.titel, !t.isEmpty { Text(t).font(AppFont.heading(18)) }
                                Text(a.tekst).font(AppFont.body(16)).lineSpacing(5).fixedSize(horizontal: false, vertical: true).textSelection(.enabled)
                            }
                        }
                        if d.item.soort == .regionaal, let url = d.item.bronUrl {
                            Link(destination: url) {
                                Label(L("Lees verder op 112nieuws.net"), systemImage: "arrow.up.right.square.fill")
                                    .font(AppFont.body(16, .bold)).frame(maxWidth: .infinity)
                                    .padding(.vertical, 13).foregroundStyle(.white).background(Theme.red, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                            }
                        }
                        if let w = d.item.waarschuwing, d.item.soort != .politie, d.item.soort != .regionaal {
                            NavigationLink { WaarschuwingDetailView(id: w) } label: {
                                Label(d.item.soort == .weer ? L("Bekijk de weerwaarschuwing") : L("Bekijk de melding"), systemImage: "exclamationmark.triangle.fill")
                                    .font(AppFont.body(15, .semibold)).frame(maxWidth: .infinity)
                                    .padding(.vertical, 12).foregroundStyle(.white).background(d.item.kleur, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                            }
                            .buttonStyle(.plain)
                        }
                        if !d.tijdlijn.isEmpty { tijdlijn(d) }
                        bron(d)
                    }
                    .padding(.horizontal)
                }
                .padding(.bottom, 30)
                .frame(maxWidth: 820)
                .frame(maxWidth: .infinity)
            } else if let fout {
                ContentUnavailableView(L("Bericht niet gevonden"), systemImage: "newspaper", description: Text(fout)).padding(.top, 80)
            } else {
                ProgressView().padding(.top, 120).frame(maxWidth: .infinity)
            }
        }
        .background(Color.groupedBackground)
        .navigationTitle(detail?.item.soort == .liveblog ? L("Liveblog") : L("Nieuws"))
        #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
        #endif
        .toolbar {
            if let link = detail?.item.link {
                ToolbarItem(placement: .primaryAction) { ShareLink(item: link, subject: Text(detail?.item.titel ?? "")) }
            }
        }
        .refreshable { await laad() }
        .task(id: id) {
            await laad()
            // A running liveblog refreshes by itself.
            while !Task.isCancelled, detail?.item.isLive == true {
                try? await Task.sleep(for: .seconds(45))
                await laad()
            }
        }
    }

    private func laad() async {
        do { detail = try await P2000API.shared.nieuws(id: id); fout = nil }
        catch { if detail == nil { fout = error.localizedDescription } }
    }

    private func kop(_ item: NieuwsItem) -> some View {
        Color.clear
            .frame(maxWidth: .infinity).frame(height: 260)
            .overlay { NieuwsAfbeelding(item: item) }
            .overlay { LinearGradient(colors: [.black.opacity(0.1), .black.opacity(0.85)], startPoint: .top, endPoint: .bottom) }
            .overlay(alignment: .bottomLeading) {
                VStack(alignment: .leading, spacing: 8) {
                    NieuwsLabel(item: item)
                    Text(item.titel).font(AppFont.heading(24)).foregroundStyle(.white).lineLimit(4).minimumScaleFactor(0.8)
                    Text(kopMeta(item)).font(AppFont.body(13)).foregroundStyle(.white.opacity(0.85))
                }
                .padding(18)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
        .padding(.horizontal)
        .padding(.top, 8)
        .accessibilityElement(children: .combine)
    }

    private func kopMeta(_ item: NieuwsItem) -> String {
        let f = item.at.formatted(.dateTime.day().month(.wide).year().hour().minute())
        switch item.soort {
        case .liveblog:
            let start = (item.start ?? item.at).formatted(.dateTime.day().month(.abbreviated).hour().minute())
            return [Lf("Gestart %@", start), item.isAfgerond ? L("afgerond") : L("loopt nog")].joined(separator: " · ")
        case .weer, .politie, .regionaal:
            return [f, item.plaats].compactMap { $0 }.joined(separator: " · ")
        }
    }

    private func tijdlijn(_ d: NieuwsDetail) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text(L("Tijdlijn")).font(AppFont.heading(18))
                Spacer()
                Text(L("nieuwste boven")).font(AppFont.body(12)).foregroundStyle(.secondary)
            }
            VStack(alignment: .leading, spacing: 0) {
                ForEach(Array(d.tijdlijn.enumerated()), id: \.element.id) { i, b in
                    HStack(alignment: .top, spacing: 12) {
                        VStack(spacing: 0) {
                            let kleur = b.isEigen ? Theme.red : d.item.kleur
                            Circle().fill(kleur).frame(width: 14, height: 14)
                                .overlay(Circle().stroke(kleur.opacity(0.25), lineWidth: 6)).padding(.top, 4)
                            if i < d.tijdlijn.count - 1 { Rectangle().fill(Color.secondary.opacity(0.25)).frame(width: 2).frame(maxHeight: .infinity) }
                        }
                        .frame(width: 20)
                        VStack(alignment: .leading, spacing: 6) {
                            HStack(spacing: 6) {
                                Text(WaarschuwingDetailView.burgernetDatum(b.at) + " · " + b.at.formatted(date: .omitted, time: .shortened))
                                    .font(AppFont.body(12)).foregroundStyle(.secondary)
                                Text(b.isEigen ? "A-Alerts" : bronNaam(b.door, item: d.item))
                                    .font(AppFont.body(11, .bold)).foregroundStyle(b.isEigen ? Theme.red : d.item.kleur)
                                    .padding(.horizontal, 7).padding(.vertical, 2)
                                    .background((b.isEigen ? Theme.red : d.item.kleur).opacity(0.12), in: Capsule())
                            }
                            if let t = b.titel, !t.isEmpty { Text(t).font(AppFont.body(15, .bold)) }
                            if !b.tekst.isEmpty {
                                Text(b.tekst).font(AppFont.body(15)).lineSpacing(4).fixedSize(horizontal: false, vertical: true).textSelection(.enabled)
                            }
                            if let foto = b.foto {
                                AsyncImage(url: foto) { img in img.resizable().scaledToFit() } placeholder: { Color.secondary.opacity(0.12).frame(height: 160) }
                                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                                    .frame(maxWidth: 520, alignment: .leading)
                            }
                            if let url = b.url {
                                Link(destination: url) {
                                    Label(url.host() ?? url.absoluteString, systemImage: "link").font(AppFont.body(14, .semibold))
                                }
                            }
                        }
                        .padding(12)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Color.detailCard, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                        .padding(.bottom, i < d.tijdlijn.count - 1 ? 12 : 0)
                    }
                    .accessibilityElement(children: .combine)
                }
            }
        }
    }

    private func bronNaam(_ door: String, item: NieuwsItem) -> String {
        switch door {
        case "burgernet": return "Burgernet"
        case "amber", "vermistkind": return L("Politie")
        default: return item.bronNaam
        }
    }

    @ViewBuilder private func bron(_ d: NieuwsDetail) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            if d.item.soort == .regionaal {
                Text(L("Bron: 112 Nieuws Nederland (112nieuws.net), met toestemming. De foto is een stockfoto van Pixabay.")).font(AppFont.body(12)).foregroundStyle(.secondary)
            } else if d.item.soort == .politie {
                Text(L("Bron: politie.nl. De afbeelding is een stockfoto van Pixabay.")).font(AppFont.body(12)).foregroundStyle(.secondary)
            } else if d.item.soort == .weer {
                Text(L("Bron: KNMI.")).font(AppFont.body(12)).foregroundStyle(.secondary)
            } else {
                Text(d.item.bron == "burgernet" ? L("Bron: Burgernet. Berichten met het label A-Alerts zijn aangevuld door A-Alerts.")
                     : L("Bron: Politie, via Burgernet. Berichten met het label A-Alerts zijn aangevuld door A-Alerts."))
                    .font(AppFont.body(12)).foregroundStyle(.secondary)
            }
            if let url = d.item.bronUrl, d.item.soort != .regionaal {
                Link(destination: url) {
                    Label(d.item.soort == .politie ? L("Lees op politie.nl") : L("Bekijk de bron"), systemImage: "arrow.up.right.square")
                        .font(AppFont.body(15, .semibold))
                }
            }
        }
        .padding(.top, 6)
    }
}
