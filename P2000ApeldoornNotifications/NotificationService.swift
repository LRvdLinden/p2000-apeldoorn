import UserNotifications
import MapKit
#if canImport(UIKit)
import UIKit
#endif

/// A-Alerts push extension: adds a small map of the spot to a notification (when the server sends a
/// street-level location) and sets the category with the "Bewaar" / "Toon op kaart" buttons.
/// When anything takes too long or fails, the notification is shown as it came in.
final class NotificationService: UNNotificationServiceExtension {
    private var contentHandler: ((UNNotificationContent) -> Void)?
    private var bestAttempt: UNMutableNotificationContent?
    private var snapshotter: MKMapSnapshotter?

    override func didReceive(_ request: UNNotificationRequest, withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void) {
        self.contentHandler = contentHandler
        guard let content = request.content.mutableCopy() as? UNMutableNotificationContent else {
            contentHandler(request.content)
            return
        }
        bestAttempt = content
        let info = content.userInfo
        if content.categoryIdentifier.isEmpty {
            content.categoryIdentifier = info["waarschuwing"] != nil ? "WAARSCHUWING" : "MELDING"
        }

        #if os(iOS)
        guard let lat = Self.number(info["lat"]), let lon = Self.number(info["lon"]), lat != 0, lon != 0 else {
            contentHandler(content)
            return
        }
        let color = Self.color(dienst: info["dienst"] as? String, bron: info["bron"] as? String, niveau: info["niveau"] as? String)
        let isWarning = info["waarschuwing"] != nil
        snapshot(lat: lat, lon: lon, color: color, wide: isWarning) { [weak self] url in
            guard let self else { return }
            if let url, let attachment = try? UNNotificationAttachment(identifier: "kaart", url: url,
                                                                       options: [UNNotificationAttachmentOptionsTypeHintKey: "public.png"]) {
                content.attachments = [attachment]
            }
            self.finish()
        }
        #else
        contentHandler(content)
        #endif
    }

    override func serviceExtensionTimeWillExpire() {
        snapshotter?.cancel()
        finish()
    }

    private func finish() {
        guard let handler = contentHandler, let content = bestAttempt else { return }
        contentHandler = nil
        handler(content)
    }

    private static func number(_ v: Any?) -> Double? {
        if let d = v as? Double { return d }
        if let n = v as? NSNumber { return n.doubleValue }
        if let s = v as? String { return Double(s) }
        return nil
    }

    #if os(iOS)
    private static func color(dienst: String?, bron: String?, niveau: String?) -> UIColor {
        switch bron {
        case "nlalert": return UIColor(red: 1, green: 0.78, blue: 0, alpha: 1)
        case "burgernet": return UIColor(red: 0, green: 0.4, blue: 0.69, alpha: 1)
        case "amber": return UIColor(red: 0.93, green: 0.43, blue: 0.14, alpha: 1)
        case "vermistkind": return UIColor(red: 0.11, green: 0.15, blue: 0.37, alpha: 1)
        case "vnog": return UIColor(red: 0.28, green: 0.15, blue: 0.50, alpha: 1)
        case "knmi": return niveau == "red" ? .systemRed : niveau == "yellow" ? UIColor(red: 1, green: 0.84, blue: 0, alpha: 1) : .systemOrange
        default: break
        }
        switch dienst {
        case "brandweer": return UIColor(red: 0.89, green: 0.02, blue: 0.07, alpha: 1)
        case "ambulance": return UIColor(red: 0.96, green: 0.77, blue: 0, alpha: 1)
        case "politie": return UIColor(red: 0.08, green: 0.26, blue: 0.55, alpha: 1)
        case "traumaheli": return UIColor(red: 0.58, green: 0.2, blue: 0.92, alpha: 1)
        default: return .systemRed
        }
    }

    /// 600 × 300 pt map around the spot with a pin in the colour of the service.
    private func snapshot(lat: Double, lon: Double, color: UIColor, wide: Bool, completion: @escaping (URL?) -> Void) {
        let center = CLLocationCoordinate2D(latitude: lat, longitude: lon)
        let options = MKMapSnapshotter.Options()
        let meters: CLLocationDistance = wide ? 6000 : 900
        options.region = MKCoordinateRegion(center: center, latitudinalMeters: meters, longitudinalMeters: meters * 2)
        options.size = CGSize(width: 600, height: 300)
        options.scale = 2
        options.pointOfInterestFilter = .excludingAll
        let snapshotter = MKMapSnapshotter(options: options)
        self.snapshotter = snapshotter
        snapshotter.start(with: .global(qos: .userInitiated)) { snapshot, _ in
            guard let snapshot else { completion(nil); return }
            let point = snapshot.point(for: center)
            let image = UIGraphicsImageRenderer(size: options.size).image { _ in
                snapshot.image.draw(at: .zero)
                let r: CGFloat = 13
                let pin = UIBezierPath(ovalIn: CGRect(x: point.x - r, y: point.y - r, width: r * 2, height: r * 2))
                UIColor.white.setFill()
                UIBezierPath(ovalIn: CGRect(x: point.x - r - 3, y: point.y - r - 3, width: r * 2 + 6, height: r * 2 + 6)).fill()
                color.setFill()
                pin.fill()
            }
            guard let data = image.pngData() else { completion(nil); return }
            let url = FileManager.default.temporaryDirectory.appendingPathComponent("kaart-\(UUID().uuidString).png")
            do {
                try data.write(to: url)
                completion(url)
            } catch {
                completion(nil)
            }
        }
    }
    #endif
}
