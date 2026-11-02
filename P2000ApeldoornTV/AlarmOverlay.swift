import SwiftUI
import MapKit

/// Full-screen alarm for a new alert, like a pager going off in the control room.
struct AlarmOverlay: View {
    let melding: Melding
    let seconds: Int
    var onDone: () -> Void
    @State private var flash = false
    @State private var progress: CGFloat = 1
    @FocusState private var focused: Bool

    var body: some View {
        let color = melding.dienst.color
        ZStack {
            LinearGradient(colors: [color.opacity(0.95), Color(hex: 0x120206)], startPoint: .top, endPoint: .bottom)
                .ignoresSafeArea()
            Rectangle()
                .strokeBorder(melding.isUrgent ? Color.white : color, lineWidth: 26)
                .opacity(flash ? 0.15 : 0.95)
                .ignoresSafeArea()
                .animation(.easeInOut(duration: 0.45).repeatForever(), value: flash)

            HStack(spacing: 70) {
                VStack(alignment: .leading, spacing: 26) {
                    HStack(spacing: 18) {
                        Image(systemName: "light.beacon.max.fill").font(.system(size: 54))
                            .symbolEffect(.pulse, options: .repeating)
                        Text(melding.isUrgent ? L("SPOED") : L("NIEUWE MELDING"))
                            .font(.system(size: 54, weight: .black))
                    }
                    HStack(spacing: 22) {
                        DienstIcon(dienst: melding.dienst, size: 110)
                            .padding(16)
                            .background(.white, in: RoundedRectangle(cornerRadius: 30, style: .continuous))
                        VStack(alignment: .leading, spacing: 8) {
                            Text(melding.dienst.label).font(.system(size: 44, weight: .heavy))
                            if let p = melding.prioriteit, !p.isEmpty {
                                Text(Lf("Prioriteit %@", p)).font(.system(size: 36, weight: .bold))
                                    .padding(.horizontal, 18).padding(.vertical, 6)
                                    .background(.black.opacity(0.35), in: Capsule())
                            }
                        }
                    }
                    Text(melding.title).font(.system(size: 64, weight: .black)).lineLimit(3).minimumScaleFactor(0.6)
                    Label(melding.plaatsText, systemImage: "mappin.and.ellipse").font(.system(size: 40, weight: .bold))
                    if let c = melding.categorie, !c.isEmpty {
                        Text(c).font(.system(size: 34, weight: .semibold)).opacity(0.85)
                    }
                    Text(melding.datum.formatted(date: .omitted, time: .standard)).font(.system(size: 34, weight: .semibold).monospacedDigit()).opacity(0.8)
                }
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity, alignment: .leading)

                if let lat = melding.lat, let lon = melding.lon {
                    Map(initialPosition: .camera(MapCamera(centerCoordinate: CLLocationCoordinate2D(latitude: lat, longitude: lon),
                                                            distance: 2500, heading: 0, pitch: 50)), interactionModes: []) {
                        Annotation("", coordinate: CLLocationCoordinate2D(latitude: lat, longitude: lon), anchor: .bottom) {
                            TVMarker(melding: melding, highlighted: true)
                        }
                    }
                    .mapStyle(.standard(elevation: .realistic, pointsOfInterest: .excludingAll))
                    .frame(width: 720, height: 720)
                    .clipShape(RoundedRectangle(cornerRadius: 40, style: .continuous))
                    .shadow(color: .black.opacity(0.5), radius: 40, y: 20)
                }
            }
            .padding(.horizontal, 110)

            VStack {
                Spacer()
                GeometryReader { geo in
                    Capsule().fill(.white.opacity(0.85)).frame(width: geo.size.width * progress, height: 8)
                }
                .frame(height: 8)
                .padding(.horizontal, 110)
                .padding(.bottom, 60)
            }
        }
        .focusable()
        .focused($focused)
        .onTapGesture { onDone() }
        .onExitCommand { onDone() }
        .onAppear {
            focused = true
            flash = true
            withAnimation(.linear(duration: Double(seconds))) { progress = 0 }
        }
        .task(id: melding.guid) {
            try? await Task.sleep(for: .seconds(seconds))
            onDone()
        }
    }
}
