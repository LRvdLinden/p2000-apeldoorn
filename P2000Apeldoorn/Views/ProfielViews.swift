import SwiftUI

/// "Profielen" section in Notificaties (phase 7): up to five profiles, each with its own choices and times.
struct ProfielenSection: View {
    @Environment(AppSettings.self) private var settings

    var body: some View {
        @Bindable var settings = settings
        Section {
            ForEach($settings.profielen) { $p in
                NavigationLink {
                    ProfielEditView(profiel: $p)
                } label: {
                    HStack(spacing: 12) {
                        Image(systemName: p.actief ? "bell.badge.fill" : "bell.slash")
                            .foregroundStyle(p.actief ? Theme.red : .secondary)
                            .frame(width: 26)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(p.naam).font(AppFont.body(16, .semibold, relativeTo: .callout))
                            Text(p.samenvatting).font(AppFont.body(12, .regular, relativeTo: .caption)).foregroundStyle(.secondary).lineLimit(1)
                            Text(p.tijdSamenvatting).font(AppFont.body(12, .regular, relativeTo: .caption)).foregroundStyle(.secondary)
                        }
                    }
                    .opacity(p.actief ? 1 : 0.55)
                }
            }
            .onDelete { idx in
                guard settings.profielen.count - idx.count >= 1 else { return }
                settings.profielen.remove(atOffsets: idx)
            }
            .onMove { from, to in settings.profielen.move(fromOffsets: from, toOffset: to) }

            if settings.profielen.count < MeldingProfiel.maximum {
                Button {
                    var p = MeldingProfiel(naam: Lf("Profiel %lld", settings.profielen.count + 1))
                    p.nlalert = false
                    p.knmi = []
                    settings.profielen.append(p)
                } label: {
                    Label(L("Profiel toevoegen"), systemImage: "plus.circle.fill")
                }
            }
        } header: {
            Text(L("Profielen"))
        } footer: {
            Text(Lf("Maak tot %lld profielen, bijvoorbeeld 'Thuis' met alleen je eigen dorp en 'Nacht' met alleen A1 en P1. Je krijgt een pushmelding als minstens één actief profiel past. Veeg naar links om een profiel te verwijderen.", MeldingProfiel.maximum))
        }
    }
}

struct ProfielEditView: View {
    @Binding var profiel: MeldingProfiel

    var body: some View {
        Form {
            Section {
                TextField(L("Naam"), text: $profiel.naam)
                Toggle(L("Actief"), isOn: $profiel.actief)
            }
            Section {
                NavigationLink {
                    MultiSelectView(title: L("Plaatsen"), options: Config.plaatsen, selection: $profiel.plaatsen,
                                    footer: L("Kies je plaatsen voor dit profiel. Niets geselecteerd = alle plaatsen."),
                                    groups: Config.plaatsGroepen)
                } label: {
                    LabeledContent(L("Plaatsen"), value: AppSettings.summary(profiel.plaatsen) { $0 })
                }
                NavigationLink {
                    MultiSelectView(title: L("Disciplines"), options: Dienst.selectable.map(\.rawValue),
                                    label: { Dienst(rawValue: $0)?.label ?? $0 }, selection: $profiel.diensten,
                                    icon: { Dienst(rawValue: $0) })
                } label: {
                    LabeledContent(L("Disciplines"), value: AppSettings.summary(profiel.diensten) { Dienst(rawValue: $0)?.label ?? $0 })
                }
                NavigationLink {
                    MultiSelectView(title: L("Prioriteit"), options: Config.prioriteiten, selection: $profiel.prioriteiten)
                } label: {
                    LabeledContent(L("Prioriteit"), value: AppSettings.summary(profiel.prioriteiten) { $0 })
                }
            } header: {
                Text(L("P2000-meldingen"))
            }
            Section {
                Toggle(isOn: $profiel.nlalert) { Label { Text(verbatim: "NL-Alert") } icon: { WaarschuwingBronIcon(bron: .nlalert) } }
                Toggle(isOn: $profiel.burgernet) { Label { Text(verbatim: "Burgernet") } icon: { WaarschuwingBronIcon(bron: .burgernet) } }
                ForEach(["yellow", "orange", "red"], id: \.self) { code in
                    Toggle(isOn: Binding(get: { profiel.knmi.contains(code) }, set: { on in
                        if on { profiel.knmi.insert(code) } else { profiel.knmi.remove(code) }
                    })) {
                        HStack(spacing: 10) {
                            Circle().fill(knmiKleur(code)).frame(width: 14, height: 14)
                            Text(knmiLabel(code))
                        }
                    }
                }
            } header: {
                Text(L("Waarschuwingen"))
            } footer: {
                Text(L("NL-Alert, Burgernet en KNMI-weerwaarschuwingen voor de plaatsen van dit profiel."))
            }
            Section {
                Toggle(L("Altijd"), isOn: $profiel.altijd)
                if !profiel.altijd {
                    DatePicker(L("Van"), selection: timeBinding($profiel.van), displayedComponents: .hourAndMinute)
                    DatePicker(L("Tot"), selection: timeBinding($profiel.tot), displayedComponents: .hourAndMinute)
                    HStack(spacing: 6) {
                        ForEach(1...7, id: \.self) { d in
                            let on = profiel.dagen.contains(d)
                            Button {
                                if on { if profiel.dagen.count > 1 { profiel.dagen.remove(d) } } else { profiel.dagen.insert(d) }
                            } label: {
                                Text(MeldingProfiel.dagKort(d))
                                    .font(AppFont.body(13, .semibold, relativeTo: .footnote))
                                    .frame(maxWidth: .infinity, minHeight: 34)
                                    .background(on ? Theme.red : Color.secondary.opacity(0.12), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                                    .foregroundStyle(on ? Color.white : Color.primary)
                            }
                            .buttonStyle(.plain)
                            .accessibilityValue(on ? L("Aan") : L("Uit"))
                        }
                    }
                }
            } header: {
                Text(L("Tijden"))
            } footer: {
                Text(profiel.altijd ? L("Dit profiel geldt de hele dag. De stille modus geldt voor alle profielen samen.")
                     : L("Dit profiel geldt alleen tussen deze tijden op de gekozen dagen. Loopt de tijd over middernacht, dan telt de dag waarop hij begint."))
            }
        }
        .formStyle(.grouped)
        .navigationTitle(profiel.naam.isEmpty ? L("Profiel") : profiel.naam)
    }

    private func knmiLabel(_ c: String) -> String {
        c == "yellow" ? L("KNMI code geel") : c == "orange" ? L("KNMI code oranje") : L("KNMI code rood")
    }
    private func knmiKleur(_ c: String) -> Color {
        c == "yellow" ? Color(hex: 0xFFD500) : c == "orange" ? Color(hex: 0xFF8A00) : Color(hex: 0xE30613)
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

/// Small source icon for NL-Alert / Burgernet rows.
struct WaarschuwingBronIcon: View {
    let bron: Waarschuwing.Bron
    var body: some View {
        BronIcoon(bron: bron, size: 24)
    }
}
