import SwiftUI
import UserNotifications

@main
struct P2000ApeldoornApp: App {
    #if os(iOS)
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    #elseif os(macOS)
    @NSApplicationDelegateAdaptor(MacAppDelegate.self) private var appDelegate
    #endif

    @State private var store = MeldingStore.shared
    @State private var settings = AppSettings.shared
    @State private var account = AccountManager.shared
    @State private var lock = AppLock.shared
    @State private var location = LocationManager.shared
    @State private var router = Router.shared

    init() {
        AppFont.register()
        AppFont.applyAppearance()
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(store)
                .environment(settings)
                .environment(account)
                .environment(lock)
                .environment(location)
                .environment(router)
                .environment(WaarschuwingStore.shared)
                .preferredColorScheme(colorScheme)
                .tint(Theme.red)
        }
        #if os(macOS)
        .defaultSize(width: 1180, height: 780)
        .commands {
            CommandGroup(after: .toolbar) {
                Button(L("Vernieuwen")) { Task { await MeldingStore.shared.refresh() } }
                    .keyboardShortcut("r")
            }
        }
        #endif

        #if os(macOS)
        Settings {
            NavigationStack { SettingsView() }
                .environment(store)
                .environment(settings)
                .environment(account)
                .environment(lock)
                .environment(location)
                .environment(router)
                .environment(WaarschuwingStore.shared)
                .frame(width: 520, height: 640)
                .preferredColorScheme(colorScheme)
                .tint(Theme.red)
        }
        #endif
    }

    private var colorScheme: ColorScheme? {
        switch settings.appearance {
        case "licht": return .light
        case "donker": return .dark
        default: return nil
        }
    }
}

/// App-wide navigation state (tabs and alerts opened from notifications).
@MainActor
@Observable
final class Router {
    static let shared = Router()

    enum Destination: String, Hashable, CaseIterable {
        case pager, kaart, statistieken, instellingen
    }

    var tab: Destination = .pager
    /// Alert opened from a push notification or the map.
    var presented: Melding?
    /// NL-Alert, Burgernet or KNMI warning opened from a push notification or a link.
    var presentedWaarschuwing: WaarschuwingRef?
    /// Helicopter to follow on the map ("Volg Lifeliner 3 op de kaart" on an alert).
    var volgHeli: String?

    func volg(heli id: String) {
        presented = nil
        volgHeli = id
        tab = .kaart
    }

    func openWaarschuwing(id: String) {
        tab = .pager
        presentedWaarschuwing = WaarschuwingRef(id: id)
    }

    func open(guid: String) {
        Task {
            if let m = await MeldingStore.shared.melding(guid: guid) {
                tab = .pager
                presented = m
            }
        }
    }
}

#if os(iOS)
final class AppDelegate: NSObject, UIApplicationDelegate {
    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        MainActor.assumeIsolated {
            PushManager.openMelding = { Router.shared.open(guid: $0) }
            PushManager.openWaarschuwing = { Router.shared.openWaarschuwing(id: $0) }
            PushManager.start()
            ReviewManager.registerLaunch()
        }
        return true
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        MainActor.assumeIsolated { PushManager.didRegister(deviceToken: deviceToken) }
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        print("APNs registration failed:", error.localizedDescription)
        let text = error.localizedDescription
        MainActor.assumeIsolated { PushManager.registrationError = text }
    }
}
#elseif os(macOS)
final class MacAppDelegate: NSObject, NSApplicationDelegate {
    func applicationDidFinishLaunching(_ notification: Notification) {
        MainActor.assumeIsolated {
            PushManager.openMelding = { Router.shared.open(guid: $0) }
            PushManager.openWaarschuwing = { Router.shared.openWaarschuwing(id: $0) }
            PushManager.start()
            ReviewManager.registerLaunch()
        }
    }

    func application(_ application: NSApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        MainActor.assumeIsolated { PushManager.didRegister(deviceToken: deviceToken) }
    }

    func application(_ application: NSApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        print("APNs registration failed:", error.localizedDescription)
        let text = error.localizedDescription
        MainActor.assumeIsolated { PushManager.registrationError = text }
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { false }
}
#endif

/// Identifiable wrapper so a warning id can drive a sheet.
struct WaarschuwingRef: Identifiable, Hashable {
    let id: String
}
