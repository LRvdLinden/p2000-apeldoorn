import SwiftUI
import AuthenticationServices

/// First-launch welcome: what the app does, push notifications, optional Sign in with Apple.
struct OnboardingView: View {
    @Environment(AppSettings.self) private var settings
    @Environment(AccountManager.self) private var account
    @Environment(\.colorScheme) private var colorScheme
    @Environment(LocationManager.self) private var location

    @State private var page = OnboardingView.startStap
    @State private var pushAsked = false
    @State private var error: String?
    /// Step "Waar": the whole municipality, chosen places, or a radius around you.
    @State private var gebied: Gebied = .gemeente
    enum Gebied: Hashable { case gemeente, plaatsen, buurt }

    var body: some View {
        ZStack {
            LinearGradient(colors: [Theme.iconRed, Color(hex: 0x7A0010)], startPoint: .topLeading, endPoint: .bottomTrailing)
                .ignoresSafeArea()

            VStack(spacing: 0) {
                Group {
                    switch page {
                    case 0: welcome
                    case 1: waar
                    case 2: welke
                    case 3: waarschuwingen
                    case 4: rust
                    case 5: klaar
                    default: signIn
                    }
                }
                .id(page)
                .transition(.asymmetric(insertion: .move(edge: .trailing).combined(with: .opacity),
                                        removal: .move(edge: .leading).combined(with: .opacity)))
                .gesture(DragGesture(minimumDistance: 30).onEnded { value in
                    if value.translation.width < -40, page < Self.laatste { withAnimation { page += 1 } }
                    if value.translation.width > 40, page > 0 { withAnimation { page -= 1 } }
                })

                HStack(spacing: 8) {
                    ForEach(0...Self.laatste, id: \.self) { i in
                        Capsule()
                            .fill(.white.opacity(i == page ? 1 : 0.4))
                            .frame(width: i == page ? 22 : 8, height: 8)
                    }
                }
                .animation(.spring(duration: 0.3), value: page)
                .padding(.bottom, 18)

                Button {
                    if page < Self.laatste { withAnimation { page += 1 } } else { finish() }
                } label: {
                    Text(page < Self.laatste ? L("Volgende") : L("Start"))
                        .font(AppFont.heading(18, relativeTo: .headline))
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

    #if DEBUG
    /// Screenshots: -AAlertsWelkomStap <n> opens the welcome flow at step n.
    private static var startStap: Int {
        let a = ProcessInfo.processInfo.arguments
        return a.firstIndex(of: "-AAlertsWelkomStap").flatMap { $0 + 1 < a.count ? Int(a[$0 + 1]) : nil } ?? 0
    }
    #else
    private static let startStap = 0
    #endif

    /// Index of the last page: welcome, where, which alerts, warnings, quiet hours, ready (push), sign in.
    static let laatste = 6

    private func finish() {
        withAnimation(.easeInOut(duration: 0.4)) { settings.onboardingDone = true }
    }

    // MARK: Profile steps (as a notification profile: place, services, priority, warnings, quiet hours)

    private var waar: some View {
        stap(icon: "mappin.and.ellipse", title: L("Waar wil je meldingen van?"),
             text: L("Dit is je eerste meldingsprofiel. Later voeg je er meer toe, bijvoorbeeld voor je werk of je ouders.")) {
            VStack(spacing: 10) {
                keuze(L("De hele gemeente Apeldoorn"), sub: L("Alle plaatsen, en Teuge"), icon: "building.2.fill", gekozen: gebied == .gemeente) {
                    gebied = .gemeente; settings.notifPlaatsen = []; settings.radiusEnabled = false
                }
                keuze(L("Bepaalde plaatsen"), sub: L("Kies je wijk of dorp"), icon: "mappin.circle.fill", gekozen: gebied == .plaatsen) {
                    gebied = .plaatsen; settings.radiusEnabled = false
                }
                if gebied == .plaatsen {
                    ChipFlow(spacing: 8) {
                        ForEach(Werkgebied.shared.namen, id: \.self) { p in
                            chip(p, aan: settings.notifPlaatsen.contains(p)) {
                                if settings.notifPlaatsen.contains(p) { settings.notifPlaatsen.remove(p) } else { settings.notifPlaatsen.insert(p) }
                            }
                        }
                    }
                    .padding(.vertical, 4)
                }
                keuze(L("Rond mijn locatie"), sub: Lf("Binnen %@ km van waar je bent", settings.radiusKm.formatted(.number.precision(.fractionLength(0)))), icon: "location.fill", gekozen: gebied == .buurt) {
                    gebied = .buurt; settings.notifPlaatsen = []; settings.radiusMode = "huidig"; settings.radiusEnabled = true
                    settings.useLocation = true; location.start()
                }
                if gebied == .buurt {
                    HStack {
                        Text(verbatim: "1 km").font(AppFont.body(12)).foregroundStyle(.white.opacity(0.8))
                        Slider(value: Binding(get: { settings.radiusKm }, set: { settings.radiusKm = $0.rounded() }), in: 1...15, step: 1).tint(.white)
                        Text(verbatim: "15 km").font(AppFont.body(12)).foregroundStyle(.white.opacity(0.8))
                    }
                }
            }
        }
    }

    private var welke: some View {
        stap(icon: "line.3.horizontal.decrease.circle.fill", title: L("Welke meldingen wil je?"),
             text: L("Niets gekozen is alles. Je ziet in de pager altijd alle meldingen; dit bepaalt waarvoor je een pushmelding krijgt.")) {
            VStack(alignment: .leading, spacing: 14) {
                Text(L("Disciplines")).font(AppFont.body(14, .semibold)).foregroundStyle(.white.opacity(0.85))
                ChipFlow(spacing: 8) {
                    ForEach(Dienst.selectable) { d in
                        chip(d.label, aan: settings.notifDiensten.contains(d.rawValue)) {
                            if settings.notifDiensten.contains(d.rawValue) { settings.notifDiensten.remove(d.rawValue) } else { settings.notifDiensten.insert(d.rawValue) }
                        }
                    }
                }
                Text(L("Hoe dringend")).font(AppFont.body(14, .semibold)).foregroundStyle(.white.opacity(0.85)).padding(.top, 4)
                VStack(spacing: 10) {
                    keuze(L("Alle meldingen"), sub: L("Ook besteld vervoer en meldingen zonder haast"), icon: "list.bullet", gekozen: settings.notifPrioriteiten.isEmpty) {
                        settings.notifPrioriteiten = []
                    }
                    keuze(L("Alleen spoed"), sub: L("A1 en P1: met zwaailicht en sirene"), icon: "light.beacon.max.fill", gekozen: settings.notifPrioriteiten == ["A1", "P1"]) {
                        settings.notifPrioriteiten = ["A1", "P1"]
                    }
                    keuze(L("Spoed en snel"), sub: L("A1, A2, P1 en P2"), icon: "bolt.fill", gekozen: settings.notifPrioriteiten == ["A1", "A2", "P1", "P2"]) {
                        settings.notifPrioriteiten = ["A1", "A2", "P1", "P2"]
                    }
                }
            }
            .frame(maxWidth: 460, alignment: .leading)
        }
    }

    private var waarschuwingen: some View {
        stap(icon: "exclamationmark.triangle.fill", title: L("Ook waarschuwingen?"),
             text: L("NL-Alert, Burgernet, AMBER Alert en Vermist Kind Alert staan in de pager tussen de meldingen; een KNMI-weercode staat als balk bovenaan zolang hij geldt. Kies waarvoor je een pushmelding wilt.")) {
            VStack(spacing: 10) {
                schakelaar(L("NL-Alert"), sub: L("Alarmberichten van de overheid"), aan: Binding(get: { settings.pushNLAlert }, set: { settings.pushNLAlert = $0 })) { BronIcoon(bron: .nlalert, size: 28) }
                schakelaar(L("Burgernet"), sub: L("Vermissingen en zoekacties"), aan: Binding(get: { settings.pushBurgernet }, set: { settings.pushBurgernet = $0 })) { BronIcoon(bron: .burgernet, size: 28) }
                schakelaar("AMBER Alert", sub: L("Kind vermist en in levensgevaar, heel Nederland"), aan: Binding(get: { settings.pushAmber }, set: { settings.pushAmber = $0 })) { BronIcoon(bron: .amber, size: 28) }
                schakelaar(L("Vermist Kind Alert"), sub: L("Vermist kind in het werkgebied (alle plaatsen en buurtschappen)"), aan: Binding(get: { settings.pushVermistKind }, set: { settings.pushVermistKind = $0 })) { BronIcoon(bron: .vermistkind, size: 28) }
                schakelaar(L("Liveblogs"), sub: L("Aanvullingen van A-Alerts op een liveblog (tab Nieuws)"), aan: Binding(get: { settings.pushNieuwsLiveblog }, set: { settings.pushNieuwsLiveblog = $0 })) {
                    Image(systemName: "dot.radiowaves.left.and.right").font(.system(size: 15, weight: .bold)).foregroundStyle(.white)
                        .frame(width: 28, height: 28).background(Color.red, in: RoundedRectangle(cornerRadius: 7, style: .continuous))
                }
                VStack(alignment: .leading, spacing: 8) {
                    HStack(spacing: 10) {
                        BronIcoon(bron: .knmi, size: 28)
                        Text(L("KNMI-weercodes")).font(AppFont.body(16, .semibold)).foregroundStyle(.white)
                    }
                    ChipFlow(spacing: 8) {
                        ForEach(["yellow", "orange", "red"], id: \.self) { c in
                            chip(Waarschuwing.codeLabel(c), aan: settings.pushKnmi.contains(c)) {
                                if settings.pushKnmi.contains(c) { settings.pushKnmi.remove(c) } else { settings.pushKnmi.insert(c) }
                            }
                        }
                    }
                }
                .padding(14)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(.white.opacity(0.12), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            }
            .frame(maxWidth: 460)
        }
    }

    private var rust: some View {
        stap(icon: "moon.fill", title: L("Even rust?"),
             text: L("Tijdens je stille uren komen meldingen zonder geluid binnen. Spoedmeldingen mogen dan wel geluid maken.")) {
            VStack(spacing: 10) {
                schakelaar(L("Stille uren"), sub: Lf("Van %@ tot %@", AppSettings.hm(settings.quietFrom), AppSettings.hm(settings.quietTo)),
                           aan: Binding(get: { settings.quietMode }, set: { settings.quietMode = $0 })) {
                    Image(systemName: "moon.zzz.fill").foregroundStyle(.white).frame(width: 28, height: 28)
                }
                if settings.quietMode {
                    HStack {
                        tijdKiezer(L("Van"), minuten: Binding(get: { settings.quietFrom }, set: { settings.quietFrom = $0 }))
                        tijdKiezer(L("Tot"), minuten: Binding(get: { settings.quietTo }, set: { settings.quietTo = $0 }))
                    }
                }
                schakelaar(L("Spoed altijd met geluid"), sub: L("A1 en P1 ook tijdens stille uren en als je telefoon op stil staat"),
                           aan: Binding(get: { settings.criticalAlerts }, set: { settings.criticalAlerts = $0 })) {
                    Image(systemName: "speaker.wave.3.fill").foregroundStyle(.white).frame(width: 28, height: 28)
                }
            }
            .frame(maxWidth: 460)
        }
    }

    /// Ready: a summary of the profile, and turn on notifications.
    private var klaar: some View {
        stap(icon: "checkmark.seal.fill", title: L("Je profiel staat klaar"),
             text: L("Zet pushmeldingen aan om ze te ontvangen. Alles pas je later aan in Instellingen › Meldingen.")) {
            VStack(alignment: .leading, spacing: 10) {
                samenvatting("mappin.and.ellipse", gebiedTekst)
                samenvatting("cross.case.fill", settings.notifDiensten.isEmpty ? L("Alle disciplines")
                             : Dienst.selectable.filter { settings.notifDiensten.contains($0.rawValue) }.map(\.label).joined(separator: ", "))
                samenvatting("light.beacon.max.fill", settings.notifPrioriteiten.isEmpty ? L("Alle meldingen") : settings.notifPrioriteiten.sorted().joined(separator: ", "))
                samenvatting("exclamationmark.triangle.fill", waarschuwingTekst)
                if settings.quietMode { samenvatting("moon.fill", Lf("Stil van %@ tot %@", AppSettings.hm(settings.quietFrom), AppSettings.hm(settings.quietTo))) }
            }
            .padding(16)
            .frame(maxWidth: 460, alignment: .leading)
            .background(.white.opacity(0.12), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            Button {
                PushManager.enable { _ in pushAsked = true }
            } label: {
                Label(settings.notificationsEnabled ? L("Pushmeldingen staan aan") : L("Pushmeldingen aanzetten"),
                      systemImage: settings.notificationsEnabled ? "checkmark.circle.fill" : "bell")
                    .font(AppFont.heading(18, relativeTo: .headline))
                    .padding(.horizontal, 20).padding(.vertical, 12)
                    .background(.white.opacity(0.18), in: Capsule())
                    .overlay(Capsule().strokeBorder(.white.opacity(0.6)))
                    .foregroundStyle(.white)
            }
            .buttonStyle(.plain)
            .disabled(settings.notificationsEnabled)
            .padding(.top, 6)
        }
    }

    private var gebiedTekst: String {
        if settings.radiusEnabled { return Lf("Binnen %@ km van je locatie", settings.radiusKm.formatted(.number.precision(.fractionLength(0)))) }
        if !settings.notifPlaatsen.isEmpty { return settings.notifPlaatsen.sorted().joined(separator: ", ") }
        return L("De hele gemeente Apeldoorn")
    }

    private var waarschuwingTekst: String {
        var parts: [String] = []
        if settings.pushNLAlert { parts.append("NL-Alert") }
        if settings.pushBurgernet { parts.append("Burgernet") }
        let codes = ["yellow", "orange", "red"].filter(settings.pushKnmi.contains).map { Waarschuwing.codeLabel($0) }
        if !codes.isEmpty { parts.append("KNMI " + codes.joined(separator: ", ").replacingOccurrences(of: "Code ", with: "").lowercased()) }
        return parts.isEmpty ? L("Geen waarschuwingen") : parts.joined(separator: " · ")
    }

    // MARK: Building blocks

    private func stap<Extra: View>(icon: String, title: String, text: String, @ViewBuilder extra: () -> Extra) -> some View {
        pageLayout(icon: { bubble(icon).scaleEffect(0.8).frame(height: 90) }, title: title, text: text, extra: extra)
    }

    private func keuze(_ titel: String, sub: String, icon: String, gekozen: Bool, actie: @escaping () -> Void) -> some View {
        Button { withAnimation(.snappy) { actie() } } label: {
            HStack(spacing: 12) {
                Image(systemName: icon).font(.system(size: 18, weight: .semibold)).frame(width: 28)
                VStack(alignment: .leading, spacing: 2) {
                    Text(titel).font(AppFont.body(16, .semibold))
                    Text(sub).font(AppFont.body(13)).opacity(0.8)
                }
                Spacer(minLength: 0)
                Image(systemName: gekozen ? "checkmark.circle.fill" : "circle").font(.system(size: 20))
            }
            .foregroundStyle(gekozen ? Theme.iconRed : .white)
            .padding(14)
            .frame(maxWidth: 460)
            .background(gekozen ? Color.white : Color.white.opacity(0.12), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(gekozen ? .isSelected : [])
    }

    private func chip(_ titel: String, aan: Bool, actie: @escaping () -> Void) -> some View {
        Button(action: actie) {
            Text(titel).font(AppFont.body(14, .semibold))
                .padding(.horizontal, 14).padding(.vertical, 8)
                .foregroundStyle(aan ? Theme.iconRed : .white)
                .background(aan ? Color.white : Color.white.opacity(0.14), in: Capsule())
                .overlay(Capsule().strokeBorder(.white.opacity(aan ? 0 : 0.45)))
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(aan ? .isSelected : [])
    }

    private func schakelaar<I: View>(_ titel: String, sub: String, aan: Binding<Bool>, @ViewBuilder icon: () -> I) -> some View {
        Toggle(isOn: aan) {
            HStack(spacing: 12) {
                icon()
                VStack(alignment: .leading, spacing: 2) {
                    Text(titel).font(AppFont.body(16, .semibold))
                    Text(sub).font(AppFont.body(13)).opacity(0.8)
                }
            }
            .foregroundStyle(.white)
        }
        .tint(.green)
        .padding(14)
        .background(.white.opacity(0.12), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    private func tijdKiezer(_ label: String, minuten: Binding<Int>) -> some View {
        let datum = Binding<Date>(
            get: { Calendar.current.date(bySettingHour: minuten.wrappedValue / 60, minute: minuten.wrappedValue % 60, second: 0, of: .now) ?? .now },
            set: { let c = Calendar.current.dateComponents([.hour, .minute], from: $0); minuten.wrappedValue = (c.hour ?? 0) * 60 + (c.minute ?? 0) })
        return VStack(spacing: 4) {
            Text(label).font(AppFont.body(12, .semibold)).foregroundStyle(.white.opacity(0.85))
            DatePicker(label, selection: datum, displayedComponents: .hourAndMinute).labelsHidden().colorScheme(.dark)
        }
        .frame(maxWidth: .infinity)
        .padding(10)
        .background(.white.opacity(0.12), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    private func samenvatting(_ icon: String, _ tekst: String) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: icon).frame(width: 22)
            Text(tekst).fixedSize(horizontal: false, vertical: true)
        }
        .font(AppFont.body(15))
        .foregroundStyle(.white)
    }

    // MARK: Pages

    private var welcome: some View {
        pageLayout(icon: { AppMark(size: 110) },
             title: L("Welkom bij A-Alerts"),
             text: L("Alle P2000-meldingen van brandweer, ambulance, politie en traumaheli in de gemeente Apeldoorn en Teuge – live, op de kaart en met statistieken.")) {
            HStack(spacing: 18) {
                ForEach(Dienst.selectable) { d in
                    VStack(spacing: 6) {
                        DienstIcon(dienst: d, size: 34)
                            .padding(10)
                            .background(.white, in: Circle())
                        Text(d.label).font(AppFont.body(11, .semibold, relativeTo: .caption2)).foregroundStyle(.white)
                    }
                }
            }
        }
    }

    private func bronItem<I: View>(_ titel: String, @ViewBuilder icon: () -> I) -> some View {
        VStack(spacing: 6) {
            icon()
                .padding(10)
                .background(.white, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            Text(titel).font(AppFont.body(11, .semibold, relativeTo: .caption2)).foregroundStyle(.white)
        }
    }

    private var signIn: some View {
        pageLayout(icon: { bubble("icloud.fill") },
             title: L("Al je apparaten in sync"),
             text: L("Log in met Apple om je instellingen en bewaarde meldingen via iCloud op je iPhone, iPad, Mac en Apple Watch gelijk te houden. Inloggen is niet verplicht.")) {
            VStack(spacing: 10) {
                if account.isSignedIn {
                    Label(Lf("Ingelogd als %@", account.displayName), systemImage: "person.crop.circle.badge.checkmark")
                        .font(AppFont.heading(18, relativeTo: .headline))
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
                        Text(error).font(AppFont.body(13, .regular, relativeTo: .footnote)).foregroundStyle(.white.opacity(0.9))
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
                    .font(AppFont.heading(28, relativeTo: .title))
                    .multilineTextAlignment(.center)
                    .foregroundStyle(.white)
                Text(text)
                    .font(AppFont.body(17, .light, relativeTo: .body))
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


/// Chips that wrap to the next line.
struct ChipFlow: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width ?? 360
        var x: CGFloat = 0, y: CGFloat = 0, row: CGFloat = 0, maxX: CGFloat = 0
        for v in subviews {
            let s = v.sizeThatFits(.unspecified)
            if x > 0, x + s.width > width { x = 0; y += row + spacing; row = 0 }
            x += s.width + spacing; row = max(row, s.height); maxX = max(maxX, x - spacing)
        }
        return CGSize(width: min(maxX, width), height: y + row)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX, y = bounds.minY, row: CGFloat = 0
        for v in subviews {
            let s = v.sizeThatFits(.unspecified)
            if x > bounds.minX, x + s.width > bounds.maxX { x = bounds.minX; y += row + spacing; row = 0 }
            v.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(s))
            x += s.width + spacing; row = max(row, s.height)
        }
    }
}
