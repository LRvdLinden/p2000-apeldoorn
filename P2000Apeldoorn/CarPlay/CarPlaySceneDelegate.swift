#if os(iOS) && canImport(CarPlay)
import CarPlay
import CoreLocation
import UIKit

/// A-Alerts in CarPlay (category Public Safety), design "A · Lijst + melding":
/// three tabs with lists (Meldingen · In de buurt · Waarschuwingen), a detail screen per alert
/// and a pop-up when a new alert comes in near you while you drive.
///
/// CarPlay only shows the app once the CarPlay entitlement is in the app's entitlements
/// (see Config/CarPlay.entitlements.example and the README). Without it this code is never called
/// and the app works as before.
@MainActor
final class CarPlaySceneDelegate: UIResponder, CPTemplateApplicationSceneDelegate {
    private var interfaceController: CPInterfaceController?
    private weak var scene: CPTemplateApplicationScene?
    private var tabBar: CPTabBarTemplate?
    private let meldingenTab = CPListTemplate(title: L("Meldingen"), sections: [])
    private let buurtTab = CPListTemplate(title: L("In de buurt"), sections: [])
    private let waarschuwingenTab = CPListTemplate(title: L("Waarschuwingen"), sections: [])
    private var loop: Task<Void, Never>?
    /// Alerts already seen in the car: only alerts that come in after connecting give a pop-up.
    private var bekend: Set<String> = []
    private var alertOpen = false

    /// Alerts within this distance give a pop-up (the radius of "Mijn buurt" when that is on).
    private var buurtKm: Double {
        let s = AppSettings.shared
        return s.radiusEnabled ? s.radiusKm : 5
    }

    // MARK: - Scene

    func templateApplicationScene(_ templateApplicationScene: CPTemplateApplicationScene,
                                  didConnect interfaceController: CPInterfaceController) {
        self.interfaceController = interfaceController
        scene = templateApplicationScene

        meldingenTab.tabTitle = L("Meldingen")
        meldingenTab.tabImage = UIImage(systemName: "list.bullet")
        buurtTab.tabTitle = L("In de buurt")
        buurtTab.tabImage = UIImage(systemName: "location.circle")
        waarschuwingenTab.tabTitle = L("Waarschuwingen")
        waarschuwingenTab.tabImage = UIImage(systemName: "exclamationmark.triangle")
        for t in [meldingenTab, buurtTab, waarschuwingenTab] {
            t.emptyViewTitleVariants = [L("Even geduld…")]
        }

        let tabs = CPTabBarTemplate(templates: [meldingenTab, buurtTab, waarschuwingenTab])
        tabBar = tabs
        interfaceController.setRootTemplate(tabs, animated: false, completion: nil)

        bekend = Set(MeldingStore.shared.meldingen.map(\.guid))
        LocationManager.shared.start()
        werkBij()
        loop?.cancel()
        loop = Task { [weak self] in
            var eerste = true
            while !Task.isCancelled {
                await MeldingStore.shared.refresh()
                await WaarschuwingStore.shared.refresh()
                guard let self, !Task.isCancelled else { return }
                if eerste {
                    // Whatever the first load brings is not "new": no pop-up right after connecting.
                    self.bekend.formUnion(MeldingStore.shared.meldingen.map(\.guid))
                    eerste = false
                }
                self.werkBij()
                self.meldNieuweInDeBuurt()
                try? await Task.sleep(for: .seconds(15))
                LocationManager.shared.start()
            }
        }
    }

    func templateApplicationScene(_ templateApplicationScene: CPTemplateApplicationScene,
                                  didDisconnectInterfaceController interfaceController: CPInterfaceController) {
        loop?.cancel()
        loop = nil
        self.interfaceController = nil
        tabBar = nil
        alertOpen = false
    }

    // MARK: - Data

    /// Alerts of the last 24 hours with the list filters of the app, newest first.
    private var meldingen: [Melding] {
        MeldingStore.shared.filtered(AppSettings.shared).sorted { $0.datum > $1.datum }
    }

    private func afstandKm(_ m: Melding) -> Double? {
        guard let loc = LocationManager.shared.location, m.hasCoordinate, let lat = m.lat, let lon = m.lon else { return nil }
        return loc.distance(from: CLLocation(latitude: lat, longitude: lon)) / 1000
    }

    private func afstandTekst(_ km: Double) -> String {
        km < 1
            ? "\(Int((km * 1000 / 10).rounded() * 10)) m"
            : Lf("%@ km", km.formatted(.number.precision(.fractionLength(1))))
    }

