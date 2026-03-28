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

// ─── Create event sheet ───────────────────────────────────────────────────────

struct CreateEventSheet: View {
    @EnvironmentObject var viewModel: CalendarViewModel
    @Environment(\.dismiss) private var dismiss

    /// Pre-filled start date (e.g. tapped from day cell)
    var initialDate: Date = Date()

    // ── Form fields ──────────────────────────────────────────────────────────
    @State private var title:       String = ""
    @State private var description: String = ""
    @State private var location:    String = ""
    @State private var isAllDay:    Bool   = false
    @State private var startDate:   Date   = Date()
    @State private var endDate:     Date   = Date().addingTimeInterval(3600)
    @State private var category:    EventCategory? = nil
    @State private var selectedLayerId: String = ""
    @State private var attendeeIds: Set<String> = []
    @State private var reminderMinutes: Int = 30

    // ── UI state ─────────────────────────────────────────────────────────────
    @State private var isSubmitting: Bool   = false
    @State private var errorMessage: String? = nil
    @State private var members: [MemberProfile] = []
    @FocusState private var titleFocused: Bool

    // ── Reminder options ─────────────────────────────────────────────────────
    private let reminderOptions: [(label: String, minutes: Int)] = [
        ("None",        0),
        ("5 minutes",   5),
        ("15 minutes",  15),
        ("30 minutes",  30),
        ("1 hour",      60),
        ("1 day",       1440),
    ]

    var body: some View {
        NavigationStack {
            Form {
                // Title + all-day
                Section {
                    TextField("Title", text: $title)
                        .focused($titleFocused)
                    Toggle("All day", isOn: $isAllDay.animation())
                }

                // Dates
                Section {
                    if isAllDay {
                        DatePicker("Start", selection: $startDate, displayedComponents: .date)
                        DatePicker("End",   selection: $endDate,   in: startDate..., displayedComponents: .date)
                    } else {
                        DatePicker("Start", selection: $startDate)
                        DatePicker("End",   selection: $endDate,   in: startDate...)
                    }
                }

                // Calendar layer
                if !viewModel.layers.isEmpty {
                    Section("Calendar") {
                        Picker("Calendar", selection: $selectedLayerId) {
                            ForEach(viewModel.layers) { layer in
                                HStack {
                                    Circle()
                                        .fill(Color(hex: layer.color) ?? .blue)
                                        .frame(width: 10, height: 10)
                                    Text(layer.name)
                                }
                                .tag(layer.id)
                            }
                        }
                        .pickerStyle(.menu)
                    }
                }

                // Category
                Section("Category") {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            ForEach(EventCategory.allCases, id: \.self) { cat in
                                CategoryChip(
                                    category: cat,
                                    isSelected: category == cat
                                ) {
                                    category = (category == cat) ? nil : cat
                                }
                            }
                        }
                        .padding(.vertical, 4)
                    }
                }

                // Location
                Section("Location") {
                    TextField("Add location", text: $location)
                }

                // Description
                Section("Description") {
                    TextField("Add notes", text: $description, axis: .vertical)
                        .lineLimit(3...6)
                }

                // Attendees
                if !members.isEmpty {
                    Section("Attendees") {
                        ForEach(members) { member in
                            HStack {
                                Circle()
                                    .fill(Color(hex: member.profileColor) ?? .blue)
                                    .frame(width: 28, height: 28)
                                    .overlay(
                                        Text(member.name.prefix(1))
                                            .font(.caption.bold())
                                            .foregroundStyle(.white)
                                    )
                                Text(member.name)
                                Spacer()
                                if attendeeIds.contains(member.id) {
                                    Image(systemName: "checkmark")
                                        .foregroundStyle(.blue)
                                }
                            }
                            .contentShape(Rectangle())
                            .onTapGesture { toggleAttendee(member.id) }
                        }
                    }
                }

                // Reminder
                Section("Reminder") {
                    Picker("Remind me", selection: $reminderMinutes) {
                        ForEach(reminderOptions, id: \.minutes) { option in
                            Text(option.label).tag(option.minutes)
                        }
                    }
                }

                // Error
                if let errorMessage {
                    Section {
                        Text(errorMessage)
                            .foregroundStyle(.red)
                            .font(.callout)
                    }
                }
            }
            .navigationTitle("New Event")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Add") { Task { await submit() } }
                        .disabled(title.trimmingCharacters(in: .whitespaces).isEmpty || isSubmitting)
                        .overlay {
                            if isSubmitting {
                                ProgressView().scaleEffect(0.8)
                            }
                        }
                }
            }
            .onAppear {
                startDate = initialDate
                endDate   = initialDate.addingTimeInterval(3600)
                titleFocused = true
                // Pre-select family layer if available
                if let family = viewModel.layers.first(where: { $0.isFamilyLayer }) {
                    selectedLayerId = family.id
                } else {
                    selectedLayerId = viewModel.layers.first?.id ?? ""
                }
                Task { await loadMembers() }
            }
        }
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private func toggleAttendee(_ id: String) {
        if attendeeIds.contains(id) { attendeeIds.remove(id) }
        else { attendeeIds.insert(id) }
    }

    private func loadMembers() async {
        do {
            struct Response: Decodable { let users: [MemberProfile] }
            let response: Response = try await APIClient.shared.get(path: "/users")
            members = response.users
        } catch {
            // Non-critical; form still functional without attendees
        }
    }

    private func submit() async {
        let trimmedTitle = title.trimmingCharacters(in: .whitespaces)
        guard !trimmedTitle.isEmpty else { return }
        guard !selectedLayerId.isEmpty else {
            errorMessage = "Please select a calendar."; return
        }

        let iso = ISO8601DateFormatter()
        let startISO = iso.string(from: isAllDay ? Calendar.current.startOfDay(for: startDate) : startDate)
        var endForISO = endDate
        if isAllDay {
            // End of day
            endForISO = Calendar.current.date(
                bySettingHour: 23, minute: 59, second: 59, of: endDate
            ) ?? endDate
        }
        let endISO = iso.string(from: endForISO)

        isSubmitting = true
        errorMessage = nil
        defer { isSubmitting = false }

        let request = CreateEventRequest(
            layerId:       selectedLayerId,
            title:         trimmedTitle,
            description:   description.isEmpty ? nil : description,
            location:      location.isEmpty ? nil : location,
            startTime:     startISO,
            endTime:       endISO,
            isAllDay:      isAllDay,
            category:      category?.rawValue,
            colorOverride: nil,
            isRecurring:   false,
            recurrenceRule: nil,
            attendeeIds:   attendeeIds.isEmpty ? nil : Array(attendeeIds)
        )

        do {
            _ = try await viewModel.createEvent(request)
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

// ─── Supporting types ─────────────────────────────────────────────────────────

struct MemberProfile: Codable, Identifiable {
    let id: String
    let name: String
    let profileColor: String
    let role: String
}

// ─── Category chip ────────────────────────────────────────────────────────────

struct CategoryChip: View {
    let category: EventCategory
    let isSelected: Bool
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 4) {
                Text(category.emoji)
                Text(category.rawValue.capitalized)
                    .font(.caption.weight(.medium))
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(isSelected ? Color.blue : Color(.secondarySystemFill))
            .foregroundStyle(isSelected ? .white : .primary)
            .clipShape(Capsule())
        }
        .buttonStyle(.plain)
    }
}
