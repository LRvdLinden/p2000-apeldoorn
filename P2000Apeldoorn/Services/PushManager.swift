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

    static func number(_ v: Any?) -> Double? {
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

    static func waarschuwingID(from data: [AnyHashable: Any]) -> String? {
        (data["waarschuwing"] as? String).flatMap { $0.isEmpty ? nil : $0 }
    }

    static func guid(from data: [AnyHashable: Any]) -> String? {
        for key in ["guid", "meldingId", "melding_id"] {
            if let v = data[key] as? String, !v.isEmpty { return v }
        }
        return nil
    }
}

/// Shows notifications while the app is open and routes taps to the alert.
final class NotificationDelegate: NSObject, UNUserNotificationCenterDelegate {
    static let shared = NotificationDelegate()

    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification) async -> UNNotificationPresentationOptions {
        // While the app is open the in-app alarm plays its own sound (once per alert), instead of the system sound.
        let content = notification.request.content
        let urgent = content.interruptionLevel == .timeSensitive || content.interruptionLevel == .critical
        let guid = (content.userInfo["guid"] as? String) ?? (content.userInfo["waarschuwing"] as? String)
        let handled = await MainActor.run { InAppAlarm.shared.handlePush(guid: guid, urgent: urgent) }
        return handled ? [.banner, .list] : [.banner, .sound, .list]
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse) async {
        let content = response.notification.request.content
        let info = content.userInfo
        let action = response.actionIdentifier
        await MainActor.run {
            switch action {
            case PushManager.actionBewaar:
                if let guid = PushManager.guid(from: info) { PushManager.bewaar(guid: guid) }
            case PushManager.actionKaarten:
                if let lat = PushManager.number(info["lat"]), let lon = PushManager.number(info["lon"]) {
                    PushManager.openInKaarten(lat: lat, lon: lon, naam: content.title)
                } else if let id = PushManager.waarschuwingID(from: info) {
                    PushManager.openWaarschuwing?(id)
                } else if let guid = PushManager.guid(from: info) {
                    PushManager.openMelding?(guid)
                }
            default:
                if let id = PushManager.waarschuwingID(from: info) { PushManager.openWaarschuwing?(id) }
                else if let guid = PushManager.guid(from: info) { PushManager.openMelding?(guid) }
            }
        }
    }
}
