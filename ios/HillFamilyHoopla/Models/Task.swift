import Foundation

// ─── Task model ───────────────────────────────────────────────────────────────

enum TaskStatus: String, Codable, CaseIterable {
    case pending    = "pending"
    case inProgress = "in-progress"
    case completed  = "completed"
    case cancelled  = "cancelled"

    var displayName: String {
        switch self {
        case .pending:    return "Pending"
        case .inProgress: return "In Progress"
        case .completed:  return "Completed"
        case .cancelled:  return "Cancelled"
        }
    }
}

enum TaskPriority: String, Codable, CaseIterable, Comparable {
    case low    = "low"
    case medium = "medium"
    case high   = "high"
    case urgent = "urgent"

    private var sortOrder: Int {
        switch self {
        case .low:    return 0
        case .medium: return 1
        case .high:   return 2
        case .urgent: return 3
        }
    }

    static func < (lhs: TaskPriority, rhs: TaskPriority) -> Bool {
        lhs.sortOrder < rhs.sortOrder
    }
}

struct TaskAssignee: Codable, Equatable {
    let id: String
    let name: String
    let profileColor: String

    var initials: String {
        let parts = name.split(separator: " ")
        if parts.count >= 2,
           let first = parts.first?.first,
           let last = parts.last?.first {
            return "\(first)\(last)".uppercased()
        }
        return String(name.prefix(1)).uppercased()
    }
}

struct TaskComment: Codable, Identifiable {
    let id: String
    let taskId: String
    let userId: String
    let content: String
    let createdAt: Date
    let author: TaskAssignee?
}

struct Task: Codable, Identifiable, Equatable {
    let id: String
    let createdBy: String
    let assignedTo: String?
    let title: String
    let description: String?
    let dueDate: Date?
    let priority: TaskPriority
    let status: TaskStatus
    let isKidMode: Bool
    let celebrationShown: Bool
    let category: String?
    let completedAt: Date?
    let createdAt: Date
    let updatedAt: Date
    var comments: [TaskComment]?
    let assignee: TaskAssignee?

    var isOverdue: Bool {
        guard let due = dueDate, status != .completed, status != .cancelled else {
            return false
        }
        return due < Date()
    }

    var isCompleted: Bool { status == .completed }
}

struct KidModeTask: Codable, Identifiable {
    let id: String
    let title: String
    let emoji: String
    let isCompleted: Bool
    let celebrationShown: Bool
    let assigneeName: String
    let assigneeColor: String
}

// ─── Request payloads ─────────────────────────────────────────────────────────

struct CreateTaskRequest: Encodable {
    let title: String
    let description: String?
    let assignedTo: String?
    let dueDate: String?    // ISO 8601
    let priority: String
    let isKidMode: Bool
    let category: String?
}

struct UpdateTaskRequest: Encodable {
    let title: String?
    let description: String?
    let assignedTo: String?
    let dueDate: String?
    let priority: String?
    let status: String?
    let isKidMode: Bool?
    let category: String?
}

struct CompleteTaskRequest: Encodable {
    let celebrationShown: Bool
}

struct AddCommentRequest: Encodable {
    let content: String
}