    private func werkBij() {
        let limiet = min(CPListTemplate.maximumItemCount, 60)
        let alle = Array(meldingen.prefix(limiet))
        meldingenTab.updateSections([CPListSection(items: alle.map(item))])

        let buurt = MeldingStore.shared.meldingen
            .filter { Date.now.timeIntervalSince($0.datum) < MeldingStore.timelineWindow }
            .compactMap { m in afstandKm(m).map { (m, $0) } }
            .filter { $0.1 <= max(buurtKm, 10) }
            .sorted { $0.0.datum > $1.0.datum }
            .prefix(limiet)
            .map(\.0)
        buurtTab.emptyViewTitleVariants = LocationManager.shared.location == nil
            ? [L("Zet Huidige locatie aan in de app om meldingen in de buurt te zien")]
            : [L("Geen meldingen in de buurt")]
        buurtTab.updateSections([CPListSection(items: buurt.map(item))])

        let w = WaarschuwingStore.shared.pager(AppSettings.shared).filter { !$0.isBeeindigd }.prefix(limiet)
        waarschuwingenTab.emptyViewTitleVariants = [L("Geen actieve waarschuwingen")]
        waarschuwingenTab.updateSections([CPListSection(items: w.map(item))])
    }

    // MARK: - List rows

    private func item(_ m: Melding) -> CPListItem {
        var regel = [m.plaatsNaam, m.datum.formatted(date: .omitted, time: .shortened)]
        if let km = afstandKm(m) { regel.append(afstandTekst(km)) }
        let titel = [prioLabel(m), m.title].compactMap { $0 }.joined(separator: " · ")
        let item = CPListItem(text: titel, detailText: regel.joined(separator: " · "), image: Self.icoon(m.dienst))
        item.handler = { [weak self] _, klaar in
            self?.toonDetail(m)
            klaar()
        }
        return item
    }

    private func item(_ w: Waarschuwing) -> CPListItem {
        let detail = [w.kop, w.plaats, w.start.formatted(date: .omitted, time: .shortened)].compactMap { $0 }.joined(separator: " · ")
        let item = CPListItem(text: w.titel, detailText: detail,
                              image: Self.icoon(symbool: "exclamationmark.triangle.fill", kleur: UIColor(red: 0.96, green: 0.62, blue: 0.04, alpha: 1)))
        item.handler = { [weak self] _, klaar in
            self?.toonDetail(w)
            klaar()
        }
        return item
    }

    private func prioLabel(_ m: Melding) -> String? {
        guard let p = m.prioriteit?.trimmingCharacters(in: .whitespaces), !p.isEmpty, p.lowercased() != "onbekend" else { return nil }
        return p.uppercased()
    }

    // MARK: - Detail

    private func toonDetail(_ m: Melding) {
        var items = [
            CPInformationItem(title: L("Dienst"), detail: [m.dienst.label, prioLabel(m)].compactMap { $0 }.joined(separator: " · ")),
            CPInformationItem(title: L("Tijd"), detail: "\(m.datum.formatted(date: .omitted, time: .shortened)) · \(m.datum.formatted(.relative(presentation: .named)))"),
            CPInformationItem(title: L("Plaats"), detail: m.plaatsText),
        ]
        if let km = afstandKm(m) { items.append(CPInformationItem(title: L("Afstand"), detail: afstandTekst(km))) }
        let eenheden = m.eenheden.compactMap { $0.naam ?? $0.code }
        if !eenheden.isEmpty { items.append(CPInformationItem(title: L("Eenheden"), detail: eenheden.prefix(4).joined(separator: ", "))) }
        let incident = incidentMeldingen(m)
        if incident.count > 1 { items.append(CPInformationItem(title: L("Incident"), detail: Lf("%lld meldingen", incident.count))) }

        var knoppen: [CPTextButton] = []
        if m.hasCoordinate, let lat = m.lat, let lon = m.lon {
            knoppen.append(CPTextButton(title: L("Toon op kaart"), textStyle: .confirm) { [weak self] _ in
                self?.openKaart(lat: lat, lon: lon, naam: m.title)
            })
        }
        if m.incident != nil {
            knoppen.append(CPTextButton(title: L("Hele incident"), textStyle: .normal) { [weak self] _ in
                self?.toonIncident(m)
            })
        }
        let t = CPInformationTemplate(title: m.title, layout: .twoColumn, items: items, actions: knoppen)
        interfaceController?.pushTemplate(t, animated: true, completion: nil)
    }

