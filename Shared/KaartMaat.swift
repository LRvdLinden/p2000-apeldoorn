import SwiftUI

/// One size for every pin on every map (alerts of the services and all sources), so no marker is bigger than another.
enum KaartMaat {
    /// Height of the drawn pin in points.
    #if os(tvOS)
    static let pin: CGFloat = 64
    #else
    static let pin: CGFloat = 44
    #endif
}
