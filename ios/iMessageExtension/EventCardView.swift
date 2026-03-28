import SwiftUI

// ─── Event Card View for iMessage extension ───────────────────────────────────

struct EventCardView: View {
    let event: iMessageEvent

    var body: some View {
        HStack(spacing: 12) {
            // Color accent + emoji
            ZStack {
                RoundedRectangle(cornerRadius: 10)
                    .fill(Color(hex: event.color) ?? .blue)
                    .frame(width: 48, height: 48)
                Text(event.categoryEmoji)
                    .font(.title2)
            }

            // Event info
            VStack(alignment: .leading, spacing: 3) {
                Text(event.title)
                    .font(.subheadline.weight(.semibold))
                    .lineLimit(1)

                Text(event.timeString)
                    .font(.caption)
                    .foregroundStyle(.secondary)

                if let location = event.location {
                    Label(location, systemImage: "mappin")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
            }

            Spacer()

            Image(systemName: "chevron.right")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .padding(10)
        .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12))
    }
}

// ─── Minimal preview provider ─────────────────────────────────────────────────

#if DEBUG
#Preview {
    EventCardView(event: iMessageEvent(
        id: "preview-1",
        title: "Hill Family Dinner",
        startTime: "2026-03-28T18:00:00Z",
        endTime: "2026-03-28T19:30:00Z",
        location: "Home",
        color: "#3B82F6",
        category: "family"
    ))
    .padding()
}
#endif