    private func toonDetail(_ w: Waarschuwing) {
        var items = [CPInformationItem(title: L("Soort"), detail: w.kop)]
        if let p = w.plaats { items.append(CPInformationItem(title: L("Plaats"), detail: p)) }
        items.append(CPInformationItem(title: L("Tijd"), detail: w.start.formatted(date: .abbreviated, time: .shortened)))
        let tekst = (Config.uiLanguage.hasPrefix("en") ? (w.tekstEn ?? w.tekst) : w.tekst) ?? w.omschrijving
        if let tekst, !tekst.isEmpty { items.append(CPInformationItem(title: nil, detail: String(tekst.prefix(400)))) }
        var knoppen: [CPTextButton] = []
        if let lat = w.lat, let lon = w.lon, lat != 0, lon != 0 {
            knoppen.append(CPTextButton(title: L("Toon op kaart"), textStyle: .confirm) { [weak self] _ in
                self?.openKaart(lat: lat, lon: lon, naam: w.titel)
            })
        }
        let t = CPInformationTemplate(title: w.titel, layout: .leading, items: items, actions: knoppen)
        interfaceController?.pushTemplate(t, animated: true, completion: nil)
    }

    private func incidentMeldingen(_ m: Melding) -> [Melding] {
        guard let id = m.incident else { return [m] }
        let lijst = MeldingStore.shared.metVerloop.filter { $0.incident == id }
        return lijst.isEmpty ? [m] : lijst.sorted { $0.datum > $1.datum }
    }

    /// "Hele incident": every alert of this incident, newest first.
    private func toonIncident(_ m: Melding) {
        let lijst = CPListTemplate(title: L("Hele incident"), sections: [CPListSection(items: incidentMeldingen(m).map(item))])
        interfaceController?.pushTemplate(lijst, animated: true, completion: nil)
        Task { [weak self] in
            await MeldingStore.shared.laadVerloop(m)
            guard let self else { return }
            lijst.updateSections([CPListSection(items: self.incidentMeldingen(m).map(self.item))])
        }
    }

    /// Shows the place in Apple Maps (no route to the incident: stay clear of the emergency services).
    private func openKaart(lat: Double, lon: Double, naam: String) {
        var c = URLComponents(string: "maps://")!
        c.queryItems = [URLQueryItem(name: "ll", value: "\(lat),\(lon)"), URLQueryItem(name: "q", value: naam)]
        guard let url = c.url else { return }
        scene?.open(url, options: nil, completionHandler: nil)
    }

    // MARK: - New alert nearby

    private func meldNieuweInDeBuurt() {
        let nieuw = MeldingStore.shared.meldingen.filter { !bekend.contains($0.guid) }
        bekend.formUnion(nieuw.map(\.guid))
        guard !alertOpen, let ic = interfaceController else { return }
        let kandidaat = nieuw
            .filter { (AppSettings.shared.matchesList($0) || AppSettings.shared.volgtCapcode($0)) && !AppSettings.shared.isVerborgenSoort($0) }
            .compactMap { m in afstandKm(m).map { (m, $0) } }
            .filter { $0.1 <= buurtKm }
            .sorted { $0.1 < $1.1 }
            .first
        guard let k = kandidaat else { return }
        let (m, km) = k
        let titel = Lf("%@ op %@", m.title, afstandTekst(km))
        let kort = Lf("%@ · %@", m.dienst.label, afstandTekst(km))
        let alert = CPAlertTemplate(titleVariants: [titel, kort], actions: [
            CPAlertAction(title: L("Bekijk"), style: .default) { [weak self] _ in
                guard let self else { return }
                self.interfaceController?.dismissTemplate(animated: true) { _, _ in
                    Task { @MainActor in
                        self.alertOpen = false
                        self.toonDetail(m)
                    }
                }
            },
            CPAlertAction(title: L("Sluiten"), style: .cancel) { [weak self] _ in
                self?.interfaceController?.dismissTemplate(animated: true) { _, _ in
                    Task { @MainActor in self?.alertOpen = false }
                }
            },
        ])
        alertOpen = true
        ic.presentTemplate(alert, animated: true) { [weak self] ok, _ in
            if !ok { Task { @MainActor in self?.alertOpen = false } }
        }
    }

    // MARK: - Icons

    private static var cache: [String: UIImage] = [:]

    private static func icoon(_ d: Dienst) -> UIImage {
        icoon(symbool: d.systemImage, kleur: UIColor(d.color))
    }

    /// White SF Symbol on a round badge in the colour of the service.
    private static func icoon(symbool: String, kleur: UIColor) -> UIImage {
        if let i = cache[symbool] { return i }
        let maat = CGSize(width: 44, height: 44)
        let beeld = UIGraphicsImageRenderer(size: maat).image { _ in
            kleur.setFill()
            UIBezierPath(ovalIn: CGRect(origin: .zero, size: maat)).fill()
            let config = UIImage.SymbolConfiguration(pointSize: 20, weight: .semibold)
            if let s = UIImage(systemName: symbool, withConfiguration: config)?.withTintColor(.white, renderingMode: .alwaysOriginal) {
                s.draw(in: CGRect(x: (maat.width - s.size.width) / 2, y: (maat.height - s.size.height) / 2, width: s.size.width, height: s.size.height))
            }
        }
        cache[symbool] = beeld
        return beeld
    }
}
#endif
