import SwiftUI

/// A-Alerts typography: the default Apple system font (SF Pro) everywhere.
/// The helpers map the sizes used in the views onto the system text styles, so Dynamic Type keeps working.
enum AppFont {
    enum Weight { case light, regular, medium, semibold, bold }

    /// Kept for the app entry points; there are no bundled fonts any more.
    static func register() {}

    private static func systemWeight(_ w: Weight) -> Font.Weight {
        switch w {
        case .light, .regular: return .regular
        case .medium: return .medium
        case .semibold: return .semibold
        case .bold: return .bold
        }
    }

    /// Body text in the system font. With a text style it scales with Dynamic Type.
    static func body(_ size: CGFloat, _ weight: Weight = .regular, relativeTo style: Font.TextStyle? = nil) -> Font {
        if let style { return Font.system(style).weight(systemWeight(weight)) }
        return .system(size: size, weight: systemWeight(weight))
    }

    /// Titles in the system font (bold). With a text style it scales with Dynamic Type.
    static func heading(_ size: CGFloat = 20, relativeTo style: Font.TextStyle? = nil) -> Font {
        if let style { return Font.system(style).weight(style == .headline ? .semibold : .bold) }
        return .system(size: size, weight: .bold)
    }

    /// No custom UIKit appearance any more: navigation bars and tab bars use the system font.
    @MainActor static func applyAppearance() {}
}
