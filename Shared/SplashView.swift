import SwiftUI

/// Animated splash: the shield drops in, pager "radar" pulses ripple out,
/// the name types in and the whole screen opens up into the app.
struct SplashView: View {
    var onFinish: () -> Void

    @State private var shieldIn = false
    @State private var pulse = false
    @State private var markIn = false
    @State private var textIn = false
    @State private var tagIn = false
    @State private var exit = false

    #if os(watchOS)
    private let markSize: CGFloat = 70
    #elseif os(tvOS)
    private let markSize: CGFloat = 220
    #else
    private let markSize: CGFloat = 120
    #endif

    var body: some View {
        ZStack {
            RadialGradient(colors: [Color(hex: 0xF0142F), Theme.iconRed, Color(hex: 0x7A0010)],
                           center: .center, startRadius: 10, endRadius: 600)
                .ignoresSafeArea()

            // Pager pulses
            ForEach(0..<3) { i in
                Circle()
                    .stroke(.white.opacity(0.55), lineWidth: 2)
                    .frame(width: markSize * 1.1, height: markSize * 1.1)
                    .scaleEffect(pulse ? 3.2 : 0.8)
                    .opacity(pulse ? 0 : 0.9)
                    .animation(.easeOut(duration: 1.6).repeatForever(autoreverses: false).delay(Double(i) * 0.45), value: pulse)
            }

            VStack(spacing: markSize * 0.18) {
                ZStack {
                    ShieldShape()
                        .fill(LinearGradient(colors: [.white, Color(white: 0.86)], startPoint: .top, endPoint: .bottom))
                        .frame(width: markSize * 0.82, height: markSize)
                        .shadow(color: .black.opacity(0.3), radius: 12, y: 6)
                    VStack(spacing: markSize * 0.06) {
                        Capsule().fill(Theme.iconRed).frame(width: markSize * 0.12, height: markSize * 0.38)
                            .scaleEffect(y: markIn ? 1 : 0, anchor: .top)
                        Circle().fill(Theme.iconRed).frame(width: markSize * 0.13, height: markSize * 0.13)
                            .scaleEffect(markIn ? 1 : 0)
                    }
                    .offset(y: -markSize * 0.04)
                }
                .scaleEffect(shieldIn ? 1 : 0.2)
                .rotationEffect(.degrees(shieldIn ? 0 : -25))
                .opacity(shieldIn ? 1 : 0)

                VStack(spacing: 4) {
                    Text("P2000 Apeldoorn")
                        #if os(watchOS)
                        .font(.headline.weight(.black))
                        #else
                        .font(.largeTitle.weight(.black))
                        #endif
                        .foregroundStyle(.white)
                        .opacity(textIn ? 1 : 0)
                        .offset(y: textIn ? 0 : 14)
                    Text(L("LIVE MELDINGEN"))
                        .font(.caption.weight(.bold))
                        .tracking(tagIn ? 5 : 14)
                        .foregroundStyle(.white.opacity(0.85))
                        .opacity(tagIn ? 1 : 0)
                }
            }
        }
        .scaleEffect(exit ? 1.6 : 1)
        .opacity(exit ? 0 : 1)
        .task {
            withAnimation(.spring(response: 0.55, dampingFraction: 0.6)) { shieldIn = true }
            pulse = true
            try? await Task.sleep(for: .milliseconds(380))
            withAnimation(.spring(response: 0.35, dampingFraction: 0.55)) { markIn = true }
            try? await Task.sleep(for: .milliseconds(220))
            withAnimation(.easeOut(duration: 0.45)) { textIn = true }
            try? await Task.sleep(for: .milliseconds(200))
            withAnimation(.easeOut(duration: 0.7)) { tagIn = true }
            try? await Task.sleep(for: .milliseconds(1100))
            withAnimation(.easeIn(duration: 0.4)) { exit = true }
            try? await Task.sleep(for: .milliseconds(380))
            onFinish()
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("P2000 Apeldoorn")
    }
}
