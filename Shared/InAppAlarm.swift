import Foundation
#if !os(watchOS)
import AVFoundation

/// Alarm sound while the app is open (iPhone, iPad, Mac and Apple TV), like the meldkamer on the website.
/// Default on; in Settings you can turn it off or limit it to urgent alerts (A0/A1/P1).
/// Follows your list filters, and quiet mode (urgent alerts still come through when "Kritieke meldingen" is on).
@MainActor
@Observable
final class InAppAlarm {
    static let shared = InAppAlarm()
    private let d = UserDefaults.standard

    /// Play a sound when a new alert comes in while the app is open.
    var soundOn: Bool { didSet { d.set(soundOn, forKey: "alarm.sound") } }
    /// Only for urgent alerts (A0/A1/P1).
    var onlyUrgent: Bool { didSet { d.set(onlyUrgent, forKey: "alarm.onlyUrgent") } }

    @ObservationIgnored private var played: [String] = []
    @ObservationIgnored private var player: AVAudioPlayer?
    @ObservationIgnored private var lastPlay = Date.distantPast

    private init() {
        soundOn = d.object(forKey: "alarm.sound") as? Bool ?? true
        onlyUrgent = d.object(forKey: "alarm.onlyUrgent") as? Bool ?? false
    }

    /// New alerts from the live list (polling).
    func handle(_ list: [Melding], settings: AppSettings? = nil) {
        // Resolved here (on the main actor) instead of as a default argument, which Swift 6 does not allow.
        let settings = settings ?? .shared
        let wanted = list.filter { m in
            settings.matchesList(m)
                && (!onlyUrgent || m.isUrgent)
                && !(settings.isQuiet(at: .now) && !(settings.criticalAlerts && m.isUrgent))
                && Date.now.timeIntervalSince(m.datum) < 30 * 60
        }
        play(guids: wanted.map(\.guid), urgent: wanted.contains(where: \.isUrgent))
    }

    /// A push notification arrived while the app is open. Returns true when the app played the sound itself,
    /// so the system sound can be left out (no double sound when the list catches up a few seconds later).
    @discardableResult
    func handlePush(guid: String?, urgent: Bool) -> Bool {
        guard soundOn else { return false }
        if onlyUrgent && !urgent { return true } // keep it quiet: the user only wants a sound for urgent alerts
        play(guids: [guid ?? UUID().uuidString], urgent: urgent)
        return true
    }

    /// Test button in Settings.
    func preview(urgent: Bool) { playSound(urgent: urgent) }

    private func play(guids: [String], urgent: Bool) {
        guard soundOn else { return }
        let new = guids.filter { !played.contains($0) }
        guard !new.isEmpty else { return }
        played.append(contentsOf: new)
        if played.count > 300 { played.removeFirst(played.count - 300) }
        // Several alerts at once: one sound.
        guard Date.now.timeIntervalSince(lastPlay) > 3 else { return }
        playSound(urgent: urgent)
    }

    private func playSound(urgent: Bool) {
        lastPlay = .now
        guard let url = Bundle.main.url(forResource: urgent ? "p2000-alarm-spoed" : "p2000-alarm", withExtension: "wav") else { return }
        #if os(iOS) || os(tvOS)
        // Ambient: mixes with music and follows the ring/silent switch on iPhone.
        try? AVAudioSession.sharedInstance().setCategory(.ambient, options: [.mixWithOthers])
        try? AVAudioSession.sharedInstance().setActive(true)
        #endif
        player = try? AVAudioPlayer(contentsOf: url)
        player?.volume = 1
        player?.play()
    }
}
#endif
