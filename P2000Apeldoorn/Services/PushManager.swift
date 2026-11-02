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

    static func start() {
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
        let guid = PushManager.guid(from: content.userInfo)
        let handled = await MainActor.run { InAppAlarm.shared.handlePush(guid: guid, urgent: urgent) }
        return handled ? [.banner, .list] : [.banner, .sound, .list]
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse) async {
        let info = response.notification.request.content.userInfo
        await MainActor.run {
            if let guid = PushManager.guid(from: info) { PushManager.openMelding?(guid) }
        }
    }
}
