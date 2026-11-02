import Foundation
import UserNotifications
#if os(iOS) && canImport(OneSignalFramework)
import OneSignalFramework
#endif

/// Push notifications.
///
/// - iPhone/iPad: the existing OneSignal app of p2000-apeldoorn.nl (same App ID as the website).
///   Every device sends tags with its notification settings, so the backend can target
///   per place, discipline, priority and quiet hours (see README → Pushmeldingen).
/// - Mac: local notifications for new alerts while the app is running.
@MainActor
enum PushManager {
    /// Set by the app; called with the alert GUID when a notification is tapped.
    static var openMelding: ((String) -> Void)?

    #if os(iOS) && canImport(OneSignalFramework)
    private static let clickListener = ClickListener()
    #endif

    static func start(launchOptions: [AnyHashable: Any]? = nil) {
        #if os(iOS) && canImport(OneSignalFramework)
        OneSignal.initialize(Config.oneSignalAppID, withLaunchOptions: launchOptions)
        OneSignal.Notifications.addClickListener(clickListener)
        #endif
        let settings = AppSettings.shared
        settings.onNotificationSettingsChanged = { syncTags() }
        AccountManager.shared.onChange = { syncIdentity() }
        syncIdentity()
        syncTags()
    }

    /// Asks for permission and turns notifications on. Completion reports whether they were allowed.
    static func enable(_ completion: @escaping (Bool) -> Void) {
        #if os(iOS) && canImport(OneSignalFramework)
        OneSignal.Notifications.requestPermission({ accepted in
            Task { @MainActor in
                AppSettings.shared.notificationsEnabled = accepted
                if accepted { OneSignal.User.pushSubscription.optIn() }
                completion(accepted)
            }
        }, fallbackToSettings: true)
        #else
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { granted, _ in
            Task { @MainActor in
                AppSettings.shared.notificationsEnabled = granted
                completion(granted)
            }
        }
        #endif
    }

    static func disable() {
        AppSettings.shared.notificationsEnabled = false
        #if os(iOS) && canImport(OneSignalFramework)
        OneSignal.User.pushSubscription.optOut()
        #endif
    }

    static func syncIdentity() {
        #if os(iOS) && canImport(OneSignalFramework)
        let account = AccountManager.shared
        if let id = account.userID {
            OneSignal.login(id)
            if let email = account.email { OneSignal.User.addEmail(email) }
        } else {
            OneSignal.logout()
        }
        #endif
    }

    /// OneSignal tags describing this device's notification settings.
    static func tags(for s: AppSettings) -> [String: String] {
        func join(_ set: Set<String>) -> String { set.isEmpty ? "alle" : set.sorted().joined(separator: ",") }
        return [
            "app": "ios",
            "meldingen": s.notificationsEnabled ? "1" : "0",
            "plaatsen": join(Set(s.notifPlaatsen.map(\.plaatsKey))),
            "diensten": join(s.notifDiensten),
            "prioriteiten": join(s.notifPrioriteiten),
            "stil": s.quietMode ? "1" : "0",
            "stil_van": String(s.quietFrom),
            "stil_tot": String(s.quietTo),
            "kritiek": s.criticalAlerts ? "1" : "0",
            "taal": Config.uiLanguage,
        ]
    }

    static func syncTags() {
        #if os(iOS) && canImport(OneSignalFramework)
        let s = AppSettings.shared
        OneSignal.User.addTags(tags(for: s))
        if s.notificationsEnabled { OneSignal.User.pushSubscription.optIn() } else { OneSignal.User.pushSubscription.optOut() }
        #endif
    }

    // MARK: - Local notifications (Mac, and fallback)

    static func postLocal(for list: [Melding]) {
        let settings = AppSettings.shared
        let matching = list.filter { settings.matchesNotification($0) && Date.now.timeIntervalSince($0.datum) < 15 * 60 }.prefix(5)
        for m in matching {
            let content = UNMutableNotificationContent()
            content.title = "\(m.dienst.label) · \(m.plaatsText)"
            content.body = "\(m.title)\n\(m.prioriteitText)"
            content.sound = .default
            content.interruptionLevel = m.isUrgent ? .timeSensitive : .active
            content.threadIdentifier = m.dienst.rawValue
            content.userInfo = ["guid": m.guid]
            let request = UNNotificationRequest(identifier: m.guid, content: content, trigger: nil)
            UNUserNotificationCenter.current().add(request)
        }
    }

    static func guid(from data: [AnyHashable: Any]?, url: String? = nil) -> String? {
        for key in ["guid", "meldingId", "melding_id", "id"] {
            if let v = data?[key] as? String, !v.isEmpty { return v }
        }
        if let url, let last = URL(string: url)?.lastPathComponent, last.count > 20 { return last }
        return nil
    }
}

#if os(iOS) && canImport(OneSignalFramework)
private final class ClickListener: NSObject, OSNotificationClickListener {
    func onClick(event: OSNotificationClickEvent) {
        let data = event.notification.additionalData
        let url = event.notification.launchURL
        Task { @MainActor in
            if let guid = PushManager.guid(from: data, url: url) { PushManager.openMelding?(guid) }
        }
    }
}
#endif

/// Shows local notifications while the app is open and routes taps to the alert.
final class NotificationDelegate: NSObject, UNUserNotificationCenterDelegate {
    static let shared = NotificationDelegate()

    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification) async -> UNNotificationPresentationOptions {
        [.banner, .sound, .list]
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse) async {
        let info = response.notification.request.content.userInfo
        if let guid = info["guid"] as? String {
            await MainActor.run { PushManager.openMelding?(guid) }
        }
    }
}
