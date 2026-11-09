import Foundation
import UserNotifications
#if canImport(UIKit)
import UIKit
#elseif canImport(AppKit)
import AppKit
#endif

/// Native Apple push notifications (APNs) via the app's own Cloudflare Worker (worker/ in this repo).
///
/// The device registers its APNs token together with its notification settings
/// (places, disciplines, priorities, quiet hours, critical alerts and radius). The server
/// matches every new alert against those settings and only pushes what fits.
@MainActor
enum PushManager {
    /// Set by the app; called with the alert GUID when a notification is tapped.
    static var openMelding: ((String) -> Void)?

    private static let tokenKey = "push.apnsToken"
    private static var syncTask: Task<Void, Never>?

    static var token: String? {
        get { AppGroup.defaults.string(forKey: tokenKey) }
        set { AppGroup.defaults.set(newValue, forKey: tokenKey) }
    }

    /// APNs environment of this install. Read from the provisioning profile: an app installed from Xcode is signed with
    /// "development" (sandbox tokens) even in a Release build; TestFlight and the App Store have no profile and use production.
    static let environment: String = {
        #if DEBUG
        return "sandbox"
        #else
        #if os(macOS)
        let url = Bundle.main.bundleURL.appendingPathComponent("Contents/embedded.provisionprofile")
        #else
        let url = Bundle.main.bundleURL.appendingPathComponent("embedded.mobileprovision")
        #endif
        guard let data = try? Data(contentsOf: url) else { return "production" }
        let text = String(decoding: data, as: UTF8.self)
        if let r = text.range(of: "aps-environment</key>") {
            let rest = text[r.upperBound...].prefix(80)
            if rest.contains("development") { return "sandbox" }
        }
        return "production"
        #endif
    }()

    /// Waits (max. a few seconds) for a fresh token from Apple, so a test never goes to an old one.
    private static var tokenWaiters: [CheckedContinuation<Void, Never>] = []
    static func freshToken(timeout: Double = 6) async -> String? {
        registerForRemote()
        await withCheckedContinuation { (c: CheckedContinuation<Void, Never>) in
            tokenWaiters.append(c)
            Task { try? await Task.sleep(for: .seconds(timeout)); resumeWaiters() }
        }
        return token
    }
    static func didFail() { resumeWaiters() }
    private static func resumeWaiters() {
        let w = tokenWaiters; tokenWaiters = []
        w.forEach { $0.resume() }
    }

    /// Short diagnosis for under the test button.
    static func diagnose() async -> String {
        let n = await UNUserNotificationCenter.current().notificationSettings()
        let toestemming: String = switch n.authorizationStatus {
            case .authorized: L("toegestaan")
            case .denied: L("geweigerd")
            case .provisional: L("stil (voorlopig)")
            case .ephemeral: L("tijdelijk")
            default: L("niet gevraagd")
        }
        let banner = n.alertSetting == .enabled ? L("aan") : L("uit")
        let t = token.map { String($0.prefix(6)) + "…" } ?? "–"
        return Lf("Toestel %@ · %@ · meldingen %@ · banners %@", t, environment, toestemming, banner)
    }

    static var platform: String {
        #if os(macOS)
        return "macos"
        #else
        return "ios"
        #endif
    }

    /// Buttons under a notification (A-Alerts, phase 9). The server sets the category; the push extension adds the map.
    static let actionBewaar = "BEWAAR"
    static let actionKaarten = "KAARTEN"

    static func registerCategories() {
        let bewaar = UNNotificationAction(identifier: actionBewaar, title: L("Bewaar"),
                                          options: [], icon: UNNotificationActionIcon(systemImageName: "bookmark"))
        let kaarten = UNNotificationAction(identifier: actionKaarten, title: L("Open in Apple Kaarten"),
                                           options: [.foreground], icon: UNNotificationActionIcon(systemImageName: "map"))
        let melding = UNNotificationCategory(identifier: "MELDING", actions: [bewaar, kaarten], intentIdentifiers: [],
                                             options: [.hiddenPreviewsShowTitle])
        let waarschuwing = UNNotificationCategory(identifier: "WAARSCHUWING", actions: [kaarten], intentIdentifiers: [],
                                                  options: [.hiddenPreviewsShowTitle])
        UNUserNotificationCenter.current().setNotificationCategories([melding, waarschuwing])
    }

    /// "Bewaar" from the notification, without opening the app.
    /// Opens the alert from a notification tap. Goes straight to the router (also on a cold start, before the
    /// app delegate has set the callbacks) and lands on the alert page.
    @MainActor static func route(melding guid: String) {
        if let open = openMelding { open(guid) } else { Router.shared.open(guid: guid) }
    }

    @MainActor static func route(waarschuwing id: String) {
        if let open = openWaarschuwing { open(id) } else { Router.shared.openWaarschuwing(id: id) }
    }

