import Foundation

/// When to show Apple's review prompt (`requestReview`):
/// - first time: 4 hours after the first use on this device;
/// - after that: at most once a week;
/// - only at a quiet moment: a few seconds after opening, never during the splash,
///   the welcome screen or while the app is locked.
/// Dates are stored per device on purpose (not synced via iCloud).
enum ReviewManager {
    static let firstDelay: TimeInterval = 4 * 60 * 60
    static let repeatDelay: TimeInterval = 7 * 24 * 60 * 60
    /// Seconds after opening before the prompt may appear.
    static let settleSeconds: Double = 4

    private static let firstUseKey = "review.firstUse"
    private static let lastPromptKey = "review.lastPrompt"
    private static var defaults: UserDefaults { .standard }

    /// Call on every launch; remembers the first use on this device.
    static func registerLaunch(now: Date = .now) {
        if defaults.object(forKey: firstUseKey) == nil {
            defaults.set(now, forKey: firstUseKey)
        }
    }

    static func isDue(now: Date = .now) -> Bool {
        guard let firstUse = defaults.object(forKey: firstUseKey) as? Date else { return false }
        guard now.timeIntervalSince(firstUse) >= firstDelay else { return false }
        if let last = defaults.object(forKey: lastPromptKey) as? Date {
            return now.timeIntervalSince(last) >= repeatDelay
        }
        return true
    }

    static func markPrompted(now: Date = .now) {
        defaults.set(now, forKey: lastPromptKey)
    }
}
