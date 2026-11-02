import Foundation

/// Live feed from p2000.page (the same source the Railway service feeds into Base44).
/// It holds the latest ~50 messages for the whole country, so the app keeps only the
/// places in the municipality of Apeldoorn and merges them with the Base44 history.
///
/// The URL contains a personal key and lives in Secrets.xcconfig (not in git) → Info.plist `P2000PageAPIURL`.
struct LiveFeed: Sendable {
    static let shared = LiveFeed()

    static var url: URL? {
        guard let raw = Bundle.main.object(forInfoDictionaryKey: "P2000PageAPIURL") as? String,
              raw.hasPrefix("https://"), !raw.contains("$(") else { return nil }
        return URL(string: raw)
    }

    static var isConfigured: Bool { url != nil }

    private let session: URLSession = {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 15
        config.requestCachePolicy = .reloadIgnoringLocalCacheData
        return URLSession(configuration: config)
    }()

    private struct Raw: Decodable {
        var uid: String?
        var link: String?
        var timestamp: String?
        var melding: String?
        var plaats: String?
        var vr: String?
        var capcodes_json: String?
        var voertuigen_json: String?
        var locatie: String?
        var dienst: String?
        var prio: String?
        var regio: String?
        var latlong: String?
        var grip: String?
        var soortopschaling: String?
        var plaats_latlon: String?
    }

    private struct CapcodesWrapper: Decodable {
        struct Item: Decodable { var capcode: String?; var label: String? }
        var capcodes: [Item]?
    }

    private struct VoertuigWrapper: Decodable { var voertuig: [Voertuig]? }

    /// Alerts in the municipality of Apeldoorn from the live feed.
    func apeldoorn() async throws -> [Melding] {
        guard let url = Self.url else { return [] }
        let (data, response) = try await session.data(from: url)
        if let http = response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
            throw P2000API.APIError.badStatus(http.statusCode)
        }
        let raw = try JSONDecoder().decode([Raw].self, from: data)
        let places = Set(Config.plaatsen.map(\.plaatsKey))
        return raw.compactMap { r in
            guard let plaats = r.plaats, places.contains(plaats.plaatsKey) else { return nil }
            return Self.melding(from: r)
        }
    }

    private static func melding(from r: Raw) -> Melding? {
        guard let uid = r.uid, let text = r.melding, !text.isEmpty else { return nil }
        let date = Double(r.timestamp ?? "").map { Date(timeIntervalSince1970: $0) } ?? .now
        let dienst = (r.dienst ?? "").lowercased()
        let prio = prioriteit(in: text)
        let coord = parse(r.latlong) ?? parse(r.plaats_latlon)

        var eenheden: [Eenheid] = []
        if let json = r.capcodes_json?.data(using: .utf8),
           let wrapper = try? JSONDecoder().decode(CapcodesWrapper.self, from: json) {
            eenheden = (wrapper.capcodes ?? []).compactMap { item in
                guard let code = item.capcode else { return nil }
                let parts = (item.label ?? "").components(separatedBy: " / ")
                if parts.first?.lowercased().hasPrefix("monitorcode") == true || parts.first?.lowercased().hasPrefix("lichtkrant") == true {
                    return nil
                }
                return Eenheid(code: code, naam: parts.first, type: parts.count > 1 ? parts[1] : nil, regio: parts.count > 2 ? parts[2] : nil)
            }
        }
        var voertuigen: [Voertuig] = []
        if let json = r.voertuigen_json?.data(using: .utf8),
           let wrapper = try? JSONDecoder().decode(VoertuigWrapper.self, from: json) {
            voertuigen = wrapper.voertuig ?? []
        }

        // Title like the website: the message without the leading priority.
        var title = text
        if prio != nil, let range = text.range(of: #"^\s*(?:Prio\s*\d|P\s?\d|[AB]\d)\s*"#, options: [.regularExpression, .caseInsensitive]) {
            title = String(text[range.upperBound...])
        }

        let json: [String: Any?] = [
            "id": "live-\(uid)",
            "guid": uid,
            "title": title.trimmingCharacters(in: .whitespaces),
            "full_melding": text,
            "dienst": dienst == "test" ? "onbekend" : dienst,
            "prioriteit": prio,
            "datum_tijd": Fmt.isoString(date),
            "locatie": (r.locatie?.isEmpty == false) ? r.locatie : nil,
            "lat": coord?.0,
            "lon": coord?.1,
            "link": r.link,
            "stad": r.plaats,
            "regio": r.vr ?? r.regio,
            "capcode": eenheden.first?.code,
            "categorie": categorie(dienst: dienst, prio: prio, text: text),
            "grip": (r.grip == "0" ? nil : r.grip),
            "opschaling": (r.soortopschaling?.isEmpty == false) ? r.soortopschaling : nil,
            "eenheden": eenheden.map { ["code": $0.code, "naam": $0.naam, "type": $0.type, "regio": $0.regio].compactMapValues { $0 } },
            "voertuigen": voertuigen.map { ["nra": $0.nra, "nrb": $0.nrb, "label": $0.label].compactMapValues { $0 } },
            "views": 0,
        ]
        let cleaned = json.compactMapValues { $0 }
        guard let data = try? JSONSerialization.data(withJSONObject: cleaned) else { return nil }
        return try? JSONDecoder().decode(Melding.self, from: data)
    }

    private static func parse(_ s: String?) -> (Double, Double)? {
        guard let s, !s.isEmpty else { return nil }
        let parts = s.split(separator: ",").compactMap { Double($0.trimmingCharacters(in: .whitespaces)) }
        guard parts.count == 2, parts[0] != 0 else { return nil }
        return (parts[0], parts[1])
    }

    /// "A1 Ambu …" → A1, "P 1 BAD-02 …" → P1, "Prio 3 …" → P3.
    static func prioriteit(in text: String) -> String? {
        let ns = text as NSString
        let patterns = [#"^\s*([AB][0-3])\b"#, #"^\s*P\s?([1-3])\b"#, #"^\s*Prio\s*([1-5])\b"#]
        for (index, pattern) in patterns.enumerated() {
            guard let regex = try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive]),
                  let match = regex.firstMatch(in: text, range: NSRange(location: 0, length: ns.length)) else { continue }
            let value = ns.substring(with: match.range(at: 1)).uppercased()
            return index == 0 ? value : "P\(value)"
        }
        return nil
    }

    /// Basic category until Base44 delivers its own.
    private static func categorie(dienst: String, prio: String?, text: String) -> String? {
        guard dienst == "ambulance" else { return nil }
        switch prio {
        case "A0", "A1": return text.contains("DIA") ? "Directe inzet ambulance" : "Ambulance spoedurgentie"
        case "A2": return text.contains("DIA") ? "Directe inzet ambulance" : "Ambulance met gepaste spoed"
        case "B1", "B2", "B3": return "Besteld vervoer"
        default: return nil
        }
    }
}
