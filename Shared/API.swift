import Foundation

/// Read-only client for the public Base44 API behind p2000-apeldoorn.nl.
/// The website reads exactly the same endpoints, so app and site always show the same alerts.
struct P2000API: Sendable {
    static let shared = P2000API()

    private let session: URLSession = {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 20
        config.requestCachePolicy = .reloadIgnoringLocalCacheData
        config.httpAdditionalHeaders = ["Accept": "application/json", "X-App-Client": "P2000Apeldoorn-Apple"]
        return URLSession(configuration: config)
    }()

    enum APIError: LocalizedError {
        case badStatus(Int)
        var errorDescription: String? {
            switch self {
            case .badStatus(let code): return Lf("Server gaf foutcode %lld", code)
            }
        }
    }

    private func entityURL(_ entity: String, query: [String: Any]? = nil, sort: String? = nil, limit: Int? = nil) -> URL {
        var comps = URLComponents(url: Config.apiBase.appendingPathComponent("entities/\(entity)"), resolvingAgainstBaseURL: false)!
        var items: [URLQueryItem] = []
        if let query, let data = try? JSONSerialization.data(withJSONObject: query), let json = String(data: data, encoding: .utf8) {
            items.append(URLQueryItem(name: "q", value: json))
        }
        if let sort { items.append(URLQueryItem(name: "sort", value: sort)) }
        if let limit { items.append(URLQueryItem(name: "limit", value: String(limit))) }
        comps.queryItems = items.isEmpty ? nil : items
        return comps.url!
    }

    private func get<T: Decodable>(_ url: URL, as type: T.Type) async throws -> T {
        let (data, response) = try await session.data(from: url)
        if let http = response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
            throw APIError.badStatus(http.statusCode)
        }
        return try JSONDecoder().decode(T.self, from: data)
    }

    /// Latest alerts, newest first.
    func meldingen(limit: Int = 300) async throws -> [Melding] {
        try await get(entityURL("P2000Melding", sort: "-datum_tijd", limit: limit), as: [Melding].self)
    }

    func melding(guid: String) async throws -> Melding? {
        try await get(entityURL("P2000Melding", query: ["guid": guid], sort: "-datum_tijd", limit: 1), as: [Melding].self).first
    }

    func maandStatistiek(key: String) async throws -> MaandStatistiek? {
        try await get(entityURL("MaandStatistiek", query: ["maand_key": key], limit: 1), as: [MaandStatistiek].self).first
    }

    /// PrivacyVerklaring, TermsOfUse or DisclaimerContent.
    func contentPage(_ entity: String) async throws -> ContentPage? {
        try await get(entityURL(entity, sort: "-created_date", limit: 1), as: [ContentPage].self).first
    }

    func changelog() async throws -> [ChangelogEntry] {
        try await get(entityURL("Changelog", sort: "-release_date", limit: 50), as: [ChangelogEntry].self)
    }

    /// Same view counter the website uses ("1x", "4x" in the list). Best effort.
    func incrementViews(guid: String) async {
        var request = URLRequest(url: Config.apiBase.appendingPathComponent("functions/incrementViews"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try? JSONSerialization.data(withJSONObject: ["meldingId": guid])
        _ = try? await session.data(for: request)
    }

    static func monthKey(_ date: Date) -> String {
        let comps = Calendar(identifier: .gregorian).dateComponents(in: TimeZone(identifier: "Europe/Amsterdam")!, from: date)
        return String(format: "%04d-%02d", comps.year ?? 2026, comps.month ?? 1)
    }
}
