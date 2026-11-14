import SwiftUI
import AuthenticationServices
import StoreKit

struct SettingsView: View {
    @Environment(AppSettings.self) private var settings
    @Environment(AccountManager.self) private var account
    @Environment(AppLock.self) private var lock
    @Environment(LocationManager.self) private var location
    @Environment(\.requestReview) private var requestReview
    @Environment(\.openURL) private var openURL

    @State private var signInError: String?
    @State private var confirmDelete = false

    var body: some View {
        @Bindable var settings = settings
        Form {
            accountSection

            Section {
                NavigationLink {
                    NotificationSettingsView()
                } label: {
                    SettingsRow(icon: "bell.badge.fill", color: .red, title: L("Notificaties"),
                                value: settings.notificationsEnabled ? L("Aan") : L("Uit"))
                }
                NavigationLink {
                    WaarschuwingenOverzichtView()
                } label: {
                    SettingsRow(icon: "exclamationmark.triangle.fill", color: .orange, title: L("Waarschuwingen"),
                                value: [settings.pushAan(.nlalert) ? "NL-Alert" : nil, settings.pushAan(.burgernet) ? "Burgernet" : nil,
                                        settings.pushAan(.knmi) ? "KNMI" : nil, settings.pushAan(.amber) ? "AMBER" : nil, settings.pushAan(.vnog) ? "VNOG" : nil].compactMap { $0 }.joined(separator: ", "))
                }
                Toggle(isOn: Bindable(InAppAlarm.shared).soundOn) {
                    SettingsRow(icon: "speaker.wave.2.fill", color: .pink, title: L("Alarmgeluid in de app"))
                }
                if InAppAlarm.shared.soundOn {
                    Picker(selection: Bindable(InAppAlarm.shared).onlyUrgent) {
                        Text(L("Alle meldingen")).tag(false)
                        Text(L("Alleen spoed (A1, P1)")).tag(true)
                    } label: {
                        SettingsRow(icon: "exclamationmark.triangle.fill", color: .orange, title: L("Alarm bij"))
                    }
                    Button {
                        InAppAlarm.shared.preview(urgent: InAppAlarm.shared.onlyUrgent)
                    } label: {
                        SettingsRow(icon: "play.circle.fill", color: .gray, title: L("Geluid testen"))
                    }
                    .buttonStyle(.plain)
                }
            } header: {
                Text(L("Meldingen"))
            } footer: {
                Text(L("Het alarmgeluid klinkt als er een nieuwe melding binnenkomt terwijl de app open is. Het volgt je filters en de stille modus. Op iPhone volgt het ook de stilschakelaar."))
            }

            Section {
                NavigationLink {
                    MultiSelectView(title: L("Disciplines"), options: Dienst.selectable.map(\.rawValue),
                                    label: { Dienst(rawValue: $0)?.label ?? $0 }, selection: $settings.diensten,
                                    icon: { Dienst(rawValue: $0) })
                } label: {
                    SettingsRow(icon: "cross.case.fill", color: .orange, title: L("Disciplines"),
                                value: AppSettings.summary(settings.diensten) { Dienst(rawValue: $0)?.label ?? $0 })
                }
                NavigationLink {
                    FilterSettingsView(isSheet: false)
                } label: {
                    SettingsRow(icon: "line.3.horizontal.decrease", color: .blue, title: L("Filteren"),
                                value: settings.listFilterActive ? L("Aan") : L("Uit"))
                }
                NavigationLink {
                    VolgCapcodesView()
                } label: {
                    SettingsRow(icon: "star.fill", color: .yellow, title: L("Gevolgde capcodes"),
                                value: settings.volgCapcodes.isEmpty ? L("Geen") : "\(settings.volgCapcodes.count)")
                }
            } header: {
                Text(L("Disciplines"))
            } footer: {
                Text(L("Let op: niet alle meldingen van politie en ambulance staan in de app, omdat deze niet altijd via het P2000-netwerk worden verstuurd."))
            }

            Section {
                NavigationLink {
                    RadiusSettingsView()
                } label: {
                    SettingsRow(icon: "scope", color: .red, title: L("Mijn buurt"),
                                value: settings.radiusEnabled ? Lf("%@ km", settings.radiusKm.formatted(.number.precision(.fractionLength(0...1)))) : L("Uit"))
                }
                Toggle(isOn: Binding(get: { settings.useLocation }, set: { on in
                    settings.useLocation = on
                    if on { location.start() } else { location.stop() }
                })) {
                    SettingsRow(icon: "location.fill", color: .blue, title: L("Afstand tonen"))
                }
            } header: {
                Text(L("Locatie"))
            } footer: {
                Text(L("Met 'Mijn buurt' zie je alleen meldingen binnen een straal rond je locatie of een vast punt, ook voor pushmeldingen. Je locatie blijft op je apparaat en wordt alleen afgerond gedeeld voor de radius van je pushmeldingen."))
            }

            Section {
                Picker(selection: $settings.appearance) {
                    Text(L("Systeem")).tag("systeem")
                    Text(L("Licht")).tag("licht")
                    Text(L("Donker")).tag("donker")
                } label: {
                    SettingsRow(icon: "moon.fill", color: .indigo, title: L("Donkere modus"))
                }
                Picker(selection: $settings.mapType) {
                    Text(L("Standaard")).tag("standard")
                    Text(L("Satelliet")).tag("satellite")
                    Text(L("Hybride")).tag("hybrid")
                } label: {
                    SettingsRow(icon: "map.fill", color: .green, title: L("Kaarttype"))
                }
                Picker(selection: $settings.kaartThema) {
                    Text(L("Licht")).tag("licht")
                    Text(L("Donker")).tag("donker")
                    Text(L("Automatisch")).tag("auto")
                } label: {
                    SettingsRow(icon: "circle.lefthalf.filled", color: .teal, title: L("Kaartkleuren"))
                }
                NavigationLink {
                    KaartWeergaveView()
                } label: {
                    SettingsRow(icon: "slider.horizontal.3", color: .orange, title: L("Kaart en helikopters"))
                }
                Toggle(isOn: $settings.groupByDay) {
                    SettingsRow(icon: "calendar", color: .red, title: L("Meldingen groeperen per dag"))
                }
                Toggle(isOn: $settings.hideRead) {
                    SettingsRow(icon: "eye.slash.fill", color: .gray, title: L("Verberg bekeken meldingen"))
                }
            } header: {
                Text(L("Uiterlijk"))
            }

            if lock.isAvailable {
                Section {
                    Toggle(isOn: Binding(get: { settings.appLock }, set: { on in
                        if on { Task { _ = await lock.enable() } } else { lock.disable() }
                    })) {
                        SettingsRow(icon: "lock.fill", color: .gray, title: Lf("Vergrendel met %@", lock.biometryName))
                    }
                } header: {
                    Text(L("Beveiliging"))
                } footer: {
                    Text(L("De app vraagt bij het openen direct om te ontgrendelen."))
                }
            }

            Section {
                Button {
                    writeReview()
                } label: {
                    SettingsRow(icon: "star.fill", color: .red, title: L("Schrijf een recensie"), chevron: true)
                }
                StatusRij()
                #if os(iOS)
                if UIApplication.shared.supportsAlternateIcons {
                    NavigationLink {
                        AppIcoonKeuze()
                    } label: {
                        SettingsRow(icon: "app.badge.fill", color: .red, title: L("App-icoon"))
                    }
                }
                #endif
                NavigationLink {
                    ContentPageView(name: "hulp", title: L("Hulp en veelgestelde vragen"))
                } label: {
                    SettingsRow(icon: "questionmark.circle.fill", color: .teal, title: L("Hulp en veelgestelde vragen"))
                }
                NavigationLink {
                    ChangelogView()
                } label: {
                    SettingsRow(icon: "sparkles", color: .purple, title: L("Changelog"))
                }
                NavigationLink {
                    ContentPageView(name: "terms", title: L("Gebruiksvoorwaarden"))
                } label: {
                    SettingsRow(icon: "doc.text.fill", color: .gray, title: L("Gebruiksvoorwaarden"))
                }
                NavigationLink {
                    ContentPageView(name: "privacy", title: L("Privacyverklaring"))
                } label: {
                    SettingsRow(icon: "hand.raised.fill", color: .blue, title: L("Privacyverklaring"))
                }
                NavigationLink {
                    ContentPageView(name: "disclaimer", title: L("Disclaimer"))
                } label: {
                    SettingsRow(icon: "exclamationmark.shield.fill", color: .orange, title: L("Disclaimer"))
                }
                ToestelIDRow()
            } header: {
                Text(L("Over deze app"))
            } footer: {
                Text(L("Heb je een vraag of werkt iets niet? Geef dit toestel-ID door, dan kunnen we jouw toestel terugvinden. Er staat geen naam of telefoonnummer in."))
            }

            Section {
                Link(destination: Config.website) {
                    SettingsRow(icon: "globe", color: .red, title: "a-alerts.nl", chevron: true)
                }
                Link(destination: Config.whatsapp) {
                    SettingsRow(icon: "message.fill", color: Color(hex: 0x25D366), title: L("WhatsApp-groep"), chevron: true)
                }
            } header: {
                Text(L("Volg ons"))
            }

            Section {
                MoreAppsCard()
                    .listRowInsets(EdgeInsets())
                    .listRowBackground(Color.clear)
            } header: {
                Text(MoreAppsText.current.section)
            }

            Section {
                footer
                    .listRowBackground(Color.clear)
            }
        }
        .formStyle(.grouped)
        .navigationTitle(L("Instellingen"))
        .alert(L("Account verwijderen?"), isPresented: $confirmDelete) {
            Button(L("Verwijderen"), role: .destructive) { deleteAccount() }
            Button(L("Annuleren"), role: .cancel) {}
        } message: {
            Text(L("Je Apple-koppeling, instellingen en bewaarde meldingen worden van al je apparaten verwijderd. Dit kan niet ongedaan worden gemaakt."))
        }
    }

