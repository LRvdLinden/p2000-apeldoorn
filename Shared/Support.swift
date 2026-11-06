import Foundation
import SwiftUI
#if canImport(UIKit)
import UIKit
#elseif canImport(AppKit)
import AppKit
#endif

// MARK: - Localisation

/// Looks up a string in Localizable.xcstrings (Dutch is the source language).
func L(_ key: String) -> String {
    String(localized: String.LocalizationValue(key))
}

/// Localised format string, e.g. `Lf("%lld min geleden", 5)`.
func Lf(_ key: String, _ args: CVarArg...) -> String {
    String(format: L(key), locale: Locale.current, arguments: args)
}

enum Config {
    /// Own backend (Cloudflare Worker, worker/ in this repo). The app does not use the website.
    static let apiBase: URL = {
        if let raw = Bundle.main.object(forInfoDictionaryKey: "P2000APIURL") as? String,
           raw.hasPrefix("http"), !raw.contains("$("), let url = URL(string: raw) {
            return url
        }
        return URL(string: "https://p2000-apeldoorn-api.lrvdlinden.workers.dev")!
    }()
    static let website = URL(string: "https://a-alerts.nl")!
    static let whatsapp = URL(string: "https://chat.whatsapp.com/IgZ5zvVTD25Getrk91nIMf")!
    static let pixelForges = URL(string: "https://pixelforges.nl")!
    static let source = URL(string: "https://p2000.page")!
    /// Fill in once the app has an App Store ID; until then "Schrijf een recensie" uses the in-app prompt.
    static let appStoreID = ""

    /// Language the UI is shown in (only languages the app ships).
    static var uiLanguage: String { Bundle.main.preferredLocalizations.first ?? "nl" }

    static var version: String { Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0.0" }
    static var build: String { Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "1" }

    /// The 26 A-Alerts places: municipality of Apeldoorn + Teuge (see Werkgebied.json).
    static var plaatsen: [String] { Werkgebied.shared.namen }
    /// Grouped as in the settings: places and villages, then hamlets.
    static var plaatsGroepen: [(titel: String, opties: [String])] {
        let w = Werkgebied.shared.plaatsen
        return [(L("Plaatsen en dorpen"), w.filter { $0.groep == "plaats" }.map(\.naam)),
                (L("Buurtschappen"), w.filter { $0.groep != "plaats" }.map(\.naam))]
    }
    static let prioriteiten = ["A0", "A1", "A2", "B1", "B2", "B3", "P1", "P2", "P3"]
    static let center = (lat: 52.2112, lon: 5.9699)
}

// MARK: - Formatting

enum Fmt {
    private static let isoFrac: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()
    private static let iso: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        return f
    }()

    static func parseISO(_ s: String) -> Date? {
        if let d = isoFrac.date(from: s) ?? iso.date(from: s) { return d }
        // Some sources store dates without timezone ("2026-11-02T10:55:16.525000") – these are UTC.
        let trimmed = String(s.prefix(19))
        return iso.date(from: trimmed + "Z")
    }

    static func isoString(_ d: Date) -> String { isoFrac.string(from: d) }

    static func time(_ d: Date) -> String { d.formatted(.dateTime.hour(.twoDigits(amPM: .omitted)).minute(.twoDigits)) }

    static func dayTime(_ d: Date) -> String {
        d.formatted(.dateTime.weekday(.wide).day().month(.wide).hour(.twoDigits(amPM: .omitted)).minute(.twoDigits))
    }

    static func dayHeader(_ d: Date) -> String {
        let s = d.formatted(.dateTime.weekday(.wide).day().month(.wide).year())
        return s.prefix(1).uppercased() + s.dropFirst()
    }

    /// "25 min geleden", "1 uur, 10 min geleden" – like the website.
    static func ago(_ d: Date, now: Date = .now) -> String {
        let secs = max(0, Int(now.timeIntervalSince(d)))
        let mins = secs / 60
        if mins < 1 { return L("Zojuist") }
        if mins < 60 { return Lf("%lld min geleden", mins) }
        let hours = mins / 60
        if hours < 24 { return Lf("%lld uur, %lld min geleden", hours, mins % 60) }
        let days = hours / 24
        return days == 1 ? L("Gisteren") : Lf("%lld dagen geleden", days)
    }

    /// Short variant for the watch and compact rows.
    static func agoShort(_ d: Date, now: Date = .now) -> String {
        let mins = max(0, Int(now.timeIntervalSince(d))) / 60
        if mins < 1 { return L("nu") }
        if mins < 60 { return Lf("%lld min", mins) }
        let hours = mins / 60
        if hours < 24 { return Lf("%lld uur", hours) }
        return Lf("%lld d", hours / 24)
    }

    static func distance(_ meters: Double) -> String {
        let m = Measurement(value: meters, unit: UnitLength.meters)
        if meters < 1000 {
            return m.formatted(.measurement(width: .abbreviated, usage: .asProvided, numberFormatStyle: .number.precision(.fractionLength(0))))
        }
        return m.converted(to: .kilometers).formatted(.measurement(width: .abbreviated, usage: .asProvided, numberFormatStyle: .number.precision(.fractionLength(1))))
    }
}

// MARK: - Colours

extension Color {
    init(hex: UInt32, opacity: Double = 1) {
        self.init(.sRGB,
                  red: Double((hex >> 16) & 0xFF) / 255,
                  green: Double((hex >> 8) & 0xFF) / 255,
                  blue: Double(hex & 0xFF) / 255,
                  opacity: opacity)
    }

    /// A colour with a dark-mode variant.
    init(light: UInt32, dark: UInt32) {
        #if canImport(UIKit) && !os(watchOS)
        self.init(uiColor: UIColor { traits in
            UIColor(Color(hex: traits.userInterfaceStyle == .dark ? dark : light))
        })
        #elseif canImport(AppKit)
        self.init(nsColor: NSColor(name: nil) { appearance in
            let isDark = appearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua
            return NSColor(Color(hex: isDark ? dark : light))
        })
        #else
        self.init(hex: dark)
        #endif
    }
}

enum Theme {
    /// A-Alerts red (website buttons / app icon).
    static let red = Color(hex: 0xDC2626)
    static let redDeep = Color(hex: 0xB0001A)
    static let iconRed = Color(hex: 0xD0021E)
    static let online = Color(hex: 0x22C55E)
}
