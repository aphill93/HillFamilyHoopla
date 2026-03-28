import UIKit
import Messages
import SwiftUI

// ─── iMessage Extension Main Controller ──────────────────────────────────────

class MessagesViewController: MSMessagesAppViewController {

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground
    }

    override func willBecomeActive(with conversation: MSConversation) {
        super.willBecomeActive(with: conversation)
        presentEventPicker(for: conversation)
    }

    override func didSelect(_ message: MSMessage, conversation: MSConversation) {
        if let url = message.url,
           let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
           let eventId = components.queryItems?.first(where: { $0.name == "eventId" })?.value {
            presentEventDetail(eventId: eventId, in: conversation)
        }
    }

    // ─── Embed SwiftUI view ───────────────────────────────────────────────────

    private func embed<V: View>(_ view: V) {
        for child in children {
            child.willMove(toParent: nil)
            child.view.removeFromSuperview()
            child.removeFromParent()
        }
        let host = UIHostingController(rootView: view)
        addChild(host)
        host.view.frame = self.view.bounds
        host.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        self.view.addSubview(host.view)
        host.didMove(toParent: self)
    }

    private func presentEventPicker(for conversation: MSConversation) {
        embed(
            iMessageEventPickerView { [weak self] event in
                self?.send(event: event, in: conversation)
            }
        )
    }

    private func presentEventDetail(eventId: String, in conversation: MSConversation) {
        requestPresentationStyle(.expanded)
        embed(
            iMessageEventDetailView(eventId: eventId) { [weak self] event in
                self?.send(event: event, in: conversation)
            }
        )
    }

    // ─── Compose and send iMessage bubble ────────────────────────────────────

    private func send(event: iMessageEvent, in conversation: MSConversation) {
        let layout = MSMessageTemplateLayout()
        layout.caption          = event.title
        layout.subcaption       = event.timeString
        layout.trailingSubcaption = event.location
        layout.image            = createEventImage(for: event)

        var components = URLComponents()
        components.queryItems = [
            URLQueryItem(name: "eventId",   value: event.id),
            URLQueryItem(name: "title",     value: event.title),
            URLQueryItem(name: "startTime", value: event.startTime),
        ]

        let message = MSMessage(session: conversation.selectedMessage?.session ?? MSSession())
        message.layout      = layout
        message.url         = components.url
        message.summaryText = "📅 \(event.title) — \(event.timeString)"

        conversation.insert(message) { [weak self] error in
            if let error { print("[iMessage] Insert failed:", error) }
            else         { self?.dismiss() }
        }
    }

    private func createEventImage(for event: iMessageEvent) -> UIImage? {
        let size = CGSize(width: 300, height: 150)
        return UIGraphicsImageRenderer(size: size).image { ctx in
            let bg = UIColor(hex: event.color) ?? .systemBlue
            bg.setFill()
            ctx.fill(CGRect(origin: .zero, size: size))
            let emoji = event.categoryEmoji
            let attrs: [NSAttributedString.Key: Any] = [.font: UIFont.systemFont(ofSize: 60)]
            let textSize = (emoji as NSString).size(withAttributes: attrs)
            let textRect = CGRect(
                x: (size.width  - textSize.width)  / 2,
                y: (size.height - textSize.height) / 2,
                width: textSize.width, height: textSize.height
            )
            (emoji as NSString).draw(in: textRect, withAttributes: attrs)
        }
    }
}

// ─── iMessage event model ─────────────────────────────────────────────────────

struct iMessageEvent {
    let id: String
    let title: String
    let startTime: String
    let endTime: String
    let location: String?
    let color: String
    let category: String?

    var timeString: String {
        let fmt = ISO8601DateFormatter()
        fmt.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        guard
            let start = fmt.date(from: startTime) ?? ISO8601DateFormatter().date(from: startTime),
            let end   = fmt.date(from: endTime)   ?? ISO8601DateFormatter().date(from: endTime)
        else { return startTime }
        let df = DateFormatter()
        df.timeStyle = .short
        df.dateStyle = .short
        return "\(df.string(from: start)) – \(df.string(from: end))"
    }

    var categoryEmoji: String {
        switch category {
        case "work":    return "💼"
        case "school":  return "📚"
        case "sports":  return "⚽"
        case "medical": return "🏥"
        case "social":  return "🎉"
        case "family":  return "👨‍👩‍👧‍👦"
        case "holiday": return "🎄"
        default:        return "📅"
        }
    }
}

