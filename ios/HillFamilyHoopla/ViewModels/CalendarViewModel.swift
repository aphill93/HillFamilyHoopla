import SwiftUI
import Combine

// ─── Calendar ViewModel ───────────────────────────────────────────────────────

@MainActor
final class CalendarViewModel: ObservableObject {
    @Published var events: [CalendarEvent] = []
    @Published var selectedDate: Date = Date()
    @Published var currentMonth: Date = Date()
    @Published var isLoading: Bool = false
    @Published var errorMessage: String? = nil
    @Published var selectedEvent: CalendarEvent? = nil
    @Published var layers: [CalendarLayer] = []

    private let api = APIClient.shared
    private var loadedRanges: Set<String> = []

    // ─── Load events for month ────────────────────────────────────────────────

    func loadEventsForCurrentMonth() async {
        let calendar = Calendar.current
        guard
            let start = calendar.date(from: calendar.dateComponents([.year, .month], from: currentMonth)),
            let end = calendar.date(byAdding: .month, value: 1, to: start)
        else { return }

        let rangeKey = "\(start.timeIntervalSince1970)-\(end.timeIntervalSince1970)"
        guard !loadedRanges.contains(rangeKey) else { return }

        isLoading = true
        defer { isLoading = false }

        let iso = ISO8601DateFormatter()
        let startStr = iso.string(from: start)
        let endStr   = iso.string(from: end)

        do {
            struct Response: Decodable {
                let events: [CalendarEvent]
                let count: Int
            }
            let response: Response = try await api.get(
                path: "/events?start=\(startStr)&end=\(endStr)&includeRecurring=true"
            )
            // Merge new events (avoid duplicates)
            let existingIds = Set(events.map(\.id))
            let newEvents = response.events.filter { !existingIds.contains($0.id) }
            events.append(contentsOf: newEvents)
            loadedRanges.insert(rangeKey)
        } catch {
            errorMessage = "Failed to load events: \(error.localizedDescription)"
        }
    }

    // ─── Events for a specific day ────────────────────────────────────────────

    func events(for date: Date) -> [CalendarEvent] {
        let cal = Calendar.current
        return events
            .filter { cal.isDate(date, inSameDayAs: $0.startTime) }
            .sorted { $0.startTime < $1.startTime }
    }

    // ─── Navigate months ──────────────────────────────────────────────────────

    func goToPreviousMonth() {
        currentMonth = Calendar.current.date(
            byAdding: .month,
            value: -1,
            to: currentMonth
        ) ?? currentMonth
        Task { await loadEventsForCurrentMonth() }
    }

    func goToNextMonth() {
        currentMonth = Calendar.current.date(
            byAdding: .month,
            value: 1,
            to: currentMonth
        ) ?? currentMonth
        Task { await loadEventsForCurrentMonth() }
    }

    func goToToday() {
        currentMonth = Date()
        selectedDate = Date()
        Task { await loadEventsForCurrentMonth() }
    }

    // ─── Create event ─────────────────────────────────────────────────────────

    func createEvent(_ request: CreateEventRequest) async throws -> CalendarEvent {
        struct Response: Decodable { let event: CalendarEvent }
        let response: Response = try await api.post(path: "/events", body: request)
        events.append(response.event)
        events.sort { $0.startTime < $1.startTime }
        return response.event
    }

    // ─── Delete event ─────────────────────────────────────────────────────────

    func deleteEvent(_ event: CalendarEvent) async throws {
        try await api.delete(path: "/events/\(event.id)")
        events.removeAll { $0.id == event.id }
    }

    // ─── Refresh ─────────────────────────────────────────────────────────────

    func refresh() async {
        loadedRanges.removeAll()
        events.removeAll()
        await loadEventsForCurrentMonth()
    }

    // ─── Calendar grid helpers ────────────────────────────────────────────────

    var daysInCurrentMonthGrid: [Date] {
        let cal = Calendar.current
        guard
            let monthStart = cal.date(from: cal.dateComponents([.year, .month], from: currentMonth)),
            let monthEnd = cal.date(byAdding: DateComponents(month: 1, day: -1), to: monthStart)
        else { return [] }

        // Week containing the 1st
        let gridStart = cal.date(from: cal.dateComponents(
            [.yearForWeekOfYear, .weekOfYear],
            from: monthStart
        )) ?? monthStart

        // Week containing the last day
        var components = cal.dateComponents([.yearForWeekOfYear, .weekOfYear], from: monthEnd)
        components.weekday = 7
        let gridEnd = cal.date(from: components) ?? monthEnd

        var dates: [Date] = []
        var current = gridStart
        while current <= gridEnd {
            dates.append(current)
            current = cal.date(byAdding: .day, value: 1, to: current) ?? current
        }
        return dates
    }

    var currentMonthTitle: String {
        let formatter = DateFormatter()
        formatter.dateFormat = "MMMM yyyy"
        return formatter.string(from: currentMonth)
    }
}
