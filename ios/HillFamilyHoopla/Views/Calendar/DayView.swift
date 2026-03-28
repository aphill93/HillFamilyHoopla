import SwiftUI

// ─── Day View — 15-minute segments ───────────────────────────────────────────

struct DayView: View {
    let date: Date
    let events: [CalendarEvent]

    @State private var scrollProxy: ScrollViewProxy? = nil

    private let hourHeight: CGFloat = 64  // 1 hour = 64pt → 1 segment (15 min) = 16pt
    private let segmentHeight: CGFloat = 16
    private let timeColumnWidth: CGFloat = 50
    private let hours = Array(0..<24)

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                ZStack(alignment: .topLeading) {
                    // ── Hour grid ─────────────────────────────────────────────
                    VStack(spacing: 0) {
                        ForEach(hours, id: \.self) { hour in
                            HStack(alignment: .top, spacing: 0) {
                                // Time label
                                Text(hourLabel(hour))
                                    .font(.caption2)
                                    .foregroundStyle(.secondary)
                                    .frame(width: timeColumnWidth, alignment: .trailing)
                                    .padding(.trailing, 8)
                                    .offset(y: -6)

                                // Divider line
                                Rectangle()
                                    .fill(Color(.systemGray5))
                                    .frame(height: 0.5)
                                    .frame(maxWidth: .infinity)
                            }
                            .frame(height: hourHeight)
                            .id(hour)
                        }
                    }

                    // ── Current time indicator ────────────────────────────────
                    if Calendar.current.isDateInToday(date) {
                        currentTimeIndicator
                    }

                    // ── Events ────────────────────────────────────────────────
                    ForEach(events) { event in
                        if !event.isAllDay {
                            DayEventBlock(
                                event: event,
                                hourHeight: hourHeight,
                                timeColumnWidth: timeColumnWidth
                            )
                        }
                    }
                }
                .frame(maxWidth: .infinity)
            }
            .onAppear {
                scrollProxy = proxy
                // Scroll to current hour on appear
                let currentHour = Calendar.current.component(.hour, from: Date())
                let targetHour = max(0, currentHour - 1)
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
                    proxy.scrollTo(targetHour, anchor: .top)
                }
            }
        }
    }

    // ─── All-day events banner ────────────────────────────────────────────────

    var allDayEvents: [CalendarEvent] { events.filter(\.isAllDay) }

    // ─── Current time indicator ───────────────────────────────────────────────

    private var currentTimeIndicator: some View {
        let now = Date()
        let cal = Calendar.current
        let hour = cal.component(.hour, from: now)
        let minute = cal.component(.minute, from: now)
        let yOffset = CGFloat(hour) * hourHeight + CGFloat(minute) / 60 * hourHeight

        return HStack(spacing: 0) {
            Spacer().frame(width: timeColumnWidth + 4)
            Circle()
                .fill(.red)
                .frame(width: 8, height: 8)
            Rectangle()
                .fill(.red)
                .frame(height: 1.5)
                .frame(maxWidth: .infinity)
        }
        .offset(y: yOffset)
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────

    private func hourLabel(_ hour: Int) -> String {
        if hour == 0  { return "12 AM" }
        if hour == 12 { return "12 PM" }
        if hour < 12  { return "\(hour) AM" }
        return "\(hour - 12) PM"
    }
}

// ─── Day event block ──────────────────────────────────────────────────────────

struct DayEventBlock: View {
    let event: CalendarEvent
    let hourHeight: CGFloat
    let timeColumnWidth: CGFloat

    @State private var showDetail = false

    private var yOffset: CGFloat {
        let cal = Calendar.current
        let hour = cal.component(.hour, from: event.startTime)
        let minute = cal.component(.minute, from: event.startTime)
        return CGFloat(hour) * hourHeight + CGFloat(minute) / 60 * hourHeight
    }

    private var blockHeight: CGFloat {
        let duration = event.endTime.timeIntervalSince(event.startTime)
        let hours = duration / 3600
        return max(CGFloat(hours) * hourHeight, 24)  // minimum 24pt tall
    }

    var body: some View {
        Button {
            showDetail = true
        } label: {
            VStack(alignment: .leading, spacing: 1) {
                Text(event.title)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.white)
                    .lineLimit(2)
                if blockHeight > 36 {
                    Text(event.formattedTimeRange)
                        .font(.caption2)
                        .foregroundStyle(.white.opacity(0.85))
                }
            }
            .padding(.horizontal, 6)
            .padding(.vertical, 3)
            .frame(maxWidth: .infinity, alignment: .leading)
            .frame(height: blockHeight)
            .background(
                RoundedRectangle(cornerRadius: 6)
                    .fill(Color(hex: event.displayColor) ?? .blue)
            )
        }
        .buttonStyle(.plain)
        .padding(.leading, timeColumnWidth + 8)
        .padding(.trailing, 8)
        .offset(y: yOffset)
        .sheet(isPresented: $showDetail) {
            EventDetailSheet(event: event)
        }
    }
}
