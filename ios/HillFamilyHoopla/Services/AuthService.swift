import Foundation

// ─── Auth service ─────────────────────────────────────────────────────────────

enum AuthError: Error, LocalizedError {
    case invalidCredentials
    case accountLocked(until: Date?)
    case emailNotVerified
    case networkError(Error)
    case serverError(String)
    case tokenExpired
    case notAuthenticated

    var errorDescription: String? {
        switch self {
        case .invalidCredentials:
            return "Invalid email or password."
        case .accountLocked(let until):
            if let until {
                let formatter = DateFormatter()
                formatter.timeStyle = .short
                return "Account locked until \(formatter.string(from: until))."
            }
            return "Account temporarily locked. Please try again later."
        case .emailNotVerified:
            return "Please verify your email address before signing in."
        case .networkError(let e):
            return "Network error: \(e.localizedDescription)"
        case .serverError(let msg):
            return msg
        case .tokenExpired:
            return "Your session has expired. Please sign in again."
        case .notAuthenticated:
            return "You are not signed in."
        }
    }
}

actor AuthService {
    static let shared = AuthService()

    private let keychain = KeychainService.shared

    private init() {}

    // ─── Token management ─────────────────────────────────────────────────────

    func saveTokens(_ tokens: AuthToken) throws {
        try keychain.set(tokens.accessToken, forKey: KeychainService.Keys.accessToken)
        try keychain.set(tokens.refreshToken, forKey: KeychainService.Keys.refreshToken)
        try keychain.set(String(tokens.expiresAt), forKey: KeychainService.Keys.expiresAt)
    }

    func loadTokens() -> AuthToken? {
        guard
            let accessToken  = try? keychain.string(forKey: KeychainService.Keys.accessToken),
            let refreshToken = try? keychain.string(forKey: KeychainService.Keys.refreshToken),
            let expiresAtStr = try? keychain.string(forKey: KeychainService.Keys.expiresAt),
            let expiresAt    = Int(expiresAtStr)
        else { return nil }

        return AuthToken(
            accessToken: accessToken,
            refreshToken: refreshToken,
            expiresAt: expiresAt,
            tokenType: "Bearer"
        )
    }

    func clearTokens() {
        try? keychain.delete(forKey: KeychainService.Keys.accessToken)
        try? keychain.delete(forKey: KeychainService.Keys.refreshToken)
        try? keychain.delete(forKey: KeychainService.Keys.expiresAt)
    }

    func isAuthenticated() -> Bool {
        loadTokens() != nil
    }

    // ─── Login ────────────────────────────────────────────────────────────────

    func login(email: String, password: String, rememberMe: Bool = false) async throws -> LoginResponse {
        let request = LoginRequest(email: email, password: password, rememberMe: rememberMe)
        do {
            let response: LoginResponse = try await APIClient.shared.post(
                path: "/auth/login",
                body: request
            )
            try saveTokens(response.tokens)
            return response
        } catch let apiError as APIError {
            switch apiError.statusCode {
            case 401: throw AuthError.invalidCredentials
            case 423: throw AuthError.accountLocked(until: nil)
            default:  throw AuthError.serverError(apiError.message)
            }
        } catch {
            throw AuthError.networkError(error)
        }
    }

    // ─── Register ─────────────────────────────────────────────────────────────

    func register(
        email: String,
        password: String,
        name: String,
        profileColor: String,
        inviteCode: String? = nil
    ) async throws -> RegisterResponse {
        let request = RegisterRequest(
            email: email, password: password,
            name: name, profileColor: profileColor,
            inviteCode: inviteCode
        )
        do {
            let response: RegisterResponse = try await APIClient.shared.post(
                path: "/auth/register",
                body: request
            )
            try saveTokens(response.tokens)
            return response
        } catch let apiError as APIError {
            throw AuthError.serverError(apiError.message)
        } catch {
            throw AuthError.networkError(error)
        }
    }

    // ─── Refresh tokens ───────────────────────────────────────────────────────

    func refreshTokens() async throws -> AuthToken {
        guard let tokens = loadTokens() else {
            throw AuthError.notAuthenticated
        }

        let request = RefreshTokenRequest(refreshToken: tokens.refreshToken)
        do {
            let response: RefreshTokenResponse = try await APIClient.shared.post(
                path: "/auth/refresh",
                body: request
            )
            try saveTokens(response.tokens)
            return response.tokens
        } catch let apiError as APIError {
            if apiError.statusCode == 401 {
                clearTokens()
                throw AuthError.tokenExpired
            }
            throw AuthError.serverError(apiError.message)
        } catch {
            throw AuthError.networkError(error)
        }
    }

    // ─── Logout ───────────────────────────────────────────────────────────────

    func logout() async {
        if let tokens = loadTokens() {
            _ = try? await APIClient.shared.post(
                path: "/auth/logout",
                body: RefreshTokenRequest(refreshToken: tokens.refreshToken)
            ) as EmptyResponse
        }
        clearTokens()
    }

    // ─── Forgot / reset password ──────────────────────────────────────────────

    func forgotPassword(email: String) async throws {
        _ = try await APIClient.shared.post(
            path: "/auth/forgot-password",
            body: ["email": email]
        ) as EmptyResponse
    }

    func resetPassword(token: String, newPassword: String) async throws {
        _ = try await APIClient.shared.post(
            path: "/auth/reset-password",
            body: ["token": token, "newPassword": newPassword]
        ) as EmptyResponse
    }

    // ─── Verify email ─────────────────────────────────────────────────────────

    func verifyEmail(token: String) async throws -> UserProfile {
        struct Response: Decodable { let user: UserProfile }
        let response: Response = try await APIClient.shared.post(
            path: "/auth/verify-email",
            body: ["token": token]
        )
        return response.user
    }

    // ─── Fetch current user ───────────────────────────────────────────────────

    func fetchCurrentUser() async throws -> UserProfile {
        struct Response: Decodable { let user: UserProfile }
        let response: Response = try await APIClient.shared.get(path: "/auth/me")
        return response.user
    }
}

// Placeholder for endpoints that return no body
struct EmptyResponse: Decodable {}
