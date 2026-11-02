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

    func start() {
        guard AppSettings.shared.useLocation else { return }
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
            if status == .authorizedWhenInUse || status == .authorizedAlways { self.manager.requestLocation() }
            #if os(macOS)
            if status == .authorized { self.manager.requestLocation() }
            #endif
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        let last = locations.last
        Task { @MainActor in self.location = last }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {}
}
