import Foundation
import SwiftUI

// MARK: - Dienst (discipline)

enum Dienst: String, CaseIterable, Codable, Identifiable, Hashable {
    case brandweer, ambulance, politie, traumaheli, kustwacht, onbekend

    var id: String { rawValue }

    /// Maps the raw `dienst` value from the API (also handles lifeliner/mmt).
    init(raw: String?) {
        let value = (raw ?? "").lowercased()
        switch value {
        case "lifeliner", "mmt", "traumaheli": self = .traumaheli
        default: self = Dienst(rawValue: value) ?? .onbekend
        }
    }

    /// The disciplines a user can filter on (same as the website).
    static let selectable: [Dienst] = [.brandweer, .ambulance, .politie, .traumaheli]

    var label: String {
        switch self {
        case .brandweer: return L("Brandweer")
        case .ambulance: return L("Ambulance")
        case .politie: return L("Politie")
        case .traumaheli: return L("Traumaheli")
        case .kustwacht: return L("Kustwacht")
        case .onbekend: return L("Onbekend")
        }
    }

    /// The map pin artwork from p2000-apeldoorn.nl.
    var markerImage: String? {
        switch self {
        case .brandweer, .ambulance, .politie, .traumaheli: return "marker_\(rawValue)"
        default: return nil
        }
    }

    /// The list icon artwork from p2000-apeldoorn.nl.
    var iconImage: String? {
        switch self {
        case .brandweer, .ambulance, .politie, .traumaheli: return "icon_\(rawValue)"
        default: return nil
        }
    }

    var systemImage: String {
        switch self {
        case .brandweer: return "flame.fill"
        case .ambulance: return "cross.case.fill"
        case .politie: return "shield.lefthalf.filled"
        case .traumaheli: return "helicopter"
        case .kustwacht: return "water.waves"
        case .onbekend: return "questionmark.circle.fill"
        }
    }

    /// Readable on light and dark backgrounds (yellow becomes amber).
    var textColor: Color {
        switch self {
        case .ambulance: return Color(light: 0xB45309, dark: 0xFACC15)
        case .politie: return Color(light: 0x15428B, dark: 0x7FA7E8)
        default: return color
        }
    }

    var color: Color {
        switch self {
        case .brandweer: return Color(hex: 0xE30613)
        case .ambulance: return Color(hex: 0xF4C400)
        case .politie: return Color(hex: 0x15428B)
        case .traumaheli: return Color(hex: 0x9333EA)
        case .kustwacht: return Color(hex: 0x0891B2)
        case .onbekend: return Color(hex: 0x6B7280)
        }
    }
}

// MARK: - Melding

struct Eenheid: Codable, Hashable {
    var code: String?
    var naam: String?
    var type: String?
    var regio: String?
}

struct Voertuig: Codable, Hashable {
    var nra: String?
    var nrb: String?
    var label: String?
}

struct Weer: Codable, Hashable {
    var temp: Double?
    var description: String?
    var clouds: Double?
    var windSpeed: Double?
    var windDirection: Double?
}

struct Melding: Identifiable, Hashable, Codable {
    var recordID: String
    var guid: String
    var title: String
    var fullMelding: String?
    var dienstRaw: String?
    var prioriteit: String?
    var datum: Date
    var locatie: String?
    var lat: Double?
    var lon: Double?
    var link: String?
    var stad: String?
    var regio: String?
    var provincie: String?
    var capcode: String?
    var categorie: String?
    var grip: String?
    var opschaling: String?
    var eenheden: [Eenheid]
    var voertuigen: [Voertuig]
    var views: Int
    var weather: Weer?

    var id: String { guid }
    var dienst: Dienst { Dienst(raw: dienstRaw) }

    var hasCoordinate: Bool {
        guard let lat, let lon else { return false }
        return lat != 0 && lon != 0
    }

    /// "Prioriteit A1 - Ambulance spoedurgentie" like the website.
    var prioriteitText: String {
        let cat = (categorie?.isEmpty == false ? categorie : nil) ?? ""
        if let p = prioriteit, !p.isEmpty, p.lowercased() != "onbekend" {
            return cat.isEmpty ? Lf("Prioriteit %@", p) : Lf("Prioriteit %@ - %@", p, cat)
        }
        return cat
    }

