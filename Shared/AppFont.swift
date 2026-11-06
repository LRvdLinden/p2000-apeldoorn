import SwiftUI
import CoreText
#if canImport(UIKit)
import UIKit
#elseif canImport(AppKit)
import AppKit
#endif

/// A-Alerts typography: Social Gothic (Medium) for every title, Poppins for all other text.
/// The fonts live in Shared/Fonts, so every target (app, TV, Watch, widgets) bundles them.
/// Note: Social Gothic is a commercial Canada Type font; shipping it needs an app/embedding licence.
enum AppFont {
    enum Weight { case light, regular, medium, semibold, bold }

    static let headingName = "SocialGothic-Medium"

    private static let registered: Void = {
        let urls = (Bundle.main.urls(forResourcesWithExtension: "ttf", subdirectory: nil) ?? [])
            + (Bundle.main.urls(forResourcesWithExtension: "otf", subdirectory: nil) ?? [])
        for url in urls {
            CTFontManagerRegisterFontsForURL(url as CFURL, .process, nil)
        }
    }()

    /// Registers every .ttf/.otf in the bundle (no Info.plist list needed). Safe to call repeatedly.
    static func register() { _ = registered }

    static func poppinsName(_ weight: Weight) -> String {
        switch weight {
        case .light: return "Poppins-Light"
        case .regular: return "Poppins-Regular"
        case .medium: return "Poppins-Medium"
        case .semibold: return "Poppins-SemiBold"
        case .bold: return "Poppins-Bold"
        }
    }

    /// Body text in Poppins; scales with Dynamic Type relative to `style`.
    static func body(_ size: CGFloat, _ weight: Weight = .regular, relativeTo style: Font.TextStyle = .body) -> Font {
        let name = poppinsName(weight)
        guard exists(name) else {
            let w: Font.Weight
            switch weight {
            case .light: w = .light
            case .regular: w = .regular
            case .medium: w = .medium
            case .semibold: w = .semibold
            case .bold: w = .bold
            }
            return .system(size: size, weight: w)
        }
        return .custom(name, size: size, relativeTo: style)
    }

    /// Titles in Social Gothic; scales with Dynamic Type relative to `style`.
    static func heading(_ size: CGFloat = 20, relativeTo style: Font.TextStyle = .title3) -> Font {
        if exists(headingName) { return .custom(headingName, size: size, relativeTo: style) }
        return .system(size: size, weight: .black).width(.condensed)
    }

    private static var cache: [String: Bool] = [:]
    private static let lock = NSLock()

    private static func exists(_ name: String) -> Bool {
        register()
        lock.lock(); defer { lock.unlock() }
        if let hit = cache[name] { return hit }
        #if canImport(UIKit)
        let ok = UIFont(name: name, size: 12) != nil
        #else
        let ok = NSFont(name: name, size: 12) != nil
        #endif
        cache[name] = ok
        return ok
    }

    #if os(iOS) || os(tvOS)
    static func uiFont(_ name: String, _ size: CGFloat, _ style: UIFont.TextStyle) -> UIFont {
        _ = exists(name)
        guard let f = UIFont(name: name, size: size) else { return .preferredFont(forTextStyle: style) }
        return UIFontMetrics(forTextStyle: style).scaledFont(for: f)
    }

    /// UIKit chrome that SwiftUI doesn't expose: navigation titles, tab bar, segmented controls, buttons in bars.
    @MainActor static func applyAppearance() {
        register()
        let nav = UINavigationBar.appearance()
        var title = nav.titleTextAttributes ?? [:]
        title[.font] = uiFont(headingName, 19, .headline)
        nav.titleTextAttributes = title
        #if os(iOS)
        var large = nav.largeTitleTextAttributes ?? [:]
        large[.font] = uiFont(headingName, 34, .largeTitle)
        nav.largeTitleTextAttributes = large
        let barButton = UIBarButtonItem.appearance()
        for state: UIControl.State in [.normal, .highlighted, .disabled] {
            barButton.setTitleTextAttributes([.font: uiFont(poppinsName(.medium), 17, .body)], for: state)
        }
        let tab = UITabBarItem.appearance()
        for state: UIControl.State in [.normal, .selected] {
            tab.setTitleTextAttributes([.font: uiFont(poppinsName(.medium), 10, .caption2)], for: state)
        }
        #endif
        let seg = UISegmentedControl.appearance()
        seg.setTitleTextAttributes([.font: uiFont(poppinsName(.medium), 13, .footnote)], for: .normal)
        seg.setTitleTextAttributes([.font: uiFont(poppinsName(.semibold), 13, .footnote)], for: .selected)
    }
    #else
    @MainActor static func applyAppearance() { register() }
    #endif
}
