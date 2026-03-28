import Foundation

// ─── User model ───────────────────────────────────────────────────────────────

enum UserRole: String, Codable, CaseIterable {
    case admin   = "admin"
    case adult   = "adult"
    case child   = "child"
}

enum UserSex: String, Codable, CaseIterable {
    case male           = "male"
    case female         = "female"
    case nonBinary      = "non-binary"
    case preferNotToSay = "prefer-not-to-say"
}

struct UserProfile: Codable, Identifiable, Equatable {
    let id: String
    let email: String
    let name: String
    let age: Int?
    let sex: UserSex?
    let phone: String?
    let profileColor: String
    let role: UserRole
    let emailVerified: Bool
    let lastLoginAt: Date?
    let createdAt: Date
    let updatedAt: Date

    // Derived: initials for avatar
    var initials: String {
        let parts = name.split(separator: " ")
        if parts.count >= 2,
           let first = parts.first?.first,
           let last = parts.last?.first {
            return "\(first)\(last)".uppercased()
        }
        return String(name.prefix(1)).uppercased()
    }
}

struct User: Codable, Identifiable, Equatable {
    let id: String
    let email: String
    let name: String
    let age: Int?
    let sex: UserSex?
    let phone: String?
    let profileColor: String
    let role: UserRole
    let emailVerified: Bool
    let failedLoginAttempts: Int
    let lockedUntil: Date?
    let lastLoginAt: Date?
    let createdAt: Date
    let updatedAt: Date

    var profile: UserProfile {
        UserProfile(
            id: id, email: email, name: name, age: age, sex: sex,
            phone: phone, profileColor: profileColor, role: role,
            emailVerified: emailVerified, lastLoginAt: lastLoginAt,
            createdAt: createdAt, updatedAt: updatedAt
        )
    }

    var initials: String { profile.initials }
}

// ─── Auth token ───────────────────────────────────────────────────────────────

struct AuthToken: Codable {
    let accessToken: String
    let refreshToken: String
    let expiresAt: Int      // Unix timestamp (seconds)
    let tokenType: String

    var isExpired: Bool {
        Int(Date().timeIntervalSince1970) >= expiresAt - 60
    }
}

// ─── Request / Response payloads ─────────────────────────────────────────────

struct LoginRequest: Encodable {
    let email: String
    let password: String
    let rememberMe: Bool?
}

struct LoginResponse: Decodable {
    let user: UserProfile
    let tokens: AuthToken
}

struct RegisterRequest: Encodable {
    let email: String
    let password: String
    let name: String
    let profileColor: String
    let inviteCode: String?
}

struct RegisterResponse: Decodable {
    let user: UserProfile
    let tokens: AuthToken
    let requiresEmailVerification: Bool
}

struct RefreshTokenRequest: Encodable {
    let refreshToken: String
}

struct RefreshTokenResponse: Decodable {
    let tokens: AuthToken
}

struct UpdateUserProfileRequest: Encodable {
    let name: String?
    let age: Int?
    let sex: String?
    let phone: String?
    let profileColor: String?
}