    /// Less than 10 minutes old ("LIVE" badge).
    var isRecent: Bool { Date.now.timeIntervalSince(datum) < 10 * 60 }

    var isUrgent: Bool {
        guard let p = prioriteit?.uppercased() else { return false }
        return ["A0", "A1", "P1"].contains(p)
    }

    /// "Koedijk, Loenen" or just "Apeldoorn".
    var plaatsText: String {
        let parts = [locatie, stad?.capitalizedPlaats].compactMap { value -> String? in
            guard let v = value?.trimmingCharacters(in: .whitespaces), !v.isEmpty, v.lowercased() != "onbekend" else { return nil }
            return v
        }
        return parts.isEmpty ? "Apeldoorn" : parts.joined(separator: ", ")
    }

    var shareText: String {
        "\(title)\n\(plaatsText) · \(Fmt.dayTime(datum))\n\(prioriteitText)\n\nP2000 Apeldoorn – https://p2000-apeldoorn.nl"
    }

    enum CodingKeys: String, CodingKey {
        case recordID = "id", guid, title, fullMelding = "full_melding", dienstRaw = "dienst", prioriteit
        case datum = "datum_tijd", locatie, lat, lon, link, stad, regio, provincie, capcode, categorie, grip, opschaling
        case eenheden, voertuigen, views, weather
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        recordID = (try? c.decodeIfPresent(String.self, forKey: .recordID)) ?? UUID().uuidString
        guid = (try? c.decodeIfPresent(String.self, forKey: .guid)) ?? recordID
        title = (try? c.decodeIfPresent(String.self, forKey: .title)) ?? ""
        fullMelding = try? c.decodeIfPresent(String.self, forKey: .fullMelding)
        dienstRaw = try? c.decodeIfPresent(String.self, forKey: .dienstRaw)
        prioriteit = try? c.decodeIfPresent(String.self, forKey: .prioriteit)
        if let raw = try? c.decodeIfPresent(String.self, forKey: .datum), let d = Fmt.parseISO(raw) {
            datum = d
        } else if let d = try? c.decodeIfPresent(Date.self, forKey: .datum) {
            datum = d
        } else {
            datum = .distantPast
        }
        locatie = try? c.decodeIfPresent(String.self, forKey: .locatie)
        lat = c.flexibleDouble(.lat)
        lon = c.flexibleDouble(.lon)
        link = try? c.decodeIfPresent(String.self, forKey: .link)
        stad = try? c.decodeIfPresent(String.self, forKey: .stad)
        regio = try? c.decodeIfPresent(String.self, forKey: .regio)
        provincie = try? c.decodeIfPresent(String.self, forKey: .provincie)
        capcode = try? c.decodeIfPresent(String.self, forKey: .capcode)
        categorie = try? c.decodeIfPresent(String.self, forKey: .categorie)
        grip = c.flexibleString(.grip)
        opschaling = c.flexibleString(.opschaling)
        eenheden = (try? c.decodeIfPresent([Eenheid].self, forKey: .eenheden)) ?? []
        voertuigen = (try? c.decodeIfPresent([Voertuig].self, forKey: .voertuigen)) ?? []
        views = Int(c.flexibleDouble(.views) ?? 0)
        weather = try? c.decodeIfPresent(Weer.self, forKey: .weather)
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(recordID, forKey: .recordID)
        try c.encode(guid, forKey: .guid)
        try c.encode(title, forKey: .title)
        try c.encodeIfPresent(fullMelding, forKey: .fullMelding)
        try c.encodeIfPresent(dienstRaw, forKey: .dienstRaw)
        try c.encodeIfPresent(prioriteit, forKey: .prioriteit)
        try c.encode(Fmt.isoString(datum), forKey: .datum)
        try c.encodeIfPresent(locatie, forKey: .locatie)
        try c.encodeIfPresent(lat, forKey: .lat)
        try c.encodeIfPresent(lon, forKey: .lon)
        try c.encodeIfPresent(link, forKey: .link)
        try c.encodeIfPresent(stad, forKey: .stad)
        try c.encodeIfPresent(regio, forKey: .regio)
        try c.encodeIfPresent(provincie, forKey: .provincie)
        try c.encodeIfPresent(capcode, forKey: .capcode)
        try c.encodeIfPresent(categorie, forKey: .categorie)
        try c.encodeIfPresent(grip, forKey: .grip)
        try c.encodeIfPresent(opschaling, forKey: .opschaling)
        try c.encode(eenheden, forKey: .eenheden)
        try c.encode(voertuigen, forKey: .voertuigen)
        try c.encode(views, forKey: .views)
        try c.encodeIfPresent(weather, forKey: .weather)
    }
}

