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

    /// Debug builds use the APNs sandbox, TestFlight/App Store builds production.
    static var environment: String {
        #if DEBUG
        return "sandbox"
        #else
        return "production"
        #endif
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
                ] as [String: Any],
                // A-Alerts: up to five notification profiles (older servers ignore this).
                "profielen": s.profielen.prefix(MeldingProfiel.maximum).map(\.serverJSON),
            ]
            if s.radiusEnabled, let c = s.radiusCenter {
                settings["radius_km"] = s.radiusKm
                settings["lat"] = c.lat
                settings["lon"] = c.lon
            }
            let body: [String: Any] = [
                "token": token,
                "platform": platform,
                "environment": environment,
                "language": String(Config.uiLanguage.prefix(2)),
                "app_version": "\(Config.version) (\(Config.build))",
                "settings": settings,
            ]
            try? await P2000API.shared.registerDevice(body)
        }
    }

    /// "Stuur een testmelding" in Settings.
    static func sendTest() async -> Bool {
        guard let token else { return false }
        syncDevice(immediately: true)
        try? await Task.sleep(for: .seconds(1))
        return (try? await P2000API.shared.sendTestPush(token: token)) != nil
    }

    /// Set by the app; called with the warning id when an NL-Alert, Burgernet or KNMI notification is tapped.
    static var openWaarschuwing: ((String) -> Void)?

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
                    if let waarschuwing { PushManager.route(waarschuwing: waarschuwing) }
                    else if let guid { PushManager.route(melding: guid) }
                }
            }
            completionHandler()
        }
    }
}