    static func bewaar(guid: String) {
        let s = AppSettings.shared
        if !s.bewaard.contains(guid) { s.bewaard.insert(guid) }
    }

    /// "Open in Apple Kaarten" from the notification.
    static func openInKaarten(lat: Double, lon: Double, naam: String) {
        var c = URLComponents(string: "https://maps.apple.com/")!
        c.queryItems = [URLQueryItem(name: "ll", value: "\(lat),\(lon)"), URLQueryItem(name: "q", value: naam)]
        guard let url = c.url else { return }
        #if os(iOS)
        UIApplication.shared.open(url)
        #elseif os(macOS)
        NSWorkspace.shared.open(url)
        #endif
    }

    nonisolated static func number(_ v: Any?) -> Double? {
        if let d = v as? Double { return d }
        if let n = v as? NSNumber { return n.doubleValue }
        if let s = v as? String { return Double(s) }
        return nil
    }

    static func start() {
        registerCategories()
        UNUserNotificationCenter.current().delegate = NotificationDelegate.shared
        AppSettings.shared.onNotificationSettingsChanged = { syncDevice() }
        if AppSettings.shared.notificationsEnabled { registerForRemote() }
    }

    /// Asks for permission and turns notifications on. Completion reports whether they were allowed.
    static func enable(_ completion: @escaping (Bool) -> Void) {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { granted, _ in
            Task { @MainActor in
                AppSettings.shared.notificationsEnabled = granted
                if granted { registerForRemote() }
                completion(granted)
            }
        }
    }

    static func disable() {
        AppSettings.shared.notificationsEnabled = false
        guard let token else { return }
        Task { try? await P2000API.shared.unregisterDevice(token: token) }
    }

    static func registerForRemote() {
        #if os(iOS)
        UIApplication.shared.registerForRemoteNotifications()
        #elseif os(macOS)
        NSApplication.shared.registerForRemoteNotifications()
        #endif
    }

    /// Called by the app delegate with the APNs device token.
    static func didRegister(deviceToken: Data) {
        token = deviceToken.map { String(format: "%02x", $0) }.joined()
        registrationError = nil
        resumeWaiters()
        syncDevice(immediately: true)
    }

    /// Sends this device's settings to the server (debounced, so moving sliders doesn't flood it).
    static func syncDevice(immediately: Bool = false) {
        syncTask?.cancel()
        syncTask = Task {
            if !immediately { try? await Task.sleep(for: .seconds(1.5)) }
            guard !Task.isCancelled, let token else { return }
            let s = AppSettings.shared
            if !s.notificationsEnabled {
                try? await P2000API.shared.unregisterDevice(token: token)
                return
            }
            try? await P2000API.shared.registerDevice(registrationBody(token: token, s: s))
        }
    }

    static func registrationBody(token: String, s: AppSettings) -> [String: Any] {
        var settings: [String: Any] = [
            "enabled": true,
            "plaatsen": Array(s.notifPlaatsen).sorted(),
            "diensten": Array(s.notifDiensten).sorted(),
            "prioriteiten": Array(s.notifPrioriteiten).sorted(),
            "quiet": s.quietMode,
            "quiet_from": s.quietFrom,
            "quiet_to": s.quietTo,
            "critical": s.criticalAlerts,
            // A-Alerts: NL-Alert, Burgernet and KNMI (older servers ignore this).
            "waarschuwingen": [
                "nlalert": s.pushNLAlert,
                "burgernet": s.pushBurgernet,
                "knmi": Array(s.pushKnmi).sorted(),
                "knmiVooraf": s.pushKnmiVooraf,
                "knmiOpgeheven": s.pushKnmiOpgeheven,
                // 2.0.1: missing children (the server only sends these to apps that pass them).
                "amber": s.pushAmber,
                "vermistkind": s.pushVermistKind,
                // Tab Nieuws (build 67): liveblog messages from A-Alerts and new police news.
                "nieuwsLiveblog": s.pushNieuwsLiveblog,
                "nieuwsPolitie": s.pushNieuwsPolitie,
                "nieuwsRegio": s.pushNieuwsRegio,
            ] as [String: Any],
            // Followed capcodes: push also outside places, radius and profiles.
            "capcodes": Array(s.volgCapcodes.keys).sorted(),
            // A-Alerts: up to five notification profiles (older servers ignore this).
            "profielen": s.profielen.prefix(MeldingProfiel.maximum).map(\.serverJSON),
        ]
        // Helicopter zones and large incidents (older servers ignore these).
        settings["heli"] = s.heliServerJSON
        settings["groot"] = s.grootServerJSON
        if s.radiusEnabled, let c = s.radiusCenter {
            settings["radius_km"] = s.radiusKm
            settings["lat"] = c.lat
            settings["lon"] = c.lon
        }
        return [
            "token": token,
            "platform": platform,
            "environment": environment,
            "language": String(Config.uiLanguage.prefix(2)),
            "app_version": "\(Config.version) (\(Config.build))",
            "install_id": InstallPing.installID,
            "settings": settings,
        ]
    }

