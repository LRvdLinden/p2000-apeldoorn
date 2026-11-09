import SwiftUI
import StoreKit
#if os(macOS)
import AppKit
#endif

struct RootView: View {
    @Environment(MeldingStore.self) private var store
    @Environment(AppSettings.self) private var settings
    @Environment(AppLock.self) private var lock
    @Environment(Router.self) private var router
    @Environment(LocationManager.self) private var location
    @Environment(AccountManager.self) private var account
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.requestReview) private var requestReview

    @State private var showSplash = true
    @State private var reviewTask: Task<Void, Never>?

    var body: some View {
        @Bindable var router = router
        ZStack {
            MainTabs()
                // Prestatiemodus: no animations (older devices).
                .transaction { if settings.prestatieModus { $0.disablesAnimations = true } }
                .task { await MeldingToestemming.shared.controleer() }
                .onChange(of: scenePhase) { _, p in if p == .active { Task { await MeldingToestemming.shared.controleer() } } }
                .sheet(item: $router.presented) { melding in
                    NavigationStack {
                        MeldingDetailView(melding: melding)
                            .toolbar {
                                ToolbarItem(placement: .cancellationAction) {
                                    Button(L("Sluit")) { router.presented = nil }
                                }
                            }
                    }
                    #if os(macOS)
                    .frame(minWidth: 520, minHeight: 640)
                    #endif
                }
                .sheet(item: $router.presentedWaarschuwing) { ref in
                    NavigationStack {
                        WaarschuwingDetailView(id: ref.id)
                            .toolbar {
                                ToolbarItem(placement: .cancellationAction) {
                                    Button(L("Sluit")) { router.presentedWaarschuwing = nil }
                                }
                            }
                    }
                    #if os(macOS)
                    .frame(minWidth: 520, minHeight: 640)
                    #endif
                }

            if !settings.onboardingDone && !showSplash {
                OnboardingView()
                    .transition(.opacity.combined(with: .scale(scale: 1.02)))
                    .zIndex(1)
            }

            if lock.isLocked && !showSplash {
                LockView()
                    .transition(.opacity)
                    .zIndex(2)
            }

            if showSplash {
                SplashView {
                    withAnimation(.easeInOut(duration: 0.45)) { showSplash = false }
                    scheduleReview()
                }
                .transition(.opacity)
                .zIndex(3)
            }
        }
        .task {
            store.onNew = { InAppAlarm.shared.handle($0) }
            store.startPolling()
            InstallPing.send()
        }
        .onChange(of: scenePhase) { _, phase in
            switch phase {
            case .active:
                store.startPolling()
                WaarschuwingStore.shared.startPolling()
                location.start()
                Task { await account.verifyCredential() }
                InstallPing.send()
                if lock.isLocked { Task { await lock.unlock() } }
                scheduleReview()
            case .background:
                reviewTask?.cancel()
                lock.lockIfNeeded()
                #if !os(macOS)
                store.stopPolling()
                WaarschuwingStore.shared.stopPolling()
                #endif
            default:
                reviewTask?.cancel()
            }
        }
        .onChange(of: account.isSignedIn) { _, _ in InstallPing.send() }
        .onChange(of: settings.notificationsEnabled) { _, _ in InstallPing.send() }
        .onChange(of: lock.isLocked) { _, locked in
            if locked { reviewTask?.cancel() } else { scheduleReview() }
        }
        .onChange(of: settings.onboardingDone) { _, done in
            if done { scheduleReview() }
        }
        #if DEBUG
        // Screenshots for the website and App Store (CI): skip the welcome screen.
        .onAppear {
            let args = ProcessInfo.processInfo.arguments
            guard args.contains("-AAlertsScreenshots") else { return }
            settings.onboardingDone = true
            #if os(macOS)
            // Fixed window at the top left of the screen, so CI can capture it.
            DispatchQueue.main.asyncAfter(deadline: .now() + 1) {
                for w in NSApp.windows where w.isVisible {
                    let top = (w.screen ?? NSScreen.main)?.visibleFrame.maxY ?? 900
                    w.setFrame(NSRect(x: 0, y: top - 900, width: 1440, height: 900), display: true)
                }
            }
            #endif
            func value(_ key: String) -> String? { args.firstIndex(of: key).flatMap { $0 + 1 < args.count ? args[$0 + 1] : nil } }
            if let tab = value("-AAlertsTab").flatMap(Router.Destination.init(rawValue:)) { router.tab = tab }
            Task { @MainActor in
                try? await Task.sleep(for: .seconds(4))
                if let guid = value("-AAlertsMelding") { router.open(guid: guid) }
                if let id = value("-AAlertsWaarschuwing") { router.openWaarschuwing(id: id) }
                if let id = value("-AAlertsNieuws") { router.openNieuws(id: id) }
                if let id = value("-AAlertsHeli") { router.volg(heli: id) }
            }
        }
        #endif
        .onOpenURL { url in
            if let doel = DeelLink(url: url) {
                switch doel {
                case .melding(let guid): router.open(guid: guid)
                case .waarschuwing(let id): router.openWaarschuwing(id: id)
                case .nieuws(let id): router.openNieuws(id: id)
                }
            } else if url.host == "nieuws", url.lastPathComponent.count > 3 {
                router.openNieuws(id: url.lastPathComponent)
            } else if url.host == "waarschuwing", url.lastPathComponent.count > 3 {
                router.openWaarschuwing(id: url.lastPathComponent)
            } else if let guid = AppGroup.guid(from: url) {
                router.open(guid: guid)
            } else if let host = url.host, let tab = Router.Destination(rawValue: host) {
                router.tab = tab
            }
        }
    }

    /// Review prompt only at a quiet moment: a few seconds after opening,
    /// never during the splash, the welcome screen or while locked.
    private func scheduleReview() {
        reviewTask?.cancel()
        reviewTask = Task { @MainActor in
            try? await Task.sleep(for: .seconds(ReviewManager.settleSeconds))
            guard !Task.isCancelled,
                  !showSplash,
                  settings.onboardingDone,
                  !lock.isLocked,
                  router.presented == nil,
                  ReviewManager.isDue() else { return }
            ReviewManager.markPrompted()
            requestReview()
        }
    }
}