    // MARK: Account

    @ViewBuilder
    private var accountSection: some View {
        Section {
            if account.isSignedIn {
                HStack(spacing: 12) {
                    Image(systemName: "person.crop.circle.fill")
                        .font(.system(size: 40))
                        .foregroundStyle(Theme.red)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(account.displayName).font(AppFont.heading(18, relativeTo: .headline))
                        if let email = account.email, email != account.displayName {
                            Text(email).font(AppFont.body(12, .regular, relativeTo: .caption)).foregroundStyle(.secondary)
                        }
                        Label(L("Gesynchroniseerd via iCloud"), systemImage: "icloud.fill")
                            .font(AppFont.body(12, .regular, relativeTo: .caption))
                            .foregroundStyle(.secondary)
                    }
                }
                .padding(.vertical, 4)
                Button(L("Uitloggen")) { account.signOut() }
                Button(L("Account verwijderen"), role: .destructive) { confirmDelete = true }
            } else {
                VStack(alignment: .leading, spacing: 10) {
                    Text(L("Log in met Apple om je instellingen en bewaarde meldingen op al je apparaten gelijk te houden."))
                        .font(AppFont.body(16, .light, relativeTo: .callout))
                        .foregroundStyle(.secondary)
                    SignInWithAppleButton(.signIn) { request in
                        account.configure(request)
                    } onCompletion: { result in
                        signInError = account.handle(result)
                    }
                    .frame(height: 46)
                    .signInWithAppleButtonStyle(.black)
                    if let signInError {
                        Text(signInError).font(AppFont.body(12, .regular, relativeTo: .caption)).foregroundStyle(.red)
                    }
                }
                .padding(.vertical, 4)
            }
        } header: {
            Text(L("Account"))
        }
    }

    private func deleteAccount() {
        account.signOut()
        settings.resetAll()
        settings.onboardingDone = true
        lock.disable()
    }

    private func writeReview() {
        if !Config.appStoreID.isEmpty,
           let url = URL(string: "https://apps.apple.com/app/id\(Config.appStoreID)?action=write-review") {
            openURL(url)
        } else {
            requestReview()
        }
    }

    private var footer: some View {
        VStack(spacing: 6) {
            AppMark(size: 40)
            Text(verbatim: "© \(Calendar.current.component(.year, from: .now)) A-Alerts. All rights reserved.")
            HStack(spacing: 4) {
                Text(L("Made & Powered by"))
                Link("PixelForges", destination: Config.pixelForges)
            }
            Text(Lf("Versie %@ (%@)", Config.version, Config.build))
            Link(L("Bron: p2000.page"), destination: Config.source)
        }
        .font(AppFont.body(12, .regular, relativeTo: .caption))
        .foregroundStyle(.secondary)
        .frame(maxWidth: .infinity)
        .multilineTextAlignment(.center)
    }
}

