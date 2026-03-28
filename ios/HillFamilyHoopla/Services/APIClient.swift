import Foundation
import Security

// ─── API Error ────────────────────────────────────────────────────────────────

struct APIError: Error, LocalizedError {
    let statusCode: Int
    let message: String
    let body: [String: Any]?

    var errorDescription: String? { message }

    static func from(statusCode: Int, data: Data?) -> APIError {
        var message = "HTTP \(statusCode)"
        var body: [String: Any]? = nil
        if let data,
           let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
            body = json
            if let msg = json["message"] as? String { message = msg }
        }
        return APIError(statusCode: statusCode, message: message, body: body)
    }
}

// ─── API Client ───────────────────────────────────────────────────────────────

actor APIClient: NSObject {
    static let shared = APIClient()

    private let baseURL: String
    private var session: URLSession!

    // Certificate pinning: SHA-256 of the server's public key
    private let pinnedPublicKeyHash: String? = {
        // Set this to the base64-encoded SHA-256 of your server's public key
        // Generate with: openssl x509 -in server.crt -pubkey -noout |
        //   openssl pkey -pubin -outform DER | openssl dgst -sha256 -binary | base64
        return ProcessInfo.processInfo.environment["PINNED_PUBLIC_KEY_HASH"]
    }()

    private override init() {
        baseURL = ProcessInfo.processInfo.environment["API_BASE_URL"]
            ?? "https://api.hillfamilyhoopla.com"
        super.init()

        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 30
        config.timeoutIntervalForResource = 60
        config.httpAdditionalHeaders = [
            "Accept": "application/json",
            "X-App-Platform": "ios",
        ]
        // Delegate handles cert pinning + mTLS
        self.session = URLSession(
            configuration: config,
            delegate: self,
            delegateQueue: nil
        )
    }

    // ─── HTTP methods ─────────────────────────────────────────────────────────

    func get<T: Decodable>(path: String) async throws -> T {
        try await request(method: "GET", path: path, body: nil as EmptyBody?)
    }

    func post<T: Decodable, B: Encodable>(path: String, body: B) async throws -> T {
        try await request(method: "POST", path: path, body: body)
    }

    func patch<T: Decodable, B: Encodable>(path: String, body: B) async throws -> T {
        try await request(method: "PATCH", path: path, body: body)
    }

    func delete(path: String) async throws {
        let _: EmptyBody = try await request(method: "DELETE", path: path, body: nil as EmptyBody?)
    }

    // ─── Core request ─────────────────────────────────────────────────────────

    private func request<T: Decodable, B: Encodable>(
        method: String,
        path: String,
        body: B?,
        retrying: Bool = false
    ) async throws -> T {
        guard let url = URL(string: baseURL + path) else {
            throw APIError(statusCode: 0, message: "Invalid URL: \(baseURL + path)", body: nil)
        }

        var req = URLRequest(url: url)
        req.httpMethod = method

        // Attach auth header
        if let tokens = await AuthService.shared.loadTokens() {
            var token = tokens.accessToken
            // Proactively refresh if expiring soon
            if tokens.isExpired && !retrying {
                let refreshed = try await AuthService.shared.refreshTokens()
                token = refreshed.accessToken
            }
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        // Encode body
        if let body {
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            let encoder = JSONEncoder()
            encoder.dateEncodingStrategy = .iso8601
            req.httpBody = try encoder.encode(body)
        }

        let (data, response) = try await session.data(for: req)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError(statusCode: 0, message: "Invalid response", body: nil)
        }

        // Auto-refresh on 401
        if httpResponse.statusCode == 401 && !retrying {
            _ = try await AuthService.shared.refreshTokens()
            return try await request(method: method, path: path, body: body, retrying: true)
        }

        guard (200..<300).contains(httpResponse.statusCode) else {
            throw APIError.from(statusCode: httpResponse.statusCode, data: data)
        }

        if httpResponse.statusCode == 204 || data.isEmpty {
            // Decode as EmptyBody if T allows
            if T.self == EmptyBody.self {
                return EmptyBody() as! T
            }
        }

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let str = try container.decode(String.self)
            let formatter = ISO8601DateFormatter()
            formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            if let date = formatter.date(from: str) { return date }
            formatter.formatOptions = [.withInternetDateTime]
            if let date = formatter.date(from: str) { return date }
            throw DecodingError.dataCorruptedError(
                in: container,
                debugDescription: "Cannot decode date: \(str)"
            )
        }
        decoder.keyDecodingStrategy = .convertFromSnakeCase

        return try decoder.decode(T.self, from: data)
    }
}

