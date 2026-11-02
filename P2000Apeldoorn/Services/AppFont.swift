import SwiftUI
import CoreText
#if canImport(UIKit)
import UIKit
#elseif canImport(AppKit)
import AppKit
#endif

/// Fonts of p2000-apeldoorn.nl: Poppins for text (bundled, SIL OFL) and Social Gothic Bold for headings.
/// Social Gothic is a commercial Canada Type font and is not bundled; drop `SocialGothic-Bold.otf`
/// into P2000Apeldoorn/Fonts (with an app licence) and it is picked up automatically.
enum AppFont {
    enum Weight { case regular, medium, semibold, bold }

    /// Registers every .ttf/.otf in the app bundle (no Info.plist list needed).
    static func register() {
        let urls = (Bundle.main.urls(forResourcesWithExtension: "ttf", subdirectory: nil) ?? [])
            + (Bundle.main.urls(forResourcesWithExtension: "otf", subdirectory: nil) ?? [])
        for url in urls {
            CTFontManagerRegisterFontsForURL(url as CFURL, .process, nil)
        }
    }

    static func body(_ size: CGFloat, _ weight: Weight = .regular, relativeTo style: Font.TextStyle = .body) -> Font {
        let name: String
        switch weight {
        case .regular: name = "Poppins-Regular"
        case .medium: name = "Poppins-Medium"
        case .semibold: name = "Poppins-SemiBold"
        case .bold: name = "Poppins-Bold"
        }
        guard exists(name) else {
            let w: Font.Weight = weight == .bold ? .bold : weight == .semibold ? .semibold : weight == .medium ? .medium : .regular
            return .system(size: size, weight: w)
        }
        return .custom(name, size: size, relativeTo: style)
    }

    static func heading(_ size: CGFloat = 20) -> Font {
        if exists("SocialGothic-Bold") { return .custom("SocialGothic-Bold", size: size, relativeTo: .title3) }
        return .system(size: size, weight: .black).width(.condensed)
    }

    private static var cache: [String: Bool] = [:]

    private static func exists(_ name: String) -> Bool {
        if let hit = cache[name] { return hit }
        #if canImport(UIKit)
        let ok = UIFont(name: name, size: 12) != nil
        #else
        let ok = NSFont(name: name, size: 12) != nil
        #endif
        cache[name] = ok
        return ok
    }
}
