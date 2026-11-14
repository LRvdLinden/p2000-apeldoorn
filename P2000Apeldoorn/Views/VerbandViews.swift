import SwiftUI
import MapKit

/// "Mogelijk verband": other P2000 alerts at the same spot around the same time (phase 4).
struct GerelateerdeMeldingen: View {
    let melding: Melding
    @Environment(MeldingStore.self) private var store
    @Environment(AppSettings.self) private var settings

    var body: some View {
        let list = Verband.gekoppeld(aan: melding, in: store.metVerloop)
        if !list.isEmpty {
            VStack(alignment: .leading, spacing: 12) {
                HStack(spacing: 8) {
                    Image(systemName: "link")
                        .foregroundStyle(.secondary)
                    Text(L("Mogelijk verband")).font(AppFont.heading(18))
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
                        Text(L("Geschatte aanrijtijd")).font(AppFont.heading(18))
                    }
                    HStack(alignment: .center, spacing: 14) {
                        KazerneIcon(soort: s.kazerne.soort, size: 44)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(s.kazerne.naam).font(AppFont.body(16, .semibold, relativeTo: .callout))
                            Text(s.herkomst).font(AppFont.body(12, .regular, relativeTo: .caption)).foregroundStyle(.secondary)
                        }
                        Spacer()
                        VStack(alignment: .trailing, spacing: 0) {
                            Text(verbatim: "± \(s.minuten)").font(AppFont.heading(26).monospacedDigit())
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

/// "Gealarmeerde kazernes": the stations named in the call-out with distance, driving time and an estimated status.
struct GealarmeerdeKazernesKaart: View {
    let routes: [KazerneRoute]

    var body: some View {
        if !routes.isEmpty {
            let genoemd = routes.first?.genoemd ?? false
            VStack(alignment: .leading, spacing: 10) {
                Text(genoemd ? Lf("Gealarmeerde kazernes (%lld)", routes.count) : L("Dichtstbijzijnde kazerne"))
                    .font(.headline)
                    .padding(.horizontal, 4)
                TimelineView(.periodic(from: .now, by: 10)) { ctx in
                    VStack(spacing: 0) {
                        ForEach(Array(routes.enumerated()), id: \.element.id) { i, r in
                            HStack(alignment: .top, spacing: 12) {
                                KazerneIcon(soort: r.kazerne.soort, size: 34)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(r.kazerne.naam).font(.body).fixedSize(horizontal: false, vertical: true)
                                    Text("\(r.afstandTekst) · \(r.rijtijdTekst)").font(.footnote).foregroundStyle(.secondary)
                                }
                                Spacer(minLength: 8)
                                faseLabel(r, nu: ctx.date)
                            }
                            .padding(.horizontal, 16).padding(.vertical, 12)
                            if i < routes.count - 1 { Divider().padding(.leading, 62) }
                        }
                    }
                }
                .background(Color.detailCard, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                Text(genoemd
                     ? L("Schatting op basis van het alarmeringstijdstip, de gebruikelijke uitruktijd en de rijtijd volgens Apple Kaarten, bij spoed (A1, P1) een kwart korter voor de rit met zwaailicht en sirene. A-Alerts ontvangt geen positie van de voertuigen: het voertuigje op de kaart staat waar een eenheid volgens die schatting ongeveer zou rijden.")
                     : L("De oproep noemt geen kazerne. Dit is de dichtstbijzijnde kazerne van deze dienst; de tijden zijn een schatting op basis van de uitruktijd en de rijtijd volgens Apple Kaarten."))
                    .font(.footnote).foregroundStyle(.secondary)
                    .padding(.horizontal, 4)
            }
        }
    }
}

extension GealarmeerdeKazernesKaart {
    /// Uitrukken / Onderweg / Ter plaatse / Ter plaatse geweest, with the minutes left (an estimate).
    @ViewBuilder
    func faseLabel(_ r: KazerneRoute, nu: Date) -> some View {
        let minuten = { (s: Int) in max(1, Int((Double(s) / 60).rounded(.up))) }
        switch r.fase(op: nu) {
        case .uitrukken(let s):
            VStack(alignment: .trailing, spacing: 1) {
                Text(L("Uitrukken")).font(.footnote.weight(.semibold)).foregroundStyle(.red)
                Text(Lf("vertrek over %lld min", minuten(s))).font(.caption.monospacedDigit()).foregroundStyle(.secondary)
            }
        case .onderweg(let s):
            VStack(alignment: .trailing, spacing: 1) {
                Text(L("Onderweg")).font(.footnote.weight(.semibold)).foregroundStyle(.orange)
                Text(Lf("nog %lld min · ± %@", minuten(s), Fmt.time(r.aankomst))).font(.caption.monospacedDigit()).foregroundStyle(.secondary)
            }
        case .terPlaatse:
            Text(L("Ter plaatse")).font(.footnote.weight(.semibold)).foregroundStyle(.green)
        case .geweest:
            Text(L("Ter plaatse geweest")).font(.footnote.weight(.semibold)).foregroundStyle(.secondary)
        }
    }
}

/// Detail page: the Lifeliner (or Zulu) of this alert, live, with distance and "Volg op de kaart".
struct HeliLiveKaart: View {
    let melding: Melding
    let heli: Helikopter?
    var onVolg: ((String) -> Void)?

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(heli?.naam ?? HeliKoppeling.genoemd(melding).map(HeliKoppeling.naam) ?? L("Traumahelikopter"))
                .font(.headline).padding(.horizontal, 4)
            VStack(alignment: .leading, spacing: 12) {
                // Probably cancelled on its way here, or did not take off (worked out from the flight).
                if let inzet = HeliStore.shared.inzetVoor(melding.guid) { HeliInzetRegel(inzet: inzet) }
                if let h = heli {
                    HStack(spacing: 12) {
                        Image(h.afbeelding).resizable().scaledToFit().frame(width: 84, height: 30)
                            .scaleEffect(x: h.vliegtWest ? -1 : 1, y: 1)
                        VStack(alignment: .leading, spacing: 2) {
                            HStack(spacing: 6) {
                                Text(h.naam).font(.body.weight(.semibold))
                                Text(verbatim: "LIVE").font(.caption2.weight(.heavy)).foregroundStyle(.white)
                                    .padding(.horizontal, 5).padding(.vertical, 1).background(Color.red, in: Capsule())
                            }
                            Text([h.hoogteTekst, h.opGrond ? nil : h.snelheidTekst, h.koersTekst]
                                .compactMap { $0 }.joined(separator: " · "))
                                .font(.footnote).foregroundStyle(.secondary)
                            if let lat = melding.lat, let lon = melding.lon {
                                let km = Werkgebied.distanceKm(h.lat, h.lon, lat, lon)
                                let eta = h.snelheidKmh.flatMap { v in !h.opGrond && v > 40 ? Int((km / Double(v) * 60).rounded()) : nil }
                                Text(Lf("%@ km van de melding", km.formatted(.number.precision(.fractionLength(1)))) + (eta.map { " · ± \($0) min" } ?? ""))
                                    .font(.footnote.weight(.medium))
                            }
                        }
                    }
                    if let v = h.voorspelling { VoorspellingRegel(voorspelling: v) }
                    if let onVolg {
                        Button { onVolg(h.id) } label: {
                            Label(Lf("Volg %@ op de kaart", h.naam), systemImage: "scope").frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(h.color)
                    }
                } else {
                    Text(L("De helikopter is nu niet live te zien. Laag vliegend of aan de grond ontbreekt de positie soms."))
                        .font(.footnote).foregroundStyle(.secondary)
                }
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.detailCard, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            Text(L("Positie via adsb.lol (ODbL), kan enkele seconden achterlopen.")).font(.footnote).foregroundStyle(.secondary).padding(.horizontal, 4)
        }
    }
}
