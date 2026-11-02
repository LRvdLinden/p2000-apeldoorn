import Foundation
import LocalAuthentication
import Observation

/// Optional app lock with Face ID / Touch ID / device passcode.
@MainActor
@Observable
final class AppLock {
    static let shared = AppLock()

    private(set) var isLocked = false
    private(set) var isAuthenticating = false

    private init() {
        isLocked = AppSettings.shared.appLock
    }

    var biometryName: String {
        let context = LAContext()
        _ = context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: nil)
        switch context.biometryType {
        case .faceID: return "Face ID"
        case .touchID: return "Touch ID"
        case .opticID: return "Optic ID"
        default: return L("toegangscode")
        }
    }

    var isAvailable: Bool {
        LAContext().canEvaluatePolicy(.deviceOwnerAuthentication, error: nil)
    }

    /// Locks when the app goes to the background (only if the lock is on).
    func lockIfNeeded() {
        if AppSettings.shared.appLock { isLocked = true }
    }

    /// Asks for Face ID straight away – no extra tap needed.
    func unlock() async {
        guard isLocked, !isAuthenticating else { return }
        isAuthenticating = true
        defer { isAuthenticating = false }
        let context = LAContext()
        context.localizedCancelTitle = L("Annuleren")
        let ok = (try? await context.evaluatePolicy(.deviceOwnerAuthentication,
                                                    localizedReason: L("Ontgrendel P2000 Apeldoorn"))) ?? false
        if ok { isLocked = false }
    }

    /// Confirms with Face ID before turning the lock on.
    func enable() async -> Bool {
        let context = LAContext()
        let ok = (try? await context.evaluatePolicy(.deviceOwnerAuthentication,
                                                    localizedReason: L("Zet de app-vergrendeling aan"))) ?? false
        if ok { AppSettings.shared.appLock = true }
        return ok
    }

    func disable() {
        AppSettings.shared.appLock = false
        isLocked = false
    }
}
