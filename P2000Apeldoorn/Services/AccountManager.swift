import Foundation
import AuthenticationServices
import Observation

/// Optional "Inloggen met Apple". The Apple user ID links push notifications (OneSignal external ID)
/// and the name/e-mail are synced through iCloud so all the user's devices show the same account.
@MainActor
@Observable
final class AccountManager {
    static let shared = AccountManager()

    private(set) var userID: String?
    private(set) var name: String?
    private(set) var email: String?

    var isSignedIn: Bool { userID != nil }

    var displayName: String {
        if let name, !name.isEmpty { return name }
        if let email, !email.isEmpty { return email }
        return L("Apple-account")
    }

    @ObservationIgnored var onChange: (() -> Void)?
    @ObservationIgnored private let cloud = NSUbiquitousKeyValueStore.default
    @ObservationIgnored private let defaults = UserDefaults.standard

    private enum K {
        static let id = "account.appleUserID", name = "account.name", email = "account.email"
    }

    private init() {
        load()
        NotificationCenter.default.addObserver(forName: NSUbiquitousKeyValueStore.didChangeExternallyNotification,
                                               object: cloud, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated { self?.load() }
        }
    }

    private func load() {
        let cloudID = cloud.string(forKey: K.id)
        userID = cloudID ?? defaults.string(forKey: K.id)
        name = cloud.string(forKey: K.name) ?? defaults.string(forKey: K.name)
        email = cloud.string(forKey: K.email) ?? defaults.string(forKey: K.email)
    }

    private func persist() {
        for (key, value) in [(K.id, userID), (K.name, name), (K.email, email)] {
            if let value {
                defaults.set(value, forKey: key)
                cloud.set(value, forKey: key)
            } else {
                defaults.removeObject(forKey: key)
                cloud.removeObject(forKey: key)
            }
        }
        cloud.synchronize()
        onChange?()
    }

    func configure(_ request: ASAuthorizationAppleIDRequest) {
        request.requestedScopes = [.fullName, .email]
    }

    func handle(_ result: Result<ASAuthorization, Error>) -> String? {
        switch result {
        case .success(let auth):
            guard let credential = auth.credential as? ASAuthorizationAppleIDCredential else { return nil }
            userID = credential.user
            // Apple only sends name and e-mail the first time; keep what we already have otherwise.
            if let full = credential.fullName {
                let formatted = PersonNameComponentsFormatter.localizedString(from: full, style: .default)
                if !formatted.isEmpty { name = formatted }
            }
            if let mail = credential.email { email = mail }
            persist()
            return nil
        case .failure(let error):
            if let authError = error as? ASAuthorizationError, authError.code == .canceled { return nil }
            return error.localizedDescription
        }
    }

    /// Signs out when the Apple ID was revoked or the app was removed from "Apps using Apple ID".
    func verifyCredential() async {
        guard let userID else { return }
        let state = try? await ASAuthorizationAppleIDProvider().credentialState(forUserID: userID)
        if state == .revoked || state == .notFound { signOut() }
    }

    func signOut() {
        userID = nil
        name = nil
        email = nil
        persist()
    }
}
