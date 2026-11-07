import SwiftUI
import MapKit

@main
struct P2000ApeldoornWatchApp: App {
    @State private var store = MeldingStore.shared
    @State private var settings = AppSettings.shared

    init() { AppFont.register() }

    var body: some Scene {
        WindowGroup {
            WatchRootView()
                .environment(store)
                .environment(settings)
                .tint(Theme.red)
        }
    }
}

struct WatchRootView: View {
    @Environment(MeldingStore.self) private var store
    @Environment(\.scenePhase) private var scenePhase
    @State private var showSplash = true
    @State private var opened: Melding?
    @State private var pagina = 0

    var body: some View {
        ZStack {
            // One NavigationStack around the paged TabView (watchOS 10+ pattern). A NavigationStack inside each
            // page gives two navigation bars and crashes on launch on watchOS 26.
            NavigationStack {
                TabView(selection: $pagina) {
                    WatchListView().tag(0)
                    WatchStatsView().tag(1)
                }
                .tabViewStyle(.verticalPage)
            }

            if showSplash {
                SplashView { withAnimation { showSplash = false } }
                    .transition(.opacity)
            }
        }
        .sheet(item: $opened) { m in
            NavigationStack { WatchDetailView(melding: m) }
        }
        .onOpenURL { url in
            guard let guid = AppGroup.guid(from: url) else { return }
            Task { opened = await store.melding(guid: guid) }
        }
        .task {
            store.startPolling()
            InstallPing.send()
            #if DEBUG
            // Screenshots: -AAlertsTab statistieken, -AAlertsMelding <guid>.
            let args = ProcessInfo.processInfo.arguments
            func value(_ key: String) -> String? { args.firstIndex(of: key).flatMap { args.indices.contains($0 + 1) ? args[$0 + 1] : nil } }
            if value("-AAlertsTab") == "statistieken" { showSplash = false; pagina = 1 }
            if let guid = value("-AAlertsMelding") { showSplash = false; opened = await store.melding(guid: guid) }
            #endif
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { store.startPolling() } else if phase == .background { store.stopPolling() }
        }
    }
}

struct WatchListView: View {
    @Environment(MeldingStore.self) private var store
    @Environment(AppSettings.self) private var settings

    var body: some View {
        let list = Array(store.filtered(settings).prefix(60))
        List {
                if list.isEmpty {
                    Text(store.isLoading ? L("Meldingen laden...") : L("Geen meldingen"))
                        .foregroundStyle(.secondary)
                }
                ForEach(list) { m in
                    NavigationLink {
                        WatchDetailView(melding: m)
                    } label: {
                        WatchRow(melding: m)
                            .opacity(settings.isRead(m) ? 0.5 : 1)
                    }
                }
            }
            .navigationTitle(Text(verbatim: "A-Alerts"))
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    LiveDot(online: store.isOnline)
                }
            }
    }
}

struct WatchRow: View {
    let melding: Melding

    var body: some View {
        HStack(alignment: .top, spacing: 8) {
            DienstIcon(dienst: melding.dienst, size: 24)
            VStack(alignment: .leading, spacing: 2) {
                TimelineView(.periodic(from: .now, by: 60)) { ctx in
                    Text("\(Fmt.time(melding.datum)) · \(Fmt.agoShort(melding.datum, now: ctx.date))")
                        .font(AppFont.body(11, .regular, relativeTo: .caption2))
                        .foregroundStyle(.secondary)
                }
                Text(melding.title)
                    .font(AppFont.body(13, .semibold, relativeTo: .footnote))
                    .lineLimit(3)
                Text(melding.plaatsText)
                    .font(AppFont.body(11, .regular, relativeTo: .caption2))
                    .foregroundStyle(melding.dienst.textColor)
                    .lineLimit(1)
            }
        }
        .padding(.vertical, 2)
    }
}

struct WatchDetailView: View {
    let melding: Melding
    @Environment(AppSettings.self) private var settings

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    DienstIcon(dienst: melding.dienst, size: 30)
                    VStack(alignment: .leading) {
                        Text(melding.dienst.label).font(AppFont.heading(18, relativeTo: .headline))
                        PrioBadge(melding: melding)
                    }
                }
                Text(melding.title).font(AppFont.body(17, .semibold, relativeTo: .body))
                if !melding.prioriteitText.isEmpty {
                    Text(melding.prioriteitText).font(AppFont.body(13, .regular, relativeTo: .footnote)).foregroundStyle(melding.isUrgent ? Theme.red : .secondary)
                }
                Label(melding.plaatsText, systemImage: "mappin").font(AppFont.body(13, .regular, relativeTo: .footnote))
                Label(Fmt.dayTime(melding.datum), systemImage: "clock").font(AppFont.body(13, .regular, relativeTo: .footnote))
                if melding.hasCoordinate, let lat = melding.lat, let lon = melding.lon {
                    let coord = CLLocationCoordinate2D(latitude: lat, longitude: lon)
                    Map(initialPosition: .region(MKCoordinateRegion(center: coord, latitudinalMeters: 1500, longitudinalMeters: 1500))) {
                        Annotation("", coordinate: coord, anchor: .bottom) {
                            DienstMarker(dienst: melding.dienst, size: 30)
                        }
                    }
                    .frame(height: 120)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                }
                if !melding.eenheden.isEmpty {
                    Text(L("Eenheden")).font(AppFont.body(12, .bold, relativeTo: .caption)).padding(.top, 4)
                    ForEach(Array(melding.eenheden.enumerated()), id: \.offset) { _, e in
                        Text(e.naam ?? e.code ?? "").font(AppFont.body(11, .regular, relativeTo: .caption2))
                    }
                }
                Button {
                    settings.toggleBewaard(melding)
                } label: {
                    Label(settings.bewaard.contains(melding.guid) ? L("Bewaard") : L("Bewaar"),
                          systemImage: settings.bewaard.contains(melding.guid) ? "bookmark.fill" : "bookmark")
                }
                .padding(.top, 4)
            }
        }
        .navigationTitle(melding.dienst.label)
        .onAppear {
            MeldingStore.shared.registerView(melding)
            settings.markRead(melding)
        }
    }
}

struct WatchStatsView: View {
    @Environment(MeldingStore.self) private var store

    var body: some View {
        let today = store.vandaag
        let yesterday = store.statsGisteren
        ScrollView {
                VStack(spacing: 10) {
                    Text("\(today.totaal)")
                        .font(AppFont.heading(44))
                    Text(L("meldingen vandaag")).font(AppFont.body(13, .regular, relativeTo: .footnote)).foregroundStyle(.secondary)
                    Text(Lf("Gisteren: %lld (om deze tijd %lld)", yesterday.totaal, yesterday.totaalTotNu))
                        .font(AppFont.body(11, .regular, relativeTo: .caption2)).foregroundStyle(.secondary)
                    LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 8) {
                        ForEach(Dienst.selectable) { d in
                            VStack(spacing: 4) {
                                DienstIcon(dienst: d, size: 22)
                                Text("\(today.perDienst[d] ?? 0)").font(AppFont.heading(18, relativeTo: .headline).monospacedDigit())
                                Text(Lf("gisteren %lld", yesterday.perDienst[d] ?? 0)).font(AppFont.body(9, .regular)).foregroundStyle(.secondary)
                                Text(d.label).font(AppFont.body(10, .regular)).foregroundStyle(.secondary).lineLimit(1)
                            }
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 6)
                            .background(d.color.opacity(0.18), in: RoundedRectangle(cornerRadius: 10))
                        }
                    }
                }
            }
            .navigationTitle(L("Vandaag"))
    }
}