// ─── URLSession delegate — certificate pinning + mTLS ────────────────────────

extension APIClient: URLSessionDelegate {

    nonisolated func urlSession(
        _ session: URLSession,
        didReceive challenge: URLAuthenticationChallenge,
        completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void
    ) {
        switch challenge.protectionSpace.authenticationMethod {

        case NSURLAuthenticationMethodServerTrust:
            handleServerTrust(challenge: challenge, completionHandler: completionHandler)

        case NSURLAuthenticationMethodClientCertificate:
            handleClientCertificate(challenge: challenge, completionHandler: completionHandler)

        default:
            completionHandler(.performDefaultHandling, nil)
        }
    }

    private nonisolated func handleServerTrust(
        challenge: URLAuthenticationChallenge,
        completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void
    ) {
        guard
            let serverTrust = challenge.protectionSpace.serverTrust,
            let pinnedHash = pinnedPublicKeyHash
        else {
            completionHandler(.performDefaultHandling, nil)
            return
        }

        // Extract server certificate public key hash
        if let serverCert = SecTrustGetCertificateAtIndex(serverTrust, 0),
           let publicKey = SecCertificateCopyKey(serverCert) {
            var error: Unmanaged<CFError>?
            if let keyData = SecKeyCopyExternalRepresentation(publicKey, &error) as Data? {
                let hash = sha256(keyData).base64EncodedString()
                if hash == pinnedHash {
                    completionHandler(.useCredential, URLCredential(trust: serverTrust))
                    return
                }
            }
        }

        // Pinning failed
        completionHandler(.cancelAuthenticationChallenge, nil)
    }

    private nonisolated func handleClientCertificate(
        challenge: URLAuthenticationChallenge,
        completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void
    ) {
        // Load the client certificate from the Keychain
        guard
            let certData = try? KeychainService.shared.data(forKey: KeychainService.Keys.clientCert),
            let keyData  = try? KeychainService.shared.data(forKey: KeychainService.Keys.clientKey)
        else {
            completionHandler(.performDefaultHandling, nil)
            return
        }

        guard
            let cert = SecCertificateCreateWithData(nil, certData as CFData),
            let key  = loadPrivateKey(from: keyData)
        else {
            completionHandler(.cancelAuthenticationChallenge, nil)
            return
        }

        let credential = URLCredential(
            identity: SecIdentity.from(cert: cert, key: key),
            certificates: [cert],
            persistence: .forSession
        )
        completionHandler(.useCredential, credential)
    }

    private nonisolated func sha256(_ data: Data) -> Data {
        var hash = [UInt8](repeating: 0, count: Int(CC_SHA256_DIGEST_LENGTH))
        data.withUnsafeBytes {
            _ = CC_SHA256($0.baseAddress, CC_LONG(data.count), &hash)
        }
        return Data(hash)
    }

    private nonisolated func loadPrivateKey(from data: Data) -> SecKey? {
        let attrs: [String: Any] = [
            kSecAttrKeyType as String:  kSecAttrKeyTypeRSA,
            kSecAttrKeyClass as String: kSecAttrKeyClassPrivate,
        ]
        return SecKeyCreateWithData(data as CFData, attrs as CFDictionary, nil)
    }
}

// ─── SecIdentity helper ───────────────────────────────────────────────────────

extension SecIdentity {
    static func from(cert: SecCertificate, key: SecKey) -> SecIdentity {
        // In production, the identity would be loaded from a .p12 in the Keychain.
        // This is a placeholder that works when cert+key are already associated.
        var identity: SecIdentity?
        _ = SecIdentityCreateWithCertificate(nil, cert, &identity)
        return identity! // Force-unwrap is acceptable here as we validated above
    }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

private struct EmptyBody: Codable {}

// CommonCrypto import shim (needed for CC_SHA256)
import CommonCrypto