struct MainTabs: View {
    @Environment(Router.self) private var router

    var body: some View {
        @Bindable var router = router
        TabView(selection: $router.tab) {
            Tab(L("Pager"), systemImage: "list.bullet.rectangle.portrait", value: Router.Destination.pager) {
                PagerView()
            }
            Tab(L("Kaart"), systemImage: "map", value: Router.Destination.kaart) {
                MapScreen()
            }
            Tab(L("Nieuws"), systemImage: "newspaper", value: Router.Destination.nieuws) {
                NieuwsView()
            }
            Tab(L("Statistieken"), systemImage: "chart.bar.xaxis", value: Router.Destination.statistieken) {
                StatsView()
            }
            Tab(L("Instellingen"), systemImage: "gearshape", value: Router.Destination.instellingen) {
                NavigationStack { SettingsView() }
            }
        }
        .tabViewStyle(.sidebarAdaptable)
    }
}

// MARK: - Lock

struct LockView: View {
    @Environment(AppLock.self) private var lock

    var body: some View {
        ZStack {
            LinearGradient(colors: [Theme.iconRed, Theme.redDeep], startPoint: .top, endPoint: .bottom)
                .ignoresSafeArea()
            VStack(spacing: 22) {
                AppMark(size: 96, showsTile: false)
                    .scaleEffect(1.4)
                Text(verbatim: "A-Alerts")
                    .font(AppFont.heading(28, relativeTo: .title))
                    .foregroundStyle(.white)
                Text(Lf("Vergrendeld – ontgrendel met %@", lock.biometryName))
                    .font(AppFont.body(16, .light, relativeTo: .callout))
                    .foregroundStyle(.white.opacity(0.85))
                Button {
                    Task { await lock.unlock() }
                } label: {
                    Label(L("Ontgrendel"), systemImage: "faceid")
                        .font(AppFont.heading(18, relativeTo: .headline))
                        .padding(.horizontal, 22).padding(.vertical, 12)
                        .background(.white, in: Capsule())
                        .foregroundStyle(Theme.iconRed)
                }
                .buttonStyle(.plain)
                .opacity(lock.isAuthenticating ? 0.5 : 1)
            }
        }
        .task { await lock.unlock() }
    }
}
