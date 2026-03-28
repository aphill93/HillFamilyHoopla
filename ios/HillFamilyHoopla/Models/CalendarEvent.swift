import Foundation

// ─── Calendar Event model ─────────────────────────────────────────────────────

enum EventCategory: String, Codable, CaseIterable {
    case work     = "work"
    case school   = "school"
    case sports   = "sports"
    case medical  = "medical"
    case social   = "social"
    case family   = "family"
    case holiday  = "holiday"
    case other    = "other"

    var emoji: String {
        switch self {
        case .work:    return "💼"
        case .school:  return "📚"
        case .sports:  return "⚽"
        case .medical: return "🏥"
        case .social:  return "🎉"
        case .family:  return "👨‍👩‍👧‍👦"
        case .holiday: return "🎄"
        case .other:   return "📌"
        }
    }
}

enum AttendeeStatus: String, Codable {
    case invited   = "invited"
    case accepted  = "accepted"
    case declined  = "declined"
    case tentative = "tentative"
}

enum ReminderType: String, Codable {
    case push     = "push"
    case email    = "email"
    case imessage = "imessage"
}

struct RecurrenceRule: Codable, Equatable {
    let freq: String
    let interval: Int?
    let byDay: [String]?
    let byMonthDay: [Int]?
    let byMonth: [Int]?
    let until: String?
    let count: Int?
    let wkst: String?
}

struct EventAttendee: Codable, Identifiable {
    let userId: String
    let name: String
    let profileColor: String
    let status: AttendeeStatus

    var id: String { userId }
}

struct EventReminder: Codable, Identifiable {
    let id: String
    let eventId: String
    let userId: String
    let reminderType: ReminderType
    let minutesBefore: Int
    let isSent: Bool
    let sentAt: Date?
    let createdAt: Date
}

struct CalendarEvent: Codable, Identifiable, Equatable {
    let id: String
    let layerId: String
    let createdBy: String
    let title: String
    let description: String?
    let location: String?
    let startTime: Date
    let endTime: Date
    let isAllDay: Bool
    let category: EventCategory?
    let colorOverride: String?
    let isRecurring: Bool
    let recurrenceRule: RecurrenceRule?
    let recurrenceParentId: String?
    let isCancelled: Bool
    let externalId: String?
    let externalSource: String?
    var attendees: [EventAttendee]?
    var reminders: [EventReminder]?
    let createdAt: Date
    let updatedAt: Date

    // For expanded occurrences
    var occurrenceDate: String?
    var isException: Bool?

    var displayColor: String {
        colorOverride ?? "#3B82F6"
    }

    var formattedTimeRange: String {
        if isAllDay { return "All day" }
        let formatter = DateFormatter()
        formatter.timeStyle = .short
        return "\(formatter.string(from: startTime)) – \(formatter.string(from: endTime))"
    }

    static func == (lhs: CalendarEvent, rhs: CalendarEvent) -> Bool {
        lhs.id == rhs.id && lhs.updatedAt == rhs.updatedAt
    }
}

// ─── Calendar Layer ───────────────────────────────────────────────────────────

struct CalendarLayer: Codable, Identifiable, Equatable {
    let id: String
    let userId: String?
    let name: String
    let color: String
    let isFamilyLayer: Bool
    let isVisible: Bool
    let sortOrder: Int
    let createdAt: Date
}

// ─── Request payloads ─────────────────────────────────────────────────────────

struct CreateEventRequest: Encodable {
    let layerId: String
    let title: String
    let description: String?
    let location: String?
    let startTime: String   // ISO 8601
    let endTime: String     // ISO 8601
    let isAllDay: Bool
    let category: String?
    let colorOverride: String?
    let isRecurring: Bool
    let recurrenceRule: RecurrenceRule?
    let attendeeIds: [String]?
}

struct UpdateEventRequest: Encodable {
    let title: String?
    let description: String?
    let location: String?
    let startTime: String?
    let endTime: String?
    let isAllDay: Bool?
    let category: String?
    let colorOverride: String?
    let isCancelled: Bool?
    let updateScope: String?
}
