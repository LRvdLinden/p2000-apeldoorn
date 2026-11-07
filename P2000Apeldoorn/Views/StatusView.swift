import SwiftUI

// Instellingen › Status: the same data as a-alerts.nl/status (from /v1/status), in a native list.

struct AppStatus: Decodable, Sendable {
    let bijgewerkt: String
    let staat: String
    let groepen: [Groep]
    let incidenten: Incidenten

    struct Groep: Decodable, Identifiable, Sendable {
        let id: String
        let naam: String
        let naam_en: String?
        let onderdelen: [Onderdeel]
        var titel: String { isDutch ? naam : (naam_en ?? naam) }
    }
    struct Onderdeel: Decodable, Identifiable, Sendable {
        let id: String
        let naam: String
        let naam_en: String?
        let staat: String
        let detail: String?
        let detail_en: String?
        let uptime: Double?
        var titel: String { isDutch ? naam : (naam_en ?? naam) }
        var uitleg: String? { isDutch ? detail : (detail_en ?? detail) }
    }
    struct Incidenten: Decodable, Sendable {
        let actief: [Incident]
        let gepland: [Incident]
    }
    struct Incident: Decodable, Identifiable, Sendable {
        let id: Int
        let titel: String
        let titel_en: String?
        let soort: String
        let updates: [Update]
        let gepland_start: String?
        var kop: String { isDutch ? titel : (titel_en ?? titel) }
    }
    struct Update: Decodable, Sendable {
        let tekst: String
        let tekst_en: String?
        var regel: String { isDutch ? tekst : (tekst_en ?? tekst) }
    }
}

private var isDutch: Bool { (Locale.preferredLanguages.first ?? "nl").hasPrefix("nl") }

enum StatusKleur {
    static func kleur(_ s: String) -> Color {
        switch s {
        case "ok": Color(hex: 0x16A34A)
        case "warn": Color(hex: 0xF59E0B)
        case "down": Color(hex: 0xDC2626)
        case "maint": Color(hex: 0x3B82F6)
        default: .gray
        }
    }
    /// Darker shade for a coloured background with white text (contrast).
    static func achtergrond(_ s: String) -> Color {
        switch s {
        case "ok": Color(hex: 0x15803D)
        case "warn": Color(hex: 0xB45309)
        case "down": Color(hex: 0xB91C1C)
        case "maint": Color(hex: 0x1D4ED8)
        default: .gray
        }
    }
    static func label(_ s: String) -> String {
        switch s {
        case "ok": L("Werkt")
        case "warn": L("Verstoord")
        case "down": L("Storing")
        case "maint": L("Onderhoud")
        default: L("Onbekend")
        }
    }
    static func kop(_ s: String) -> String {
        switch s {
        case "ok": L("Alle systemen werken")
        case "maint": L("Onderhoud bezig")
        case "down": L("Er is een storing")
        default: L("Niet alles werkt normaal")
        }
    }
}

@MainActor
@Observable
final class StatusStore {
    static let shared = StatusStore()
    private(set) var status: AppStatus?
    private(set) var fout = false
    private(set) var geladen: Date?

    func load(force: Bool = false) async {
        if !force, let geladen, Date.now.timeIntervalSince(geladen) < 60 { return }
        do {
            status = try await P2000API.shared.getJSON("/v1/status", as: AppStatus.self)
            fout = false
        } catch {
            fout = true
        }
        geladen = .now
    }
}

/// The row in Settings with a coloured dot.
struct StatusRij: View {
    @State private var store = StatusStore.shared

    var body: some View {
        NavigationLink {
            StatusView()
        } label: {
            HStack(spacing: 12) {
                Image(systemName: "waveform.path.ecg")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(.white)
                    .frame(width: 28, height: 28)
                    .background(Color.green, in: RoundedRectangle(cornerRadius: 7, style: .continuous))
                Text(L("Status")).foregroundStyle(.primary)
                Spacer(minLength: 8)
                if let s = store.status {
                    Circle().fill(StatusKleur.kleur(s.staat)).frame(width: 10, height: 10)
                    Text(StatusKleur.label(s.staat)).foregroundStyle(.secondary).lineLimit(1)
                }
            }
            .accessibilityElement(children: .combine)
        }
        .task { await store.load() }
    }
}

struct StatusView: View {
    @State private var store = StatusStore.shared

    var body: some View {
        List {
            if let s = store.status {
                Section {
                    VStack(alignment: .leading, spacing: 4) {
                        Label(StatusKleur.kop(s.staat), systemImage: s.staat == "ok" ? "checkmark.circle.fill" : "exclamationmark.circle.fill")
                            .font(.headline)
                            .foregroundStyle(.white)
                        if let inc = s.incidenten.actief.first {
                            Text(inc.kop).font(.subheadline.weight(.semibold)).foregroundStyle(.white)
                            if let u = inc.updates.first { Text(u.regel).font(.subheadline).foregroundStyle(.white.opacity(0.92)) }
                        }
                    }
                    .padding(.vertical, 6)
                    .listRowBackground(StatusKleur.achtergrond(s.staat))
                }
                ForEach(s.groepen) { g in
                    Section(g.titel) {
                        ForEach(g.onderdelen) { o in
                            HStack(spacing: 12) {
                                Circle().fill(StatusKleur.kleur(o.staat)).frame(width: 10, height: 10)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(o.titel)
                                    if let d = o.uitleg { Text(d).font(.caption).foregroundStyle(.secondary) }
                                }
                                Spacer(minLength: 8)
                                Text(StatusKleur.label(o.staat)).foregroundStyle(.secondary)
                            }
                            .accessibilityElement(children: .combine)
                        }
                    }
                }
                if !s.incidenten.gepland.isEmpty {
                    Section(L("Gepland onderhoud")) {
                        ForEach(s.incidenten.gepland) { i in
                            VStack(alignment: .leading, spacing: 2) {
                                Text(i.kop).font(.subheadline.weight(.semibold))
                                if let u = i.updates.first { Text(u.regel).font(.caption).foregroundStyle(.secondary) }
                            }
                        }
                    }
                }
            } else if store.fout {
                ContentUnavailableView(L("Status niet beschikbaar"), systemImage: "wifi.exclamationmark",
                                       description: Text(L("De status kan nu niet worden opgehaald.")))
            } else {
                ProgressView().frame(maxWidth: .infinity)
            }
            Section {
                Link(destination: URL(string: "https://a-alerts.nl/status/")!) {
                    Label(L("Volledige status op a-alerts.nl/status"), systemImage: "arrow.up.right.square")
                }
            } footer: {
                if let t = store.geladen { Text(Lf("Laatst gecontroleerd %@", t.formatted(date: .omitted, time: .shortened))) }
            }
        }
        .navigationTitle(L("Status"))
        .refreshable { await store.load(force: true) }
        .task { await store.load(force: true) }
    }
}
