import SwiftUI
import StoreKit

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
            store.startPolling()
            await store.refreshStats()
        }
        .onChange(of: scenePhase) { _, phase in
            switch phase {
            case .active:
                store.startPolling()
                location.start()
                Task {
                    await store.refreshStats()
                    await account.verifyCredential()
                }
                if lock.isLocked { Task { await lock.unlock() } }
                scheduleReview()
            case .background:
                reviewTask?.cancel()
                lock.lockIfNeeded()
                #if !os(macOS)
                store.stopPolling()
                #endif
            default:
                reviewTask?.cancel()
            }
        }
        .onChange(of: lock.isLocked) { _, locked in
            if locked { reviewTask?.cancel() } else { scheduleReview() }
        }
        .onChange(of: settings.onboardingDone) { _, done in
            if done { scheduleReview() }
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
                Text("P2000 Apeldoorn")
                    .font(.title.weight(.black))
                    .foregroundStyle(.white)
                Text(Lf("Vergrendeld – ontgrendel met %@", lock.biometryName))
                    .font(.callout)
                    .foregroundStyle(.white.opacity(0.85))
                Button {
                    Task { await lock.unlock() }
                } label: {
                    Label(L("Ontgrendel"), systemImage: "faceid")
                        .font(.headline)
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
