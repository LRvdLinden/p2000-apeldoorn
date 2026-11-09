import Foundation

/// A notification profile (phase 7): its own places, services, priorities, warnings and times.
/// Up to five per user, synced through iCloud as JSON. The first profile mirrors the older
/// single set of notification settings, so older app versions and the server keep working.
struct MeldingProfiel: Codable, Identifiable, Hashable {
    static let maximum = 5

    var id: String = UUID().uuidString
    var naam: String
    var actief: Bool = true
    var diensten: Set<String> = []
    var plaatsen: Set<String> = []
    var prioriteiten: Set<String> = []
    var nlalert: Bool = true
    var burgernet: Bool = false
    var knmi: Set<String> = ["orange", "red"]
    /// Always on, or only between `van` and `tot` (minutes after midnight) on `dagen` (1 = Monday … 7 = Sunday).
    var altijd: Bool = true
    var van: Int = 7 * 60
    var tot: Int = 23 * 60
    var dagen: Set<Int> = Set(1...7)

    init(naam: String) { self.naam = naam }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = (try? c.decode(String.self, forKey: .id)) ?? UUID().uuidString
        naam = (try? c.decode(String.self, forKey: .naam)) ?? L("Profiel")
        actief = (try? c.decode(Bool.self, forKey: .actief)) ?? true
        diensten = (try? c.decode(Set<String>.self, forKey: .diensten)) ?? []
        plaatsen = (try? c.decode(Set<String>.self, forKey: .plaatsen)) ?? []
        prioriteiten = (try? c.decode(Set<String>.self, forKey: .prioriteiten)) ?? []
        nlalert = (try? c.decode(Bool.self, forKey: .nlalert)) ?? true
        burgernet = (try? c.decode(Bool.self, forKey: .burgernet)) ?? false
        knmi = (try? c.decode(Set<String>.self, forKey: .knmi)) ?? ["orange", "red"]
        altijd = (try? c.decode(Bool.self, forKey: .altijd)) ?? true
        van = (try? c.decode(Int.self, forKey: .van)) ?? 7 * 60
        tot = (try? c.decode(Int.self, forKey: .tot)) ?? 23 * 60
        dagen = (try? c.decode(Set<Int>.self, forKey: .dagen)) ?? Set(1...7)
    }

    /// Monday = 1 … Sunday = 7.
    static func isoWeekday(_ date: Date) -> Int {
        let w = Calendar(identifier: .gregorian).component(.weekday, from: date) // 1 = Sunday
        return w == 1 ? 7 : w - 1
    }

    func geldt(op date: Date) -> Bool {
        guard actief else { return false }
        if altijd { return true }
        let c = Calendar.current.dateComponents([.hour, .minute], from: date)
        let now = (c.hour ?? 0) * 60 + (c.minute ?? 0)
        var dag = Self.isoWeekday(date)
        let inWindow: Bool
        if van == tot { inWindow = true }
        else if van < tot { inWindow = now >= van && now < tot }
        else {
            // Overnight (e.g. 23:00–07:00): the part after midnight belongs to the day it started.
            inWindow = now >= van || now < tot
            if now < tot { dag = dag == 1 ? 7 : dag - 1 }
        }
        return inWindow && dagen.contains(dag)
    }

    func matches(_ m: Melding) -> Bool {
        if !diensten.isEmpty, !diensten.contains(m.dienst.rawValue) { return false }
        if !Werkgebied.shared.matches(m, selected: plaatsen) { return false }
        if !prioriteiten.isEmpty, !prioriteiten.contains((m.prioriteit ?? "").uppercased()) { return false }
        return true
    }

    func wil(_ w: Waarschuwing) -> Bool {
        switch w.bron {
        case .nlalert: if !nlalert { return false }
        case .burgernet: if !burgernet { return false }
        case .knmi: if !knmi.contains(w.niveau ?? "") { return false }
        case .amber, .vermistkind: return true // one switch per device (Instellingen › Waarschuwingen)
        }
        return plaatsen.isEmpty || plaatsen.contains { w.covers(plaats: $0) }
    }

    var tijdSamenvatting: String {
        if altijd { return L("Altijd") }
        let f: (Int) -> String = { String(format: "%02d:%02d", $0 / 60, $0 % 60) }
        let dagenTekst = dagen.count == 7 ? L("elke dag") : dagen == Set(1...5) ? L("werkdagen") : dagen == [6, 7] ? L("weekend")
            : dagen.sorted().map { Self.dagKort($0) }.joined(separator: ", ")
        return "\(f(van))–\(f(tot)), \(dagenTekst)"
    }

    static func dagKort(_ d: Int) -> String {
        [L("ma"), L("di"), L("wo"), L("do"), L("vr"), L("za"), L("zo")][max(0, min(6, d - 1))]
    }

    var samenvatting: String {
        var parts: [String] = []
        parts.append(diensten.isEmpty ? L("Alle disciplines") : diensten.sorted().compactMap { Dienst(rawValue: $0)?.label }.joined(separator: ", "))
        parts.append(plaatsen.isEmpty ? L("alle plaatsen") : plaatsen.count == 1 ? plaatsen.first! : Lf("%lld plaatsen", plaatsen.count))
        if !prioriteiten.isEmpty { parts.append(prioriteiten.sorted().joined(separator: "/")) }
        return parts.joined(separator: " · ")
    }

    /// The server shape (see worker/src/profielen.js).
    var serverJSON: [String: Any] {
        [
            "id": id, "naam": naam, "actief": actief,
            "diensten": diensten.sorted(), "plaatsen": plaatsen.sorted(), "prioriteiten": prioriteiten.sorted(),
            "nlalert": nlalert, "burgernet": burgernet, "knmi": knmi.sorted(),
            "altijd": altijd, "van": van, "tot": tot, "dagen": dagen.sorted(),
        ]
    }
}
