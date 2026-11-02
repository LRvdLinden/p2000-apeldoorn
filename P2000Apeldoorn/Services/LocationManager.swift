import Foundation
import CoreLocation
import Observation

/// "Huidige locatie": shows the distance from you to an alert.
@MainActor
@Observable
final class LocationManager: NSObject, CLLocationManagerDelegate {
    static let shared = LocationManager()

    private(set) var location: CLLocation?
    private(set) var authorization: CLAuthorizationStatus = .notDetermined

    @ObservationIgnored private let manager = CLLocationManager()

    private override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyHundredMeters
        authorization = manager.authorizationStatus
    }

    /// Location is needed for "Huidige locatie" (distances) and for a radius around the current position.
    var isNeeded: Bool {
        let s = AppSettings.shared
        return s.useLocation || (s.radiusEnabled && s.radiusMode == "huidig")
    }

    func start() {
        guard isNeeded else { return }
        if manager.authorizationStatus == .notDetermined {
            manager.requestWhenInUseAuthorization()
        } else {
            manager.requestLocation()
        }
    }

    func stop() {
        location = nil
    }

    func distance(to m: Melding) -> Double? {
        guard AppSettings.shared.useLocation, let location, let lat = m.lat, let lon = m.lon, m.hasCoordinate else { return nil }
        return location.distance(from: CLLocation(latitude: lat, longitude: lon))
    }

    nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        let status = manager.authorizationStatus
        Task { @MainActor in
            self.authorization = status
            #if os(macOS)
            if status == .authorized || status == .authorizedAlways { self.manager.requestLocation() }
            #else
            if status == .authorizedWhenInUse || status == .authorizedAlways { self.manager.requestLocation() }
            #endif
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        let last = locations.last
        Task { @MainActor in
            self.location = last
            guard let last else { return }
            // Keep the radius centre up to date (rounded to ~100 m); re-register for push when moved > 300 m.
            let s = AppSettings.shared
            let lat = (last.coordinate.latitude * 1000).rounded() / 1000
            let lon = (last.coordinate.longitude * 1000).rounded() / 1000
            let moved = s.currentLat == 0 ? Double.infinity
                : AppSettings.distanceKm(s.currentLat, s.currentLon, lat, lon)
            if moved > 0.3 {
                s.currentLat = lat
                s.currentLon = lon
                if s.radiusEnabled && s.radiusMode == "huidig" { PushManager.syncDevice() }
            }
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {}
}
