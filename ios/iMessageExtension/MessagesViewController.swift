import UIKit
import Messages
import SwiftUI

// ─── iMessage Extension Main Controller ──────────────────────────────────────

class MessagesViewController: MSMessagesAppViewController {

    // ─── Lifecycle ────────────────────────────────────────────────────────────

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground
    }

    override func willBecomeActive(with conversation: MSConversation) {
        super.willBecomeActive(with: conversation)
        presentEventPicker(for: conversation)
    }

    override func didBecomeActive(with conversation: MSConversation) {
        super.didBecomeActive(with: conversation)
    }

    override func willResignActive(with conversation: MSConversation) {
        super.willResignActive(with: conversation)
    }

    // ─── Handle selected message ──────────────────────────────────────────────

    override func didSelect(_ message: MSMessage, conversation: MSConversation) {
        // Decode event from message URL
        if let url = message.url,
           let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
           let eventId = components.queryItems?.first(where: { $0.name == "eventId" })?.value {
            presentEventDetail(eventId: eventId, in: conversation)
        }
    }

    // ─── Views ────────────────────────────────────────────────────────────────

    private func presentEventPicker(for conversation: MSConversation) {
        // Remove existing child VCs
        for child in children {
            child.willMove(toParent: nil)
            child.view.removeFromSuperview()
            child.removeFromParent()
        }

        let hostingController = UIHostingController(
            rootView: iMessageEventPickerView { [weak self] event in
                self?.send(event: event, in: conversation)
            }
        )

        addChild(hostingController)
        hostingController.view.frame = view.bounds
        hostingController.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view.addSubview(hostingController.view)
        hostingController.didMove(toParent: self)
    }

    private func presentEventDetail(eventId: String, in conversation: MSConversation) {
        // Expand to detailed view when user taps an event bubble
        requestPresentationStyle(.expanded)

        for child in children {
            child.willMove(toParent: nil)
            child.view.removeFromSuperview()
            child.removeFromParent()
        }

        let hostingController = UIHostingController(
            rootView: iMessageEventDetailView(eventId: eventId) { [weak self] event in
                self?.send(event: event, in: conversation)
            }
        )

        addChild(hostingController)
        hostingController.view.frame = view.bounds
        hostingController.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view.addSubview(hostingController.view)
        hostingController.didMove(toParent: self)
    }

    // ─── Send event as iMessage ───────────────────────────────────────────────

    private func send(event: iMessageEvent, in conversation: MSConversation) {
        let layout = MSMessageTemplateLayout()
        layout.caption = event.title
        layout.subcaption = event.timeString
        layout.trailingSubcaption = event.location
        layout.image = createEventImage(for: event)

        var components = URLComponents()
        components.queryItems = [
            URLQueryItem(name: "eventId",   value: event.id),
            URLQueryItem(name: "title",     value: event.title),
            URLQueryItem(name: "startTime", value: event.startTime),
        ]

        let message = MSMessage(session: conversation.selectedMessage?.session ?? MSSession())
        message.layout = layout
        message.url = components.url
        message.summaryText = "📅 \(event.title) — \(event.timeString)"

        conversation.insert(message) { [weak self] error in
            if let error {
                print("[iMessage] Failed to insert message:", error)
            } else {
                self?.dismiss()
            }
        }
    }

    private func createEventImage(for event: iMessageEvent) -> UIImage? {
        // Generate a simple colored rectangle representing the event
        let size = CGSize(width: 300, height: 150)
        let renderer = UIGraphicsImageRenderer(size: size)
        return renderer.image { ctx in
            let color = UIColor(hex: event.color) ?? .systemBlue
            color.setFill()
            ctx.fill(CGRect(origin: .zero, size: size))

            let categoryText = event.categoryEmoji
            let attrs: [NSAttributedString.Key: Any] = [
                .font: UIFont.systemFont(ofSize: 60),
            ]
            let textSize = (categoryText as NSString).size(withAttributes: attrs)
            let textRect = CGRect(
                x: (size.width - textSize.width) / 2,
                y: (size.height - textSize.height) / 2,
                width: textSize.width,
                height: textSize.height
            )
            (categoryText as NSString).draw(in: textRect, withAttributes: attrs)
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
        guard let start = fmt.date(from: startTime),
              let end = fmt.date(from: endTime) else {
            return startTime
        }
        let df = DateFormatter()
        df.timeStyle = .short
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

// ─── SwiftUI wrapper views ────────────────────────────────────────────────────

struct iMessageEventPickerView: View {
    let onSelect: (iMessageEvent) -> Void

    @State private var events: [iMessageEvent] = []
    @State private var isLoading = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("Share an Event")
                .font(.headline)
                .padding()

            if isLoading {
                ProgressView().frame(maxWidth: .infinity).padding()
            } else if events.isEmpty {
                Text("No upcoming events")
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity)
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
        // In production this would call the API
        // For now, demo data:
        try? await Task.sleep(for: .seconds(0.5))
        events = []
        isLoading = false
    }
}

struct iMessageEventDetailView: View {
    let eventId: String
    let onShare: (iMessageEvent) -> Void

    var body: some View {
        Text("Event detail: \(eventId)")
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
