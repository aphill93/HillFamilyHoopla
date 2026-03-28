import SwiftUI
import Combine

// ─── Auth ViewModel ───────────────────────────────────────────────────────────

@MainActor
final class AuthViewModel: ObservableObject {
    @Published var currentUser: UserProfile?
    @Published var isLoading: Bool = true
    @Published var errorMessage: String?

    var isAuthenticated: Bool { currentUser != nil }

    private let authService = AuthService.shared

    init() {
        Task { await loadCurrentUser() }
    }

    // ── Load user on app launch ───────────────────────────────────────────────

    func loadCurrentUser() async {
        isLoading = true
        defer { isLoading = false }

        guard await authService.isAuthenticated() else { return }

        do {
            currentUser = try await authService.fetchCurrentUser()
        } catch let error as AuthError {
            if case .tokenExpired = error {
                currentUser = nil
            }
            // Ignore other fetch errors (e.g. offline) — keep showing login
        } catch {
            // Offline: keep tokens, user stays logged out visually
        }
    }

    // ── Login ─────────────────────────────────────────────────────────────────

    func login(email: String, password: String, rememberMe: Bool = false) async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            let response = try await authService.login(
                email: email,
                password: password,
                rememberMe: rememberMe
            )
            currentUser = response.user
        } catch let error as AuthError {
            errorMessage = error.localizedDescription
        } catch {
            errorMessage = "An unexpected error occurred."
        }
    }

    // ── Register ──────────────────────────────────────────────────────────────

    func register(
        email: String,
        password: String,
        name: String,
        profileColor: String,
        inviteCode: String? = nil
    ) async -> Bool {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            let response = try await authService.register(
                email: email,
                password: password,
                name: name,
                profileColor: profileColor,
                inviteCode: inviteCode
            )
            currentUser = response.user
            return true
        } catch let error as AuthError {
            errorMessage = error.localizedDescription
            return false
        } catch {
            errorMessage = "Registration failed. Please try again."
            return false
        }
    }

    // ── Logout ────────────────────────────────────────────────────────────────

    func logout() async {
        await authService.logout()
        currentUser = nil
    }

    // ── Forgot password ───────────────────────────────────────────────────────

    func forgotPassword(email: String) async -> Bool {
        do {
            try await authService.forgotPassword(email: email)
            return true
        } catch {
            errorMessage = "Failed to send reset email. Please try again."
            return false
        }
    }

    // ── Reset password ────────────────────────────────────────────────────────

    func resetPassword(token: String, newPassword: String) async -> Bool {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            try await authService.resetPassword(token: token, newPassword: newPassword)
            return true
        } catch let error as AuthError {
            errorMessage = error.localizedDescription
            return false
        } catch {
            errorMessage = "Password reset failed. Please try again."
            return false
        }
    }

    // ── Verify email ──────────────────────────────────────────────────────────

    func verifyEmail(token: String) async {
        do {
            let user = try await authService.verifyEmail(token: token)
            currentUser = user
        } catch {
            errorMessage = "Email verification failed."
        }
    }

    // ── Clear error ───────────────────────────────────────────────────────────

    func clearError() {
        errorMessage = nil
    }
}
