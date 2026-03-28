import SwiftUI

struct CalendarView: View {
    @StateObject private var viewModel = CalendarViewModel()
    @State private var showEventDetail: CalendarEvent? = nil
    @State private var showCreateEvent: Bool = false

    private let calendar = Calendar.current
    private let dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                // Month navigation header
                monthHeader

                // Day-of-week labels
                dayOfWeekRow

                Divider()

                // Month grid
                monthGrid

                Divider()

                // Selected day event list
                if !viewModel.events(for: viewModel.selectedDate).isEmpty {
                    selectedDayEvents
                }
            }
            .navigationTitle("Calendar")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button {
                        showCreateEvent = true
                    } label: {
                        Image(systemName: "plus")
                    }
                }
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Today") { viewModel.goToToday() }
                }
            }
            .sheet(item: $showEventDetail) { event in
                EventDetailSheet(event: event)
            }
            .sheet(isPresented: $showCreateEvent) {
                CreateEventSheet()
                    .environmentObject(viewModel)
            }
            .task { await viewModel.loadEventsForCurrentMonth() }
            .refreshable { await viewModel.refresh() }
        }
    }

    // ─── Month header ─────────────────────────────────────────────────────────

    private var monthHeader: some View {
        HStack {
            Button {
                viewModel.goToPreviousMonth()
            } label: {
                Image(systemName: "chevron.left")
                    .font(.title3)
                    .padding(8)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)

            Spacer()

            Text(viewModel.currentMonthTitle)
                .font(.headline)
                .animation(.none, value: viewModel.currentMonth)

            Spacer()

            Button {
                viewModel.goToNextMonth()
            } label: {
                Image(systemName: "chevron.right")
                    .font(.title3)
                    .padding(8)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal)
        .padding(.vertical, 8)
    }

    // ─── Day of week row ──────────────────────────────────────────────────────

    private var dayOfWeekRow: some View {
        HStack(spacing: 0) {
            ForEach(dayNames, id: \.self) { day in
                Text(day)
                    .font(.caption.weight(.medium))
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity)
            }
        }
        .padding(.horizontal, 4)
        .padding(.bottom, 4)
    }

    // ─── Month grid ───────────────────────────────────────────────────────────

    private var monthGrid: some View {
        let days = viewModel.daysInCurrentMonthGrid
        let columns = Array(repeating: GridItem(.flexible(), spacing: 0), count: 7)

        return LazyVGrid(columns: columns, spacing: 0) {
            ForEach(days, id: \.self) { date in
                CalendarDayCell(
                    date: date,
                    events: viewModel.events(for: date),
                    isCurrentMonth: calendar.isDate(date, equalTo: viewModel.currentMonth, toGranularity: .month),
                    isSelected: calendar.isDate(date, inSameDayAs: viewModel.selectedDate),
                    isToday: calendar.isDateInToday(date)
                ) {
                    viewModel.selectedDate = date
                }
            }
        }
        .padding(.horizontal, 4)
    }

    // ─── Selected day event list ──────────────────────────────────────────────

    private var selectedDayEvents: some View {
        let dayEvents = viewModel.events(for: viewModel.selectedDate)
        let formatter = DateFormatter()
        formatter.dateFormat = "EEEE, MMMM d"

        return VStack(alignment: .leading, spacing: 0) {
            Text(formatter.string(from: viewModel.selectedDate))
                .font(.subheadline.weight(.semibold))
                .padding(.horizontal)
                .padding(.top, 12)
                .padding(.bottom, 8)

            ScrollView {
                LazyVStack(spacing: 8) {
                    ForEach(dayEvents) { event in
                        CalendarEventRow(event: event)
                            .onTapGesture {
                                showEventDetail = event
                            }
                            .padding(.horizontal)
                    }
                }
                .padding(.bottom, 16)
            }
        }
        .frame(maxHeight: 250)
    }
}

// ─── Calendar day cell ────────────────────────────────────────────────────────

struct CalendarDayCell: View {
    let date: Date
    let events: [CalendarEvent]
    let isCurrentMonth: Bool
    let isSelected: Bool
    let isToday: Bool
    let onTap: () -> Void

    private let calendar = Calendar.current

    var body: some View {
        VStack(spacing: 2) {
            // Day number
            Text("\(calendar.component(.day, from: date))")
                .font(isToday ? .body.bold() : .body)
                .foregroundStyle(
                    isCurrentMonth ? (isToday ? .white : .primary) : .secondary
                )
                .frame(width: 32, height: 32)
                .background(
                    Group {
                        if isToday {
                            Circle().fill(Color.blue)
                        } else if isSelected {
                            Circle().stroke(Color.blue, lineWidth: 1.5)
                        } else {
                            Color.clear
                        }
                    }
                )

            // Event dots (up to 3)
            HStack(spacing: 2) {
                ForEach(events.prefix(3)) { event in
                    Circle()
                        .fill(Color(hex: event.displayColor) ?? .blue)
                        .frame(width: 5, height: 5)
                }
            }
            .frame(height: 8)
        }
        .frame(maxWidth: .infinity)
        .frame(height: 52)
        .contentShape(Rectangle())
        .onTapGesture(perform: onTap)
    }
}

// ─── Calendar event row (in day list) ────────────────────────────────────────

struct CalendarEventRow: View {
    let event: CalendarEvent

    var body: some View {
        HStack(spacing: 10) {
            RoundedRectangle(cornerRadius: 3)
                .fill(Color(hex: event.displayColor) ?? .blue)
                .frame(width: 4)

            VStack(alignment: .leading, spacing: 2) {
                Text(event.title)
                    .font(.subheadline.weight(.medium))
                    .lineLimit(1)

                Text(event.formattedTimeRange)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Spacer()

            if let category = event.category {
                Text(category.emoji)
                    .font(.subheadline)
            }
        }
        .padding(10)
        .background(Color(.systemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .shadow(color: .black.opacity(0.05), radius: 4, y: 2)
    }
}

// ─── Event detail sheet ───────────────────────────────────────────────────────

struct EventDetailSheet: View {
    let event: CalendarEvent
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List {
                Section {
                    VStack(alignment: .leading, spacing: 8) {
                        HStack {
                            if let category = event.category {
                                Text(category.emoji)
                                    .font(.title)
                            }
                            Text(event.title)
                                .font(.title2.bold())
                        }
                        Text(event.formattedTimeRange)
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                }

                if let location = event.location {
                    Section("Location") {
                        Label(location, systemImage: "mappin.and.ellipse")
                    }
                }

                if let description = event.description {
                    Section("Description") {
                        Text(description)
                    }
                }

                if let attendees = event.attendees, !attendees.isEmpty {
                    Section("Attendees (\(attendees.count))") {
                        ForEach(attendees) { attendee in
                            HStack {
                                Circle()
                                    .fill(Color(hex: attendee.profileColor) ?? .blue)
                                    .frame(width: 28, height: 28)
                                    .overlay(
                                        Text(attendee.name.prefix(1))
                                            .font(.caption.bold())
                                            .foregroundStyle(.white)
                                    )
                                Text(attendee.name)
                                Spacer()
                                Text(attendee.status.rawValue.capitalized)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                }
            }
            .navigationTitle("Event Details")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }
}

// ─── Create event sheet (stub) ────────────────────────────────────────────────

struct CreateEventSheet: View {
    @EnvironmentObject var viewModel: CalendarViewModel
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Text("Create Event — coming soon")
                .navigationTitle("New Event")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Cancel") { dismiss() }
                    }
                }
        }
    }
}
