import Foundation
import Security

// ─── Keychain service ─────────────────────────────────────────────────────────

enum KeychainError: Error, LocalizedError {
    case itemNotFound
    case duplicateItem
    case invalidData
    case unhandledError(status: OSStatus)

    var errorDescription: String? {
        switch self {
        case .itemNotFound:          return "Item not found in Keychain"
        case .duplicateItem:         return "Duplicate item in Keychain"
        case .invalidData:           return "Invalid data in Keychain"
        case .unhandledError(let s): return "Keychain error: OSStatus \(s)"
        }
    }
}

final class KeychainService {
    static let shared = KeychainService()

    private let service = "com.hillfamilyhoopla.app"

    private init() {}

    // ── Write ─────────────────────────────────────────────────────────────────

    func set(_ value: String, forKey key: String) throws {
        guard let data = value.data(using: .utf8) else {
            throw KeychainError.invalidData
        }
        try set(data, forKey: key)
    }

    func set(_ data: Data, forKey key: String) throws {
        // Delete any existing item first
        try? delete(forKey: key)

        let query: [String: Any] = [
            kSecClass as String:             kSecClassGenericPassword,
            kSecAttrService as String:       service,
            kSecAttrAccount as String:       key,
            kSecValueData as String:         data,
            kSecAttrAccessible as String:    kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
        ]

        let status = SecItemAdd(query as CFDictionary, nil)
        guard status == errSecSuccess else {
            if status == errSecDuplicateItem {
                throw KeychainError.duplicateItem
            }
            throw KeychainError.unhandledError(status: status)
        }
    }

    // ── Read ──────────────────────────────────────────────────────────────────

    func string(forKey key: String) throws -> String {
        let data = try data(forKey: key)
        guard let string = String(data: data, encoding: .utf8) else {
            throw KeychainError.invalidData
        }
        return string
    }

    func data(forKey key: String) throws -> Data {
        let query: [String: Any] = [
            kSecClass as String:       kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
            kSecReturnData as String:  true,
            kSecMatchLimit as String:  kSecMatchLimitOne,
        ]

        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)

        guard status == errSecSuccess else {
            if status == errSecItemNotFound {
                throw KeychainError.itemNotFound
            }
            throw KeychainError.unhandledError(status: status)
        }

        guard let data = result as? Data else {
            throw KeychainError.invalidData
        }
        return data
    }

    // ── Delete ────────────────────────────────────────────────────────────────

    @discardableResult
    func delete(forKey key: String) throws -> Bool {
        let query: [String: Any] = [
            kSecClass as String:       kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
        ]

        let status = SecItemDelete(query as CFDictionary)
        if status == errSecItemNotFound { return false }
        guard status == errSecSuccess else {
            throw KeychainError.unhandledError(status: status)
        }
        return true
    }

    // ── Convenience: check existence ─────────────────────────────────────────

    func exists(forKey key: String) -> Bool {
        (try? string(forKey: key)) != nil
    }
}

// ─── Keychain keys ────────────────────────────────────────────────────────────

extension KeychainService {
    enum Keys {
        static let accessToken  = "auth.accessToken"
        static let refreshToken = "auth.refreshToken"
        static let expiresAt    = "auth.expiresAt"
        static let clientCert   = "mtls.clientCert"
        static let clientKey    = "mtls.clientKey"
    }
}
