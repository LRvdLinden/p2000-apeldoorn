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
                Link(destination: Config.feedbackMail) {
                    SettingsRow(icon: "envelope.fill", color: .blue, title: L("Verstuur feedback"), chevron: true)
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
            } header: {
                Text(L("Over deze app"))
            }

            Section {
                Link(destination: Config.website) {
                    SettingsRow(icon: "globe", color: .red, title: "p2000-apeldoorn.nl", chevron: true)
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
                        Text(account.displayName).font(.headline)
                        if let email = account.email, email != account.displayName {
                            Text(email).font(.caption).foregroundStyle(.secondary)
                        }
                        Label(L("Gesynchroniseerd via iCloud"), systemImage: "icloud.fill")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                .padding(.vertical, 4)
                Button(L("Uitloggen")) { account.signOut() }
                Button(L("Account verwijderen"), role: .destructive) { confirmDelete = true }
            } else {
                VStack(alignment: .leading, spacing: 10) {
                    Text(L("Log in met Apple om je instellingen en bewaarde meldingen op al je apparaten gelijk te houden."))
                        .font(.callout)
                        .foregroundStyle(.secondary)
                    SignInWithAppleButton(.signIn) { request in
                        account.configure(request)
                    } onCompletion: { result in
                        signInError = account.handle(result)
                    }
                    .frame(height: 46)
                    .signInWithAppleButtonStyle(.black)
                    if let signInError {
                        Text(signInError).font(.caption).foregroundStyle(.red)
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
        .font(.caption)
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

    var body: some View {
        List {
            Section {
                ForEach(options, id: \.self) { option in
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
            } footer: {
                Text(footer)
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
                    MultiSelectView(title: L("Plaatsen"), options: Config.plaatsen, selection: $settings.plaatsen)
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
            if settings.listFilterActive {
                Section {
                    Button(L("Wis alle filters"), role: .destructive) {
                        settings.diensten = []
                        settings.plaatsen = []
                        settings.prioriteiten = []
                        settings.radiusEnabled = false
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
    @State private var denied = false
    @State private var testState: TestState = .idle

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
                Section {
                    NavigationLink {
                        MultiSelectView(title: L("Plaatsen"), options: Config.plaatsen, selection: $settings.notifPlaatsen,
                                        footer: L("Kies je plaatsen voor notificaties. Niets geselecteerd = alle plaatsen."))
                    } label: {
                        LabeledContent(L("Plaatsen"), value: AppSettings.summary(settings.notifPlaatsen) { $0 })
                    }
                    NavigationLink {
                        MultiSelectView(title: L("Disciplines"), options: Dienst.selectable.map(\.rawValue),
                                        label: { Dienst(rawValue: $0)?.label ?? $0 }, selection: $settings.notifDiensten,
                                        icon: { Dienst(rawValue: $0) })
                    } label: {
                        LabeledContent(L("Disciplines"), value: AppSettings.summary(settings.notifDiensten) { Dienst(rawValue: $0)?.label ?? $0 })
                    }
                    NavigationLink {
                        MultiSelectView(title: L("Prioriteit"), options: Config.prioriteiten, selection: $settings.notifPrioriteiten)
                    } label: {
                        LabeledContent(L("Prioriteit"), value: AppSettings.summary(settings.notifPrioriteiten) { $0 })
                    }
                    NavigationLink {
                        RadiusSettingsView()
                    } label: {
                        LabeledContent(L("Mijn buurt"), value: settings.radiusEnabled ? Lf("%@ km", settings.radiusKm.formatted(.number.precision(.fractionLength(0...1)))) : L("Uit"))
                    }
                } header: {
                    Text(L("Waarvoor"))
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
                            testState = await PushManager.sendTest() ? .sent : .failed
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
                    if testState == .failed {
                        Text(L("De testmelding kon niet worden verstuurd. Controleer je internetverbinding en probeer het later opnieuw."))
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
