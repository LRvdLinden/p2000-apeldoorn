import SwiftUI
import AuthenticationServices

/// First-launch welcome: what the app does, push notifications, optional Sign in with Apple.
struct OnboardingView: View {
    @Environment(AppSettings.self) private var settings
    @Environment(AccountManager.self) private var account
    @Environment(\.colorScheme) private var colorScheme

    @State private var page = 0
    @State private var pushAsked = false
    @State private var error: String?

    var body: some View {
        ZStack {
            LinearGradient(colors: [Theme.iconRed, Color(hex: 0x7A0010)], startPoint: .topLeading, endPoint: .bottomTrailing)
                .ignoresSafeArea()

            VStack(spacing: 0) {
                Group {
                    switch page {
                    case 0: welcome
                    case 1: push
                    default: signIn
                    }
                }
                .id(page)
                .transition(.asymmetric(insertion: .move(edge: .trailing).combined(with: .opacity),
                                        removal: .move(edge: .leading).combined(with: .opacity)))
                .gesture(DragGesture(minimumDistance: 30).onEnded { value in
                    if value.translation.width < -40, page < 2 { withAnimation { page += 1 } }
                    if value.translation.width > 40, page > 0 { withAnimation { page -= 1 } }
                })

                HStack(spacing: 8) {
                    ForEach(0..<3) { i in
                        Capsule()
                            .fill(.white.opacity(i == page ? 1 : 0.4))
                            .frame(width: i == page ? 22 : 8, height: 8)
                    }
                }
                .animation(.spring(duration: 0.3), value: page)
                .padding(.bottom, 18)

                Button {
                    if page < 2 { withAnimation { page += 1 } } else { finish() }
                } label: {
                    Text(page < 2 ? L("Volgende") : L("Start"))
                        .font(.headline)
                        .frame(maxWidth: 420)
                        .padding(.vertical, 15)
                        .background(.white, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                        .foregroundStyle(Theme.iconRed)
                }
                .buttonStyle(.plain)
                .padding(.horizontal, 28)
                .padding(.bottom, 24)
            }
        }
    }

    private func finish() {
        withAnimation(.easeInOut(duration: 0.4)) { settings.onboardingDone = true }
    }

    // MARK: Pages

    private var welcome: some View {
        pageLayout(icon: { AppMark(size: 110) },
             title: L("Welkom bij P2000 Apeldoorn"),
             text: L("Alle P2000-meldingen van brandweer, ambulance, politie en traumaheli in de gemeente Apeldoorn – live, op de kaart en met statistieken.")) {
            HStack(spacing: 18) {
                ForEach(Dienst.selectable) { d in
                    VStack(spacing: 6) {
                        DienstIcon(dienst: d, size: 34)
                            .padding(10)
                            .background(.white, in: Circle())
                        Text(d.label).font(.caption2.weight(.semibold)).foregroundStyle(.white)
                    }
                }
            }
        }
    }

    private var push: some View {
        pageLayout(icon: { bubble("bell.badge.fill") },
             title: L("Mis geen melding"),
             text: L("Ontvang een pushmelding zodra er iets gebeurt. Kies later in Instellingen voor welke plaatsen, disciplines en prioriteiten, en stel een stille modus in.")) {
            Button {
                PushManager.enable { _ in pushAsked = true }
            } label: {
                Label(settings.notificationsEnabled ? L("Pushmeldingen staan aan") : L("Pushmeldingen aanzetten"),
                      systemImage: settings.notificationsEnabled ? "checkmark.circle.fill" : "bell")
                    .font(.headline)
                    .padding(.horizontal, 20).padding(.vertical, 12)
                    .background(.white.opacity(0.18), in: Capsule())
                    .overlay(Capsule().strokeBorder(.white.opacity(0.6)))
                    .foregroundStyle(.white)
            }
            .buttonStyle(.plain)
            .disabled(settings.notificationsEnabled)
        }
    }

    private var signIn: some View {
        pageLayout(icon: { bubble("icloud.fill") },
             title: L("Al je apparaten in sync"),
             text: L("Log in met Apple om je instellingen en bewaarde meldingen via iCloud op je iPhone, iPad, Mac en Apple Watch gelijk te houden. Inloggen is niet verplicht.")) {
            VStack(spacing: 10) {
                if account.isSignedIn {
                    Label(Lf("Ingelogd als %@", account.displayName), systemImage: "person.crop.circle.badge.checkmark")
                        .font(.headline)
                        .foregroundStyle(.white)
                } else {
                    SignInWithAppleButton(.signIn) { request in
                        account.configure(request)
                    } onCompletion: { result in
                        error = account.handle(result)
                    }
                    .signInWithAppleButtonStyle(.white)
                    .frame(maxWidth: 320)
                    .frame(height: 50)
                    if let error {
                        Text(error).font(.footnote).foregroundStyle(.white.opacity(0.9))
                    }
                }
            }
        }
    }

    private func bubble(_ symbol: String) -> some View {
        Image(systemName: symbol)
            .font(.system(size: 48, weight: .semibold))
            .foregroundStyle(Theme.iconRed)
            .frame(width: 110, height: 110)
            .background(.white, in: RoundedRectangle(cornerRadius: 26, style: .continuous))
            .shadow(color: .black.opacity(0.2), radius: 14, y: 8)
    }

    private func pageLayout<Icon: View, Extra: View>(@ViewBuilder icon: () -> Icon, title: String, text: String,
                                               @ViewBuilder extra: () -> Extra) -> some View {
        ScrollView {
            VStack(spacing: 22) {
                Spacer(minLength: 40)
                icon()
                Text(title)
                    .font(.title.weight(.black))
                    .multilineTextAlignment(.center)
                    .foregroundStyle(.white)
                Text(text)
                    .font(.body)
                    .multilineTextAlignment(.center)
                    .foregroundStyle(.white.opacity(0.88))
                    .frame(maxWidth: 460)
                extra()
                    .padding(.top, 8)
                Spacer(minLength: 40)
            }
            .padding(.horizontal, 28)
            .frame(maxWidth: .infinity)
        }
        .scrollBounceBehavior(.basedOnSize)
    }
}
