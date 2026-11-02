import Foundation
#if canImport(UIKit)
import UIKit
#endif

/// Anonymous usage ping for the P2000Beheer statistics: a random install ID, platform, model, versions,
/// whether "Inloggen met Apple" is used and whether push notifications are on. No name, e-mail or location.
@MainActor
enum InstallPing {
    private static let defaults = UserDefaults.standard
    private static let idKey = "install.id", lastKey = "install.lastPing", stateKey = "install.lastState"

    static var installID: String {
        if let id = defaults.string(forKey: idKey) { return id }
        let id = UUID().uuidString.lowercased()
        defaults.set(id, forKey: idKey)
        return id
    }

    private static var platform: String {
        #if os(watchOS)
        return "watchos"
        #elseif os(macOS)
        return "macos"
        #elseif os(tvOS)
        return "tvos"
        #else
        return UIDevice.current.userInterfaceIdiom == .pad ? "ipados" : "ios"
        #endif
    }

    private static var model: String {
        var info = utsname()
        uname(&info)
        let machine = withUnsafeBytes(of: &info.machine) { raw in
            String(decoding: raw.prefix { $0 != 0 }, as: UTF8.self)
        }
        #if os(macOS)
        var size = 0
        sysctlbyname("hw.model", nil, &size, nil, 0)
        if size > 0 {
            var buffer = [CChar](repeating: 0, count: size)
            sysctlbyname("hw.model", &buffer, &size, nil, 0)
            return String(cString: buffer)
        }
        #endif
        return machine
    }

    private static var appleLogin: Bool {
        let key = "account.appleUserID"
        return NSUbiquitousKeyValueStore.default.string(forKey: key) != nil || defaults.string(forKey: key) != nil
    }

    /// Sends at most once every 6 hours, or right away when login/push changed.
    static func send(force: Bool = false) {
        let push = AppSettings.shared.notificationsEnabled
        let login = appleLogin
        let state = "\(Config.version)|\(Config.build)|\(login)|\(push)"
        let last = defaults.double(forKey: lastKey)
        let changed = defaults.string(forKey: stateKey) != state
        guard force || changed || Date().timeIntervalSince1970 - last > 6 * 3600 else { return }
        let v = ProcessInfo.processInfo.operatingSystemVersion
        let body: [String: Any] = [
            "id": installID,
            "platform": platform,
            "model": model,
            "os": "\(v.majorVersion).\(v.minorVersion)",
            "app_version": Config.version,
            "build": Config.build,
            "apple_login": login,
            "push": push,
            "language": String(Config.uiLanguage.prefix(2)),
        ]
        Task {
            if (try? await P2000API.shared.recordInstall(body)) != nil {
                defaults.set(Date().timeIntervalSince1970, forKey: lastKey)
                defaults.set(state, forKey: stateKey)
            }
        }
    }
}