// ─── Lightweight extension-side API client ────────────────────────────────────
//
// The iMessage extension is a separate binary and cannot import APIClient from
// the main app target. It reads the access token from the shared Keychain
// access group (requires both targets to have the same Keychain Sharing
// entitlement: "com.hillfamilyhoopla.shared").

private struct ExtensionAPIClient {
    static let shared = ExtensionAPIClient()

    private let baseURL = ProcessInfo.processInfo.environment["API_BASE_URL"]
        ?? "https://api.hillfamilyhoopla.com"

    // Keychain constants mirrored from KeychainService
    private let keychainService    = "com.hillfamilyhoopla.app"
    private let keychainAccessGroup = "$(AppIdentifierPrefix)com.hillfamilyhoopla.shared"
    private let accessTokenKey     = "auth.accessToken"

    private var accessToken: String? {
        let query: [String: Any] = [
            kSecClass as String:            kSecClassGenericPassword,
            kSecAttrService as String:      keychainService,
            kSecAttrAccount as String:      accessTokenKey,
            kSecAttrAccessGroup as String:  keychainAccessGroup,
            kSecReturnData as String:       true,
            kSecMatchLimit as String:       kSecMatchLimitOne,
        ]
        var result: AnyObject?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
              let data = result as? Data
        else { return nil }
        return String(data: data, encoding: .utf8)
    }

    private var isSignedIn: Bool { accessToken != nil }

    // Fetch upcoming events for the next 14 days
    func fetchUpcomingEvents() async throws -> [iMessageEvent] {
        guard let token = accessToken else { throw ExtAPIError.notSignedIn }

        let now  = Date()
        let end  = Calendar.current.date(byAdding: .day, value: 14, to: now) ?? now
        let iso  = ISO8601DateFormatter()
        let path = "/events?start=\(iso.string(from: now))&end=\(iso.string(from: end))&includeRecurring=true&limit=20"

        guard let url = URL(string: baseURL + path) else {
            throw ExtAPIError.badURL
        }
        var req = URLRequest(url: url)
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        req.setValue("application/json", forHTTPHeaderField: "Accept")

        let (data, response) = try await URLSession.shared.data(for: req)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw ExtAPIError.httpError
        }

        struct APIResponse: Decodable {
            struct Event: Decodable {
                let id: String
                let title: String
                let startTime: String
                let endTime: String
                let location: String?
                let colorOverride: String?
                let category: String?
            }
            let events: [Event]
        }
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        let body = try decoder.decode(APIResponse.self, from: data)

        return body.events.map { e in
            iMessageEvent(
                id: e.id, title: e.title,
                startTime: e.startTime, endTime: e.endTime,
                location: e.location,
                color: e.colorOverride ?? "#3B82F6",
                category: e.category
            )
        }
    }

    // Fetch a single event by ID
    func fetchEvent(id: String) async throws -> iMessageEvent {
        guard let token = accessToken else { throw ExtAPIError.notSignedIn }

        guard let url = URL(string: baseURL + "/events/\(id)") else {
            throw ExtAPIError.badURL
        }
        var req = URLRequest(url: url)
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        req.setValue("application/json", forHTTPHeaderField: "Accept")

        let (data, response) = try await URLSession.shared.data(for: req)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw ExtAPIError.httpError
        }

        struct APIResponse: Decodable {
            struct Wrapper: Decodable {
                let id: String
                let title: String
                let startTime: String
                let endTime: String
                let location: String?
                let colorOverride: String?
                let category: String?
            }
            let event: Wrapper
        }
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        let body = try decoder.decode(APIResponse.self, from: data)
        let e = body.event
        return iMessageEvent(
            id: e.id, title: e.title,
            startTime: e.startTime, endTime: e.endTime,
            location: e.location,
            color: e.colorOverride ?? "#3B82F6",
            category: e.category
        )
    }

    enum ExtAPIError: Error {
        case notSignedIn
        case badURL
        case httpError
    }
}

// ─── Event picker view ────────────────────────────────────────────────────────

struct iMessageEventPickerView: View {
    let onSelect: (iMessageEvent) -> Void

