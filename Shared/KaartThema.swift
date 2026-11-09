import SwiftUI

/// Map colours from the setting "Kaart": light (default), dark, or following the device. Used on every map in all apps.
private struct KaartThemaModifier: ViewModifier {
    @Environment(\.colorScheme) private var systeem
    func body(content: Content) -> some View {
        let thema = AppSettings.shared.kaartThema
        content.environment(\.colorScheme, thema == "donker" ? .dark : thema == "auto" ? systeem : .light)
    }
}

extension View {
    /// Light, dark or automatic map, per the user's choice (default light).
    func kaartThema() -> some View { modifier(KaartThemaModifier()) }
}