    /// Last APNs registration error (shown with the test button).
    static var registrationError: String?

    /// "Stuur een testmelding" in Settings. Returns nil when the server sent it, otherwise what went wrong.
    static func sendTest() async -> String? {
        let status = await UNUserNotificationCenter.current().notificationSettings().authorizationStatus
        if status == .denied || status == .notDetermined {
            return L("Meldingen staan uit voor A-Alerts in de instellingen van je toestel.")
        }
        guard let token = await freshToken() else {
            if let e = registrationError { return Lf("Apple gaf geen pushtoken: %@", e) }
            return L("Dit toestel heeft nog geen pushtoken van Apple. Open de app opnieuw met internet en probeer het nog eens.")
        }
        let s = AppSettings.shared
        // Register right now (not debounced) and wait for it, so the server knows this device.
        syncTask?.cancel()
        do { try await P2000API.shared.registerDevice(registrationBody(token: token, s: s)) }
        catch { return Lf("Aanmelden bij de server mislukt: %@", error.localizedDescription) }
        do {
            try await P2000API.shared.sendTestPush(token: token)
            return nil
        } catch let P2000API.APIError.server(code, reason) {
            return Lf("Server: %@", "\(code) \(reason)")
        } catch {
            return error.localizedDescription
        }
    }

    /// Set by the app; called with the warning id when an NL-Alert, Burgernet or KNMI notification is tapped.
    static var openWaarschuwing: ((String) -> Void)?

    /// Set by the app; called with the news id when a liveblog or police news notification is tapped.
    static var openNieuws: ((String) -> Void)?

    nonisolated static func nieuwsID(from data: [AnyHashable: Any]) -> String? {
        (data["nieuws"] as? String).flatMap { $0.isEmpty ? nil : $0 }
    }

    @MainActor static func route(nieuws id: String) {
        if let open = openNieuws { open(id) } else { Router.shared.openNieuws(id: id) }
    }

    nonisolated static func waarschuwingID(from data: [AnyHashable: Any]) -> String? {
        (data["waarschuwing"] as? String).flatMap { $0.isEmpty ? nil : $0 }
    }

    nonisolated static func guid(from data: [AnyHashable: Any]) -> String? {
        for key in ["guid", "meldingId", "melding_id"] {
            if let v = data[key] as? String, !v.isEmpty { return v }
        }
        return nil
    }
}

/// Shows notifications while the app is open and routes taps to the alert.
final class NotificationDelegate: NSObject, UNUserNotificationCenterDelegate {
    static let shared = NotificationDelegate()

    // Completion-handler versions (not the async ones): the system calls these on a background queue, and the
    // async variants crashed on a tap when the app was started from the notification. Everything UI goes to main.
    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification,
                                withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        // While the app is open the in-app alarm plays its own sound (once per alert), instead of the system sound.
        let content = notification.request.content
        let urgent = content.interruptionLevel == .timeSensitive || content.interruptionLevel == .critical
        let guid = (content.userInfo["guid"] as? String) ?? (content.userInfo["waarschuwing"] as? String)
        DispatchQueue.main.async {
            let handled = MainActor.assumeIsolated { InAppAlarm.shared.handlePush(guid: guid, urgent: urgent) }
            completionHandler(handled ? [.banner, .list] : [.banner, .sound, .list])
        }
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse,
                                withCompletionHandler completionHandler: @escaping () -> Void) {
        let content = response.notification.request.content
        let info = content.userInfo
        let action = response.actionIdentifier
        let title = content.title
        // Only plain values cross to the main queue.
        let guid = PushManager.guid(from: info)
        let waarschuwing = PushManager.waarschuwingID(from: info)
        let nieuws = PushManager.nieuwsID(from: info)
        let lat = PushManager.number(info["lat"]), lon = PushManager.number(info["lon"])
        DispatchQueue.main.async {
            MainActor.assumeIsolated {
                switch action {
                case PushManager.actionBewaar:
                    if let guid { PushManager.bewaar(guid: guid) }
                case PushManager.actionKaarten:
                    if let lat, let lon { PushManager.openInKaarten(lat: lat, lon: lon, naam: title) }
                    else if let waarschuwing { PushManager.route(waarschuwing: waarschuwing) }
                    else if let guid { PushManager.route(melding: guid) }
                default:
                    if let nieuws { PushManager.route(nieuws: nieuws) }
                    else if let waarschuwing { PushManager.route(waarschuwing: waarschuwing) }
                    else if let guid { PushManager.route(melding: guid) }
                }
            }
            completionHandler()
        }
    }
}