// MARK: - Rows

struct SettingsRow: View {
    let icon: String
    let color: Color
    let title: String
    var value: String? = nil
    var chevron = false

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(.white)
                .frame(width: 28, height: 28)
                .background(color, in: RoundedRectangle(cornerRadius: 7, style: .continuous))
            Text(title).foregroundStyle(.primary)
            Spacer(minLength: 8)
            if let value {
                Text(value).foregroundStyle(.secondary).lineLimit(1)
            }
            if chevron {
                Image(systemName: "arrow.up.right").font(.caption.weight(.semibold)).foregroundStyle(.tertiary)
            }
        }
    }
}

/// Multi-select list (empty selection = everything), like the website's pickers.
struct MultiSelectView: View {
    let title: String
    let options: [String]
    var label: (String) -> String = { $0 }
    @Binding var selection: Set<String>
    var icon: ((String) -> Dienst?)? = nil
    var footer: String = L("Tip: niets geselecteerd = alles tonen")
    /// Optional grouping (e.g. "Plaatsen en dorpen" and "Buurtschappen"); the footer goes under the last group.
    var groups: [(titel: String, opties: [String])]? = nil

    var body: some View {
        List {
            if let groups {
                ForEach(Array(groups.enumerated()), id: \.offset) { index, group in
                    Section {
                        rows(group.opties)
                    } header: {
                        Text(group.titel)
                    } footer: {
                        if index == groups.count - 1 { Text(footer) }
                    }
                }
            } else {
                Section {
                    rows(options)
                } footer: {
                    Text(footer)
                }
            }
        }
        .navigationTitle(title)
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button(selection.count == options.count ? L("Deselecteer alles") : L("Selecteer alles")) {
                    selection = selection.count == options.count ? [] : Set(options)
                }
            }
        }
    }
}

