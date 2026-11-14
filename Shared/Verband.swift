import Foundation

/// A P2000 alert that may belong to the same incident as another one: same address or spot,
/// around the same time, or the same unit. Always shown as "mogelijk verband", never as fact.
struct MeldingVerband: Identifiable, Hashable {
    let melding: Melding
    let redenen: [String]
    let score: Int
    /// The server put both alerts in the same incident (not a guess of the app).
    var zeker = false
    var id: String { melding.guid }
}

enum Verband {
    /// Alerts within this window around the alert can be linked (longer for GRIP/scaled incidents).
    static let venster: TimeInterval = 45 * 60
    static let vensterGroot: TimeInterval = 120 * 60

    static func gekoppeld(aan m: Melding, in list: [Melding], max: Int = 6) -> [MeldingVerband] {
        let groot = m.grip != nil || m.opschaling != nil
        let window = groot ? vensterGroot : venster
        let eigenCodes = Set(m.eenheden.compactMap(\.code))
        var out: [MeldingVerband] = []

        for o in list where o.guid != m.guid {
            let dt = o.datum.timeIntervalSince(m.datum)
            // The server gives every alert its incident: the same incident is certain, a different one at most "possible".
            let zelfde: Bool? = (m.incident != nil && o.incident != nil) ? m.incident == o.incident : nil
            if zelfde == true {
                let min0 = Int((abs(dt) / 60).rounded())
                out.append(MeldingVerband(melding: o, redenen: [L("Zelfde inzet"), min0 == 0 ? L("Zelfde minuut") : dt < 0 ? Lf("%lld min eerder", min0) : Lf("%lld min later", min0)], score: 5, zeker: true))
                continue
            }
            guard abs(dt) <= window else { continue }
            // Planned patient transport (B1–B3) is never part of an incident.
            if isBesteld(o) || isBesteld(m) { continue }

            var redenen: [String] = []
            var score = 0
            let zelfdePlaats = o.plaatsNaam == m.plaatsNaam

            if m.hasStreet, o.hasStreet, zelfdePlaats, norm(m.locatie) == norm(o.locatie) {
                redenen.append(L("Zelfde adres")); score += 3
            } else if m.hasStreet, o.hasStreet, let a = m.lat, let b = m.lon, let c = o.lat, let d = o.lon, m.hasCoordinate, o.hasCoordinate {
                let km = Werkgebied.distanceKm(a, b, c, d)
                if km <= 0.35 {
                    redenen.append(Lf("Op %@ m afstand", Int((km * 1000 / 10).rounded() * 10).formatted()))
                    score += 2
                }
            }
            let gedeeld = eigenCodes.intersection(o.eenheden.compactMap(\.code))
            if !gedeeld.isEmpty {
                redenen.append(L("Zelfde eenheid opgeroepen")); score += 2
            }
            // Only the town, no street: weak, so only across services, close in time and outside the big town.
            if score == 0, zelfdePlaats, !m.hasStreet || !o.hasStreet, o.dienst != m.dienst,
               abs(dt) <= 15 * 60, m.plaatsNaam != "Apeldoorn" {
                redenen.append(Lf("Zelfde plaats (%@)", m.plaatsNaam)); score += 1
            }
            guard score > 0 else { continue }
            if o.dienst != m.dienst { score += 1 }
            if zelfde == false { score = Swift.min(score, 2) }
            let min = Int((abs(dt) / 60).rounded())
            redenen.append(min == 0 ? L("Zelfde minuut") : dt < 0 ? Lf("%lld min eerder", min) : Lf("%lld min later", min))
            out.append(MeldingVerband(melding: o, redenen: redenen, score: score))
        }
        return Array(out.sorted {
            $0.score != $1.score ? $0.score > $1.score : abs($0.melding.datum.timeIntervalSince(m.datum)) < abs($1.melding.datum.timeIntervalSince(m.datum))
        }.prefix(max))
    }

    private static func isBesteld(_ m: Melding) -> Bool {
        // Also restaffing a station or a test alarm: sent to the same units as the incident before it, but a call of its own.
        ["B1", "B2", "B3"].contains((m.prioriteit ?? "").uppercased())
            || m.title.range(of: "herbezet|kazerneren|proefalarm", options: [.regularExpression, .caseInsensitive]) != nil
    }

    private static func norm(_ s: String?) -> String {
        (s ?? "").lowercased().folding(options: .diacriticInsensitive, locale: nil)
            .replacingOccurrences(of: #"[^a-z0-9]"#, with: "", options: .regularExpression)
    }
}

extension Verband {
    /// The size of the incident as the alert gives it: 0 nothing, 1 klein, 2 middel, 3 groot, 4 zeer groot; GRIP counts above that.
    private static func niveau(_ m: Melding) -> (Int, String)? {
        if let g = m.grip.flatMap({ Int($0.filter(\.isNumber)) }), g > 0 { return (10 + g, "GRIP \(g)") }
        let o = (m.opschaling ?? "").lowercased()
        if o.contains("zeer groot") { return (4, m.dienst == .brandweer ? L("Zeer grote brand") : L("Zeer groot")) }
        if o.contains("groot") { return (3, m.dienst == .brandweer ? L("Grote brand") : L("Groot")) }
        if o.contains("middel") { return (2, m.dienst == .brandweer ? L("Middelbrand") : L("Middel")) }
        if o.contains("klein") { return (1, m.dienst == .brandweer ? L("Kleine brand") : L("Klein")) }
        return nil
    }

    /// "Middelbrand" when `naar` is a step up from `van` (the alert before it in the same timeline), else nil.
    static func opschaling(van: Melding, naar: Melding) -> String? {
        guard let n = niveau(naar) else { return nil }
        return n.0 > (niveau(van)?.0 ?? 0) ? n.1 : nil
    }
}