    @State private var events: [iMessageEvent] = []
    @State private var isLoading               = false
    @State private var errorMessage: String?   = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Header
            HStack {
                Text("Share an Event")
                    .font(.headline)
                Spacer()
                if isLoading {
                    ProgressView().scaleEffect(0.8)
                }
            }
            .padding(.horizontal)
            .padding(.top, 12)
            .padding(.bottom, 8)

            Divider()

            if let errorMessage {
                VStack(spacing: 12) {
                    Image(systemName: "exclamationmark.circle")
                        .font(.largeTitle)
                        .foregroundStyle(.secondary)
                    Text(errorMessage)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .padding()
            } else if !isLoading && events.isEmpty {
                VStack(spacing: 12) {
                    Image(systemName: "calendar.badge.exclamationmark")
                        .font(.largeTitle)
                        .foregroundStyle(.secondary)
                    Text("No upcoming events in the next 14 days")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .padding()
            } else {
                List(events, id: \.id) { event in
                    EventCardView(event: event)
                        .onTapGesture { onSelect(event) }
                        .listRowInsets(EdgeInsets(top: 4, leading: 12, bottom: 4, trailing: 12))
                }
                .listStyle(.plain)
            }
        }
        .task { await loadUpcomingEvents() }
    }

    private func loadUpcomingEvents() async {
        isLoading = true
        do {
            events = try await ExtensionAPIClient.shared.fetchUpcomingEvents()
        } catch ExtensionAPIClient.ExtAPIError.notSignedIn {
            errorMessage = "Sign in to HillFamilyHoopla to share events."
        } catch {
            errorMessage = "Couldn't load events. Check your connection."
        }
        isLoading = false
    }
}

// ─── Event detail view ────────────────────────────────────────────────────────

struct iMessageEventDetailView: View {
    let eventId: String
    let onShare: (iMessageEvent) -> Void

    @State private var event: iMessageEvent? = nil
    @State private var isLoading = true
    @State private var errorMessage: String? = nil

    var body: some View {
        Group {
            if isLoading {
                ProgressView("Loading event…")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let errorMessage {
                VStack(spacing: 12) {
                    Image(systemName: "exclamationmark.triangle")
                        .font(.largeTitle).foregroundStyle(.secondary)
                    Text(errorMessage)
                        .font(.subheadline).foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .padding()
            } else if let event {
                eventDetailContent(event)
            }
        }
        .task { await loadEvent() }
    }

    @ViewBuilder
    private func eventDetailContent(_ event: iMessageEvent) -> some View {
        VStack(spacing: 0) {
            // Color banner
            ZStack {
                Rectangle()
                    .fill(Color(hex: event.color) ?? .blue)
                    .frame(height: 100)
                VStack(spacing: 4) {
                    Text(event.categoryEmoji)
                        .font(.system(size: 40))
                    Text(event.title)
                        .font(.headline)
                        .foregroundStyle(.white)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal)
                }
            }

            List {
                Section {
                    Label(event.timeString, systemImage: "clock")
                        .font(.subheadline)

                    if let location = event.location {
                        Label(location, systemImage: "mappin.and.ellipse")
                            .font(.subheadline)
                    }
                }

                Section {
                    Button {
                        onShare(event)
                    } label: {
                        Label("Share in conversation", systemImage: "bubble.right.fill")
                            .font(.body.weight(.semibold))
                            .foregroundStyle(.blue)
                    }
                }
            }
            .listStyle(.insetGrouped)
        }
    }

    private func loadEvent() async {
        isLoading = true
        do {
            event = try await ExtensionAPIClient.shared.fetchEvent(id: eventId)
        } catch ExtensionAPIClient.ExtAPIError.notSignedIn {
            errorMessage = "Sign in to HillFamilyHoopla to view this event."
        } catch {
            errorMessage = "Couldn't load event details."
        }
        isLoading = false
    }
}

// ─── UIColor hex extension ────────────────────────────────────────────────────

extension UIColor {
    convenience init?(hex: String) {
        let h = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        guard Scanner(string: h).scanHexInt64(&int), h.count == 6 else { return nil }
        self.init(
            red:   CGFloat((int >> 16) & 0xFF) / 255,
            green: CGFloat((int >> 8)  & 0xFF) / 255,
            blue:  CGFloat(int         & 0xFF) / 255,
            alpha: 1
        )
    }
}
