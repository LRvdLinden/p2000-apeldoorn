import SwiftUI
import MapKit

/// "Mogelijk verband": other P2000 alerts at the same spot around the same time (phase 4).
struct GerelateerdeMeldingen: View {
    let melding: Melding
    @Environment(MeldingStore.self) private var store
    @Environment(AppSettings.self) private var settings

    var body: some View {
        let list = Verband.gekoppeld(aan: melding, in: store.meldingen)
        if !list.isEmpty {
            VStack(alignment: .leading, spacing: 12) {
                HStack(spacing: 8) {
                    Image(systemName: "link")
                        .foregroundStyle(.secondary)
                    Text(L("Mogelijk verband")).font(AppFont.heading(21))
                }
                ForEach(list) { v in
                    NavigationLink { MeldingDetailView(melding: v.melding) } label: {
                        VStack(alignment: .leading, spacing: 8) {
                            MeldingRow(melding: v.melding, gelezen: settings.isRead(v.melding))
                            FlowChips(items: v.redenen)
                        }
                        .padding(14)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Color.innerCard, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
                Text(L("Deze meldingen vonden rond hetzelfde tijdstip op of vlak bij dezelfde plek plaats, of riepen dezelfde eenheid op. Dat wijst op een mogelijk verband, maar is geen bevestiging dat het om hetzelfde incident gaat."))
                    .font(AppFont.body(12, .regular, relativeTo: .caption))
                    .foregroundStyle(.secondary)
            }
            .padding(20)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.detailCard, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        }
    }
}

/// Small grey capsules ("Zelfde adres", "4 min later").
struct FlowChips: View {
    let items: [String]
    var body: some View {
        ViewThatFits(in: .horizontal) {
            HStack(spacing: 6) { chips }
            VStack(alignment: .leading, spacing: 6) { chips }
        }
    }
    @ViewBuilder private var chips: some View {
        ForEach(items, id: \.self) { s in
            Text(s)
                .font(AppFont.body(11, .medium, relativeTo: .caption2))
                .padding(.horizontal, 8).padding(.vertical, 3)
                .background(Color.secondary.opacity(0.14), in: Capsule())
        }
    }
}

/// Phase 8: the nearest (or named) station for this alert and an estimated driving time. Always an estimate.
struct AanrijtijdKaart: View {
    let melding: Melding
    @State private var schatting: Aanrijtijd.Schatting?
    @State private var loaded = false

    var body: some View {
        Group {
            if let s = schatting {
                VStack(alignment: .leading, spacing: 12) {
                    HStack(spacing: 8) {
                        Image(systemName: "timer").foregroundStyle(.secondary)
                        Text(L("Geschatte aanrijtijd")).font(AppFont.heading(21))
                    }
                    HStack(alignment: .center, spacing: 14) {
                        KazerneIcon(soort: s.kazerne.soort, size: 44)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(s.kazerne.naam).font(AppFont.body(16, .semibold, relativeTo: .callout))
                            Text(s.herkomst).font(AppFont.body(12, .regular, relativeTo: .caption)).foregroundStyle(.secondary)
                        }
                        Spacer()
                        VStack(alignment: .trailing, spacing: 0) {
                            Text(verbatim: "± \(s.minuten)").font(AppFont.heading(32).monospacedDigit())
                            Text(L("min")).font(AppFont.body(12, .regular, relativeTo: .caption)).foregroundStyle(.secondary)
                        }
                    }
                    HStack(spacing: 6) {
                        Label(Lf("%@ km over de weg", s.km.formatted(.number.precision(.fractionLength(1)))), systemImage: "road.lanes")
                        if s.viaRoute { Text(verbatim: "·"); Text(L("route via Apple Kaarten")) }
                    }
                    .font(AppFont.body(12, .regular, relativeTo: .caption))
                    .foregroundStyle(.secondary)
                    Text(L("Dit is altijd een schatting: de rijtijd over de weg vanaf de kazerne of post, zonder rekening te houden met de uitruktijd, zwaailicht en sirene of waar de eenheid op dat moment echt was. De werkelijke aanrijtijd kan flink afwijken."))
                        .font(AppFont.body(12, .regular, relativeTo: .caption))
                        .foregroundStyle(.secondary)
                }
                .padding(20)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Color.detailCard, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            }
        }
        .task(id: melding.guid) {
            guard !loaded else { return }
            loaded = true
            schatting = await Aanrijtijd.schat(voor: melding)
        }
    }
}
