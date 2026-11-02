import SwiftUI

/// The shield from the P2000 Apeldoorn logo (24 × 24 design grid, same path as the website).
struct ShieldShape: Shape {
    func path(in rect: CGRect) -> Path {
        let sx = rect.width / 18, sy = rect.height / 22
        func p(_ x: CGFloat, _ y: CGFloat) -> CGPoint { CGPoint(x: rect.minX + (x - 3) * sx, y: rect.minY + (y - 1) * sy) }
        var path = Path()
        path.move(to: p(12, 1))
        path.addLine(to: p(3, 5))
        path.addLine(to: p(3, 11))
        path.addCurve(to: p(12, 23), control1: p(3, 16.55), control2: p(6.84, 21.74))
        path.addCurve(to: p(21, 11), control1: p(17.16, 21.74), control2: p(21, 16.55))
        path.addLine(to: p(21, 5))
        path.closeSubpath()
        return path
    }
}

/// Red app mark: white shield with a red exclamation mark.
struct AppMark: View {
    var size: CGFloat = 56
    var showsTile = true

    var body: some View {
        ZStack {
            if showsTile {
                RoundedRectangle(cornerRadius: size * 0.225, style: .continuous)
                    .fill(Theme.iconRed)
            }
            ShieldShape()
                .fill(LinearGradient(colors: [.white, Color(white: 0.84)], startPoint: .top, endPoint: .bottom))
                .frame(width: size * 0.52, height: size * 0.62)
                .shadow(color: .black.opacity(0.18), radius: size * 0.03, y: size * 0.015)
                .overlay {
                    VStack(spacing: size * 0.035) {
                        Capsule().fill(Theme.iconRed).frame(width: size * 0.075, height: size * 0.24)
                        Circle().fill(Theme.iconRed).frame(width: size * 0.085, height: size * 0.085)
                    }
                    .offset(y: -size * 0.02)
                }
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }
}

/// The discipline artwork from the website, with an SF Symbol fallback.
struct DienstIcon: View {
    let dienst: Dienst
    var size: CGFloat = 40

    var body: some View {
        Group {
            if let name = dienst.iconImage {
                Image(name).resizable().scaledToFit()
            } else {
                Image(systemName: dienst.systemImage)
                    .resizable().scaledToFit()
                    .foregroundStyle(dienst.color)
            }
        }
        .frame(width: size, height: size)
        .accessibilityLabel(dienst.label)
    }
}

/// Map pin artwork from the website (pin tip at the bottom centre).
struct DienstMarker: View {
    let dienst: Dienst
    var size: CGFloat = 44
    var selected = false

    var body: some View {
        Group {
            if let name = dienst.markerImage {
                Image(name).resizable().scaledToFit()
            } else {
                ZStack {
                    Circle().fill(dienst.color)
                    Image(systemName: dienst.systemImage).foregroundStyle(.white).font(.system(size: size * 0.4, weight: .bold))
                }
                .padding(size * 0.12)
            }
        }
        .frame(width: size, height: size)
        .scaleEffect(selected ? 1.25 : 1, anchor: .bottom)
        .shadow(color: .black.opacity(0.25), radius: 2, y: 1)
        .animation(.spring(duration: 0.3), value: selected)
    }
}

struct PrioBadge: View {
    let melding: Melding

    var body: some View {
        if let p = melding.prioriteit, !p.isEmpty, p.lowercased() != "onbekend" {
            Text(p.uppercased())
                .font(.caption2.weight(.heavy))
                .monospaced()
                .padding(.horizontal, 6).padding(.vertical, 2)
                .foregroundStyle(.white)
                .background(melding.isUrgent ? Theme.red : Color.gray, in: Capsule())
                .accessibilityLabel(Lf("Prioriteit %@", p))
        }
    }
}

/// Green pulsing "Online" dot (red when offline).
struct LiveDot: View {
    var online: Bool
    @State private var pulse = false

    var body: some View {
        ZStack {
            Circle().fill((online ? Theme.online : Theme.red).opacity(0.35))
                .frame(width: 14, height: 14)
                .scaleEffect(pulse ? 1.4 : 0.7)
                .opacity(pulse ? 0 : 1)
            Circle().fill(online ? Theme.online : Theme.red).frame(width: 8, height: 8)
        }
        .onAppear {
            withAnimation(.easeOut(duration: 1.4).repeatForever(autoreverses: false)) { pulse = true }
        }
        .accessibilityHidden(true)
    }
}