// MARK: - Statistics (today vs yesterday, computed in the app)

struct DayStats: Hashable {
    var day: Date
    var totaal = 0
    var perDienst: [Dienst: Int] = [:]
    var perPrioriteit: [String: Int] = [:]
    var perCategorie: [String: Int] = [:]
    /// Index 0…23 (local hour).
    var perUur: [Int] = Array(repeating: 0, count: 24)
    /// Alerts up to the same time of day (for a fair "so far" comparison with today).
    var totaalTotNu = 0

    init(day: Date, meldingen: [Melding], now: Date = .now) {
        let cal = Calendar.current
        self.day = cal.startOfDay(for: day)
        let nowSeconds = now.timeIntervalSince(cal.startOfDay(for: now))
        for m in meldingen where cal.isDate(m.datum, inSameDayAs: day) {
            totaal += 1
            perDienst[m.dienst, default: 0] += 1
            if let p = m.prioriteit, !p.isEmpty, p.lowercased() != "onbekend" { perPrioriteit[p.uppercased(), default: 0] += 1 }
            if let c = m.categorie, !c.isEmpty { perCategorie[c, default: 0] += 1 }
            perUur[cal.component(.hour, from: m.datum)] += 1
            if m.datum.timeIntervalSince(self.day) <= nowSeconds { totaalTotNu += 1 }
        }
    }
}

/// HTML text pages served by the API (privacy, terms, disclaimer).
struct ContentPage: Codable, Hashable {
    var title: String?
    var content: String?
    var version: String?
    var sourceName: String?
    var sourceURL: String?

    enum CodingKeys: String, CodingKey {
        case title, content, version, sourceName = "source_name", sourceURL = "source_url"
    }
}

struct ChangelogEntry: Codable, Hashable, Identifiable {
    var id: String
    var title: String?
    var content: String?
    var version: String?
    var releaseDate: String?

    enum CodingKeys: String, CodingKey {
        case id, title, content, version, releaseDate = "release_date"
    }
}

// MARK: - Decoding helpers

extension KeyedDecodingContainer {
    func flexibleDouble(_ key: Key) -> Double? {
        if let d = try? decodeIfPresent(Double.self, forKey: key) { return d }
        if let i = try? decodeIfPresent(Int.self, forKey: key) { return Double(i) }
        if let s = try? decodeIfPresent(String.self, forKey: key) { return Double(s.replacingOccurrences(of: ",", with: ".")) }
        return nil
    }

    func flexibleString(_ key: Key) -> String? {
        if let s = try? decodeIfPresent(String.self, forKey: key) { return s.isEmpty ? nil : s }
        if let d = try? decodeIfPresent(Double.self, forKey: key) { return String(Int(d)) }
        return nil
    }
}

extension String {
    /// "beemte broekland" → "Beemte Broekland".
    var capitalizedPlaats: String {
        split(separator: " ").map { $0.prefix(1).uppercased() + $0.dropFirst() }.joined(separator: " ")
    }

    /// Normalised for comparing places ("Beemte-broekland" == "Beemte broekland").
    var plaatsKey: String {
        lowercased().replacingOccurrences(of: "-", with: " ").trimmingCharacters(in: .whitespaces)
    }
}