extension MultiSelectView {
    @ViewBuilder
    fileprivate func rows(_ list: [String]) -> some View {
        ForEach(list, id: \.self) { option in
            Button {
                if selection.contains(option) { selection.remove(option) } else { selection.insert(option) }
            } label: {
                HStack(spacing: 12) {
                    if let d = icon?(option) { DienstIcon(dienst: d, size: 26) }
                    Text(label(option)).foregroundStyle(.primary)
                    Spacer()
                    if selection.contains(option) {
                        Image(systemName: "checkmark").foregroundStyle(Theme.red).fontWeight(.semibold)
                    }
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        }
    }
}

// MARK: - Filters

struct FilterSettingsView: View {
    @Environment(AppSettings.self) private var settings
    @Environment(\.dismiss) private var dismiss
    var isSheet: Bool

    var body: some View {
        @Bindable var settings = settings
        Form {
            Section {
                ForEach(Dienst.selectable) { d in
                    Toggle(isOn: Binding(get: { settings.diensten.contains(d.rawValue) }, set: { on in
                        if on { settings.diensten.insert(d.rawValue) } else { settings.diensten.remove(d.rawValue) }
                    })) {
                        HStack(spacing: 10) { DienstIcon(dienst: d, size: 24); Text(d.label) }
                    }
                }
            } header: {
                Text(L("Disciplines"))
            } footer: {
                Text(L("Niets aan = alle disciplines."))
            }
            Section {
                NavigationLink {
                    MultiSelectView(title: L("Plaatsen"), options: Config.plaatsen, selection: $settings.plaatsen,
                                    footer: L("Niets geselecteerd = alle plaatsen. Buurtschappen herken je aan de straat van de melding; meldingen zonder straat staan onder de plaats zelf."),
                                    groups: Config.plaatsGroepen)
                } label: {
                    LabeledContent(L("Plaatsen"), value: AppSettings.summary(settings.plaatsen) { $0 })
                }
                NavigationLink {
                    MultiSelectView(title: L("Prioriteit"), options: Config.prioriteiten, selection: $settings.prioriteiten)
                } label: {
                    LabeledContent(L("Prioriteit"), value: AppSettings.summary(settings.prioriteiten) { $0 })
                }
            } header: {
                Text(L("Filter op"))
            }
            Section {
                NavigationLink {
                    RadiusSettingsView()
                } label: {
                    LabeledContent(L("Mijn buurt"), value: settings.radiusEnabled ? Lf("%@ km", settings.radiusKm.formatted(.number.precision(.fractionLength(0...1)))) : L("Uit"))
                }
            }
            WaarschuwingFilterSection()
            if settings.listFilterActive {
                Section {
                    Button(L("Wis alle filters"), role: .destructive) {
                        settings.diensten = []
                        settings.plaatsen = []
                        settings.prioriteiten = []
                        settings.radiusEnabled = false
                        settings.waarschuwingFilter = []
                    }
                }
            }
        }
        .formStyle(.grouped)
        .navigationTitle(L("Filteren"))
        .toolbar {
            if isSheet {
                ToolbarItem(placement: .confirmationAction) {
                    Button(L("Klaar")) { dismiss() }
                }
            }
        }
    }
}

// MARK: - Notifications

struct NotificationSettingsView: View {
    @Environment(AppSettings.self) private var settings

    private var waarschuwingSummary: String {
        var parts: [String] = []
        if settings.pushNLAlert { parts.append("NL-Alert") }
        if settings.pushBurgernet { parts.append("Burgernet") }
        if !settings.pushKnmi.isEmpty { parts.append("KNMI") }
        return parts.isEmpty ? L("Uit") : parts.joined(separator: ", ")
    }
    @State private var denied = false
    @State private var testState: TestState = .idle
    @State private var testFout: String?
    @State private var diagnose: String?

    enum TestState { case idle, sending, sent, failed }

    var body: some View {
        @Bindable var settings = settings
        Form {
            Section {
                Toggle(isOn: Binding(get: { settings.notificationsEnabled }, set: { on in
                    if on {
                        PushManager.enable { granted in denied = !granted }
                    } else {
                        PushManager.disable()
                    }
                })) {
                    SettingsRow(icon: "bell.fill", color: .red, title: L("Pushmeldingen"))
                }
            } footer: {
                if denied {
                    Text(L("Notificaties zijn geweigerd. Zet ze aan via Instellingen › Notificaties › A-Alerts."))
                        .foregroundStyle(.red)
                } else {
                    Text(L("Je krijgt een pushmelding zodra er een nieuwe melding is die bij je keuzes past."))
                }
            }

            if settings.notificationsEnabled {
                MeldingenUitBanner()
                    .listRowInsets(EdgeInsets())
                    .listRowBackground(Color.clear)
                ProfielenSection()
                GrootIncidentSection()

                // Tab Nieuws: liveblog messages from A-Alerts (on) and new police news (off).
                Section {
                    Toggle(isOn: $settings.pushNieuwsLiveblog) {
                        SettingsRow(icon: "dot.radiowaves.left.and.right", color: .red, title: L("Liveblogs"))
                    }
                    Toggle(isOn: $settings.pushNieuwsPolitie) {
                        SettingsRow(icon: "newspaper.fill", color: .blue, title: L("Politienieuws"))
                    }
                    Toggle(isOn: $settings.pushNieuwsRegio) {
                        SettingsRow(icon: "light.beacon.max.fill", color: .red, title: "112 Nieuws")
                    }
                } header: {
                    Text(L("Nieuws"))
                } footer: {
                    Text(L("Liveblogs: een pushmelding als A-Alerts een bericht toevoegt aan een liveblog van een melding die je volgt. Politienieuws: nieuwe berichten van de politie over je plaatsen. 112 Nieuws: nieuwe artikelen van 112nieuws.net over je plaatsen."))
                }

                Section {
                    NavigationLink {
                        RadiusSettingsView()
                    } label: {
                        LabeledContent(L("Mijn buurt"), value: settings.radiusEnabled ? Lf("%@ km", settings.radiusKm.formatted(.number.precision(.fractionLength(0...1)))) : L("Uit"))
                    }
                } footer: {
                    Text(L("Met Mijn buurt krijg je voor alle profielen alleen meldingen binnen de gekozen afstand."))
                }

                Section {
                    Toggle(isOn: $settings.quietMode) {
                        SettingsRow(icon: "moon.zzz.fill", color: .indigo, title: L("Stille modus"))
                    }
                    if settings.quietMode {
                        DatePicker(L("Van"), selection: timeBinding($settings.quietFrom), displayedComponents: .hourAndMinute)
                        DatePicker(L("Tot"), selection: timeBinding($settings.quietTo), displayedComponents: .hourAndMinute)
                    }
                    Toggle(isOn: $settings.criticalAlerts) {
                        SettingsRow(icon: "exclamationmark.triangle.fill", color: .red, title: L("Kritieke meldingen"))
                    }
                } header: {
                    Text(L("Stille modus"))
                } footer: {
                    Text(L("Zet de stille modus aan om in het ingestelde tijdsblok geen pushmeldingen te krijgen. Met 'Kritieke meldingen' komen A1- en P1-meldingen ook in de stille modus door."))
                }

                Section {
                    Button {
                        Task {
                            testState = .sending
                            testFout = await PushManager.sendTest()
                            diagnose = await PushManager.diagnose()
                            testState = testFout == nil ? .sent : .failed
                        }
                    } label: {
                        HStack {
                            SettingsRow(icon: "paperplane.fill", color: .blue, title: L("Stuur een testmelding"))
                            if testState == .sending { ProgressView() }
                            if testState == .sent { Image(systemName: "checkmark.circle.fill").foregroundStyle(.green) }
                            if testState == .failed { Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(.orange) }
                        }
                    }
                    .buttonStyle(.plain)
                    .disabled(testState == .sending)
                } footer: {
                  VStack(alignment: .leading, spacing: 4) {
                    if let diagnose, testState != .idle, testState != .sending {
                        Text(diagnose).font(.caption.monospaced())
                    }
                    if testState == .failed {
                        Text(testFout ?? L("De testmelding kon niet worden verstuurd. Controleer je internetverbinding en probeer het later opnieuw."))
                    } else if testState == .sent {
                        Text(L("Verstuurd. Zie je niets binnen een halve minuut? Kijk dan bij Instellingen › Meldingen › A-Alerts of meldingen en banners aanstaan, en of een focus aanstaat."))
                    }
                  }
                }
            }
        }
        .formStyle(.grouped)
        .navigationTitle(L("Notificaties"))
    }

    private func timeBinding(_ minutes: Binding<Int>) -> Binding<Date> {
        Binding {
            Calendar.current.date(bySettingHour: minutes.wrappedValue / 60, minute: minutes.wrappedValue % 60, second: 0, of: .now) ?? .now
        } set: { date in
            let c = Calendar.current.dateComponents([.hour, .minute], from: date)
            minutes.wrappedValue = (c.hour ?? 0) * 60 + (c.minute ?? 0)
        }
    }
}


/// Followed capcodes (star in an alert): push and list also outside places, radius and profiles.
struct VolgCapcodesView: View {
    @Environment(AppSettings.self) private var settings

    var body: some View {
        List {
            if settings.volgCapcodes.isEmpty {
                ContentUnavailableView(L("Nog geen capcodes gevolgd"), systemImage: "star",
                                       description: Text(L("Open een melding en tik bij Capcodes op de ster van een eenheid, bijvoorbeeld je eigen kazerne.")))
                    .listRowBackground(Color.clear)
            } else {
                Section {
                    ForEach(settings.volgCapcodes.sorted { $0.value < $1.value }, id: \.key) { code, naam in
                        VStack(alignment: .leading, spacing: 2) {
                            Text(naam).font(AppFont.body(15, .medium))
                            Text(code).font(.system(size: 13, weight: .semibold, design: .monospaced)).foregroundStyle(.secondary)
                        }
                        .swipeActions {
                            Button(L("Niet meer volgen"), role: .destructive) { settings.volgCapcodes[code] = nil }
                        }
                    }
                } footer: {
                    Text(L("Je krijgt een melding en ziet de melding in de lijst als een van deze capcodes wordt opgeroepen, ook buiten je plaatsen, straal en profielen. De stille modus geldt wel."))
                }
            }
        }
        .navigationTitle(L("Gevolgde capcodes"))
    }
}
