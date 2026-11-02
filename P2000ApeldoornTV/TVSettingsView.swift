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
                Text("P2000 Apeldoorn").font(.title.weight(.black))
                Text(L("Voor Apple TV: de live meldkamer op een groot scherm. Nieuwe meldingen verschijnen direct met een alarmscherm en op de kaart."))
                    .font(.headline).foregroundStyle(.secondary)
                Text(Lf("Versie %@ (%@)", Config.version, Config.build)).foregroundStyle(.secondary)
                Text("p2000-apeldoorn.nl").font(.headline)
                Text(L("Bel bij nood altijd 112.")).font(.headline).foregroundStyle(Theme.red)
            }
        }
        .padding(.horizontal, 80)
        .padding(.vertical, 40)
    }
}
