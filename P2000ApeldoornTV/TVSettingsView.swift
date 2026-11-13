import SwiftUI

struct TVSettingsView: View {
    @Environment(AppSettings.self) private var settings
    @Environment(TVSettings.self) private var tv

    var body: some View {
        @Bindable var tv = tv
        @Bindable var settings = settings
        HStack(alignment: .top, spacing: 60) {
            Form {
                Section(L("Meldkamer")) {
                    Toggle(L("Alarmscherm bij nieuwe melding"), isOn: $tv.alarmScreen)
                    Toggle(L("Alleen bij spoed (A1, P1)"), isOn: $tv.alarmOnlyUrgent).disabled(!tv.alarmScreen)
                    Toggle(L("Alarmgeluid"), isOn: Bindable(InAppAlarm.shared).soundOn)
                    Toggle(L("Geluid alleen bij spoed (A1, P1)"), isOn: Bindable(InAppAlarm.shared).onlyUrgent).disabled(!InAppAlarm.shared.soundOn)
                    Button(L("Geluid testen")) { InAppAlarm.shared.preview(urgent: InAppAlarm.shared.onlyUrgent) }
                    Picker(L("Alarm in beeld"), selection: $tv.alarmSeconds) {
                        Text("10 s").tag(10)
                        Text("15 s").tag(15)
                        Text("30 s").tag(30)
                        Text("60 s").tag(60)
                    }
                    Toggle(L("Kaart gaat zelf langs de meldingen"), isOn: $tv.autoTour)
                    Toggle(L("Scherm altijd aan"), isOn: $tv.keepAwake)
                    Picker(L("Kaart"), selection: $settings.mapType) {
                        Text(L("Standaard")).tag("standard")
                        Text(L("Hybride")).tag("hybrid")
                        Text(L("Satelliet")).tag("satellite")
                    }
                }
                ForEach(KaartLaagGroep.allCases) { groep in
                    Section {
                        ForEach(groep.lagen) { l in
                            Toggle(isOn: Binding(get: { settings.laag(l) }, set: { settings.setLaag(l, $0) })) {
                                Label(l.titel, systemImage: l.systemImage)
                            }
                        }
                    } header: {
                        Text(Lf("Kaartlagen: %@", groep.titel))
                    }
                }
                Section {
                } footer: {
                    Text(L("Wat je op de meldkamerkaart ziet. Gedeeld via iCloud met je andere apparaten."))
                }
                Section {
                    ForEach(Dienst.selectable) { d in
                        Toggle(isOn: Binding(
                            get: { settings.diensten.isEmpty || settings.diensten.contains(d.rawValue) },
                            set: { on in
                                var set = settings.diensten.isEmpty ? Set(Dienst.selectable.map(\.rawValue)) : settings.diensten
                                if on { set.insert(d.rawValue) } else { set.remove(d.rawValue) }
                                settings.diensten = set.count == Dienst.selectable.count ? [] : set
                            })) {
                            Label { Text(d.label) } icon: { DienstIcon(dienst: d, size: 36) }
                        }
                    }
                } header: {
                    Text(L("Disciplines"))
                } footer: {
                    Text(L("Je filters worden via iCloud gedeeld met je iPhone, iPad en Mac."))
                }
            }
            .frame(width: 1000)

            VStack(alignment: .leading, spacing: 20) {
                AppMark(size: 140)
                Text(verbatim: "A-Alerts").font(AppFont.heading(28, relativeTo: .title))
                Text(L("Voor Apple TV: de live meldkamer op een groot scherm. Nieuwe meldingen verschijnen direct met een alarmscherm en op de kaart."))
                    .font(AppFont.heading(18, relativeTo: .headline)).foregroundStyle(.secondary)
                Text(Lf("Versie %@ (%@)", Config.version, Config.build)).foregroundStyle(.secondary)
                Text(verbatim: "a-alerts.nl").font(AppFont.heading(18, relativeTo: .headline))
                Text(L("Bel bij nood altijd 112.")).font(AppFont.heading(18, relativeTo: .headline)).foregroundStyle(Theme.red)
            }
        }
        .padding(.horizontal, 80)
        .padding(.vertical, 40)
    }
}
