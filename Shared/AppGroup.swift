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

/// Universal links from a-alerts.nl (share links): /melding/<guid>, /melding/<dienst>/<guid>,
/// /waarschuwing/<id>, /nieuws/<id> and /pager/?melding=… or ?waarschuwing=….
enum DeelLink: Equatable {
    case melding(String)
    case waarschuwing(String)
    case nieuws(String)

    init?(url: URL) {
        guard url.scheme == "https", let host = url.host, host.hasSuffix("a-alerts.nl") else { return nil }
        let delen = url.pathComponents.filter { $0 != "/" }
        let query = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
        if delen.first == "nieuws", delen.count >= 2, let id = delen.last, id.range(of: #"^[pwlr]-[0-9a-f]{12}$"#, options: .regularExpression) != nil {
            self = .nieuws(id); return
        }
        if let n = query.first(where: { $0.name == "nieuws" })?.value, !n.isEmpty, delen.first == "nieuws" { self = .nieuws(n); return }
        if delen.first == "melding", delen.count >= 2, let guid = delen.last { self = .melding(guid); return }
        if delen.first == "waarschuwing", delen.count >= 2 { self = .waarschuwing(delen.dropFirst().joined(separator: "/")); return }
        if let g = query.first(where: { $0.name == "melding" })?.value, !g.isEmpty { self = .melding(g); return }
        if let w = query.first(where: { $0.name == "waarschuwing" })?.value, !w.isEmpty { self = .waarschuwing(w); return }
        return nil
    }
}
