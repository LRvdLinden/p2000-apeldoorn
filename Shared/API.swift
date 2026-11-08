import Foundation

/// Client for the app's own backend (Cloudflare Worker, worker/ in this repo). The app works standalone from the website:
/// alerts, statistics, view counts, texts and push registration all go through this API.
struct P2000API: Sendable {
    static let shared = P2000API()

    private let session: URLSession = {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 20
        config.requestCachePolicy = .reloadIgnoringLocalCacheData
        config.httpAdditionalHeaders = ["Accept": "application/json", "X-App-Client": "A-Alerts-Apple/\(Config.version)"]
        return URLSession(configuration: config)
    }()

    enum APIError: LocalizedError {
        case badStatus(Int)
        case server(Int, String)
        var errorDescription: String? {
            switch self {
            case .badStatus(let code): return Lf("Server gaf foutcode %lld", code)
            case .server(let code, let reason): return Lf("Server gaf foutcode %lld", code) + " (\(reason))"
            }
        }
    }

    private func url(_ path: String, query: [String: String] = [:]) -> URL {
        var comps = URLComponents(url: Config.apiBase.appendingPathComponent(path), resolvingAgainstBaseURL: false)!
        if !query.isEmpty { comps.queryItems = query.map { URLQueryItem(name: $0.key, value: $0.value) } }
        return comps.url!
    }

    private func get<T: Decodable>(_ url: URL, as type: T.Type) async throws -> T {
        let (data, response) = try await session.data(from: url)
        if let http = response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
            throw APIError.badStatus(http.statusCode)
        }
        return try JSONDecoder().decode(T.self, from: data)
    }

    /// GET a path under the API base and decode it (used by extensions in other files).
    func getJSON<T: Decodable>(_ path: String, as type: T.Type) async throws -> T {
        try await get(url(path), as: type)
    }

    func getJSON<T: Decodable>(_ path: String, query: [String: String], as type: T.Type) async throws -> T {
        try await get(url(path, query: query), as: type)
    }

    /// POST JSON to a path under the API base (used by extensions in other files).
    func postJSON(_ path: String, _ body: [String: Any]) async throws {
        try await send("POST", url(path), json: body)
    }

    @discardableResult
    private func send(_ method: String, _ url: URL, json: [String: Any]? = nil) async throws -> Data {
        var request = URLRequest(url: url)
        request.httpMethod = method
        if let json {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: json)
        }
        let (data, response) = try await session.data(for: request)
        if let http = response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
            // The worker answers errors with {"error": …} or, for pushes, {"reason": …}.
            if let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
               let reason = (obj["reason"] as? String) ?? (obj["error"] as? String), !reason.isEmpty {
                throw APIError.server(http.statusCode, reason)
            }
            throw APIError.badStatus(http.statusCode)
        }
        return data
    }

    // MARK: - Alerts

    /// Latest alerts, newest first.
    func meldingen(limit: Int = 300) async throws -> [Melding] {
        try await get(url("v1/meldingen", query: ["limit": String(limit)]), as: [Melding].self)
    }

    func melding(guid: String) async throws -> Melding? {
        try? await get(url("v1/meldingen/\(guid)"), as: Melding.self)
    }

    /// View counter ("1x", "4x" in the list). Best effort.
    func incrementViews(guid: String) async {
        _ = try? await send("POST", url("v1/meldingen/\(guid)/view"))
    }

    /// Weather at the time and place of an alert (WeatherKit via the API; used by the Apple TV app).
    /// Alerted stations with road route and estimated arrival.
    func routes(guid: String) async -> RoutesAntwoord? {
        try? await getJSON("v1/meldingen/\(guid)/routes", as: RoutesAntwoord.self)
    }

    func weather(guid: String) async -> AlertWeather? {
        try? await get(url("v1/meldingen/\(guid)/weather"), as: AlertWeather.self)
    }

    // MARK: - Texts

    /// "privacy", "terms" or "disclaimer".
    func contentPage(_ name: String) async throws -> ContentPage? {
        try await get(url("v1/content/\(name)"), as: ContentPage?.self)
    }

    func changelog() async throws -> [ChangelogEntry] {
        try await get(url("v1/changelog"), as: [ChangelogEntry].self)
    }

    // MARK: - Anonymous statistics (P2000Beheer)

    func recordInstall(_ body: [String: Any]) async throws {
        try await send("POST", url("v1/installs"), json: body)
    }

    // MARK: - Push devices

    func registerDevice(_ body: [String: Any]) async throws {
        try await send("POST", url("v1/devices"), json: body)
    }

    func unregisterDevice(token: String) async throws {
        try await send("DELETE", url("v1/devices/\(token)"))
    }

    func sendTestPush(token: String) async throws {
        try await send("POST", url("v1/devices/\(token)/test"))
    }
}

/// Hourly weather around an alert, as returned by GET /v1/meldingen/:guid/weather.
struct AlertWeather: Decodable, Hashable {
    var condition: String?
    var temperature: Double?
    var apparent: Double?
    var humidity: Double?
    var cloudCover: Double?
    var windSpeed: Double?
    var windGust: Double?
    var windDirection: Double?
    var precipitation: Double?
}
