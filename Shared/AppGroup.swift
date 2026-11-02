import Foundation

/// Shared storage between the app and its widgets (App Group).
enum AppGroup {
    static let id = "group.nl.lrvdlinden.p2000apeldoorn"

    /// Settings shared with the widgets; falls back to the app's own defaults when the group is missing.
    static let defaults: UserDefaults = UserDefaults(suiteName: id) ?? .standard

    static var containerURL: URL {
        FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: id)
            ?? FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
    }

    /// Last list of alerts written by the app, read by the widgets as a quick start.
    static var cacheURL: URL { containerURL.appendingPathComponent("meldingen.json") }

    static func readCache() -> [Melding] {
        guard let data = try? Data(contentsOf: cacheURL) else { return [] }
        return (try? JSONDecoder().decode([Melding].self, from: data)) ?? []
    }

    static func writeCache(_ list: [Melding]) {
        guard let data = try? JSONEncoder().encode(list) else { return }
        try? data.write(to: cacheURL, options: .atomic)
    }

    /// Deep link used by widgets and notifications: p2000apeldoorn://melding/<guid>
    static func link(for guid: String) -> URL {
        URL(string: "p2000apeldoorn://melding/\(guid)")!
    }

    static func guid(from url: URL) -> String? {
        guard url.scheme == "p2000apeldoorn", url.host == "melding" else { return nil }
        let guid = url.lastPathComponent
        return guid.isEmpty || guid == "/" ? nil : guid
    }
}
