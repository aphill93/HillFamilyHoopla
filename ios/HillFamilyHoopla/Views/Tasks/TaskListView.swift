import SwiftUI

struct TaskListView: View {
    @StateObject private var viewModel = TaskListViewModel()
    @EnvironmentObject var authViewModel: AuthViewModel
    @State private var showKidMode = false
    @State private var showCreateTask = false

    var body: some View {
        NavigationStack {
            Group {
                if viewModel.isLoading && viewModel.tasks.isEmpty {
                    ProgressView("Loading tasks…")
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if viewModel.tasks.isEmpty {
                    emptyState
                } else {
                    taskList
                }
            }
            .navigationTitle("Tasks")
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    if let user = authViewModel.currentUser, user.role == "child" {
                        Button {
                            showKidMode = true
                        } label: {
                            Label("Kid Mode", systemImage: "star.fill")
                                .foregroundStyle(.yellow)
                        }
                    }
                }
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button {
                        showCreateTask = true
                    } label: {
                        Image(systemName: "plus")
                    }
                }
            }
            .task { await viewModel.load() }
            .refreshable { await viewModel.load(force: true) }
            .sheet(isPresented: $showKidMode) {
                if let user = authViewModel.currentUser {
                    KidModeView(userId: user.id, userName: user.name)
                }
            }
            .sheet(isPresented: $showCreateTask) {
                CreateTaskSheet().environmentObject(viewModel)
            }
        }
    }

    // ─── Task list ────────────────────────────────────────────────────────────

    private var taskList: some View {
        List {
            // Filter chips
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(TaskStatus.allCases, id: \.self) { status in
                        FilterChip(
                            title: status.displayName,
                            isSelected: viewModel.statusFilter == status
                        ) {
                            viewModel.statusFilter = viewModel.statusFilter == status ? nil : status
                            Task { await viewModel.load(force: true) }
                        }
                    }
                }
                .padding(.vertical, 4)
            }
            .listRowInsets(EdgeInsets(top: 0, leading: 16, bottom: 0, trailing: 16))
            .listRowSeparator(.hidden)

            // Grouped by status
            ForEach(TaskStatus.allCases, id: \.self) { status in
                let group = viewModel.tasks.filter { $0.status == status }
                if !group.isEmpty {
                    Section(header: Text(status.displayName)) {
                        ForEach(group) { task in
                            TaskRow(task: task) {
                                Task { await viewModel.completeTask(task) }
                            }
                            .listRowInsets(EdgeInsets(top: 4, leading: 16, bottom: 4, trailing: 16))
                        }
                        .onDelete { indexSet in
                            Task {
                                let tasksToDelete = indexSet.map { group[$0] }
                                for t in tasksToDelete {
                                    await viewModel.deleteTask(t)
                                }
                            }
                        }
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
    }

    // ─── Empty state ──────────────────────────────────────────────────────────

    private var emptyState: some View {
        VStack(spacing: 16) {
            Image(systemName: "checklist")
                .font(.system(size: 60))
                .foregroundStyle(.secondary)
            Text("No tasks yet")
                .font(.title3.bold())
            Text("Tap + to create your first task.")
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

// ─── Task row ─────────────────────────────────────────────────────────────────

struct TaskRow: View {
    let task: Task
    let onComplete: () -> Void

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            // Checkbox
            Button(action: onComplete) {
                Image(
                    systemName: task.isCompleted ? "checkmark.circle.fill" : "circle"
                )
                .font(.title3)
                .foregroundStyle(task.isCompleted ? .green : .secondary)
            }
            .buttonStyle(.plain)
            .disabled(task.isCompleted || task.status == .cancelled)

            // Content
            VStack(alignment: .leading, spacing: 4) {
                HStack(alignment: .firstTextBaseline) {
                    Text(task.title)
                        .font(.body)
                        .strikethrough(task.isCompleted)
                        .foregroundStyle(task.isCompleted ? .secondary : .primary)
                        .lineLimit(2)

                    if task.isKidMode {
                        Text("⭐")
                    }
                }

                HStack(spacing: 6) {
                    // Priority
                    PriorityBadge(priority: task.priority)

                    // Due date
                    if let due = task.dueDate {
                        Label(
                            formatDueDate(due),
                            systemImage: "calendar"
                        )
                        .font(.caption)
                        .foregroundStyle(task.isOverdue ? .red : .secondary)
                    }

                    if let cat = task.category {
                        Text(cat)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
            }

            Spacer()

            // Assignee avatar
            if let assignee = task.assignee {
                Circle()
                    .fill(Color(hex: assignee.profileColor) ?? .blue)
                    .frame(width: 28, height: 28)
                    .overlay(
                        Text(assignee.initials)
                            .font(.caption2.bold())
                            .foregroundStyle(.white)
                    )
            }
        }
        .padding(.vertical, 4)
    }

    private func formatDueDate(_ date: Date) -> String {
        let cal = Calendar.current
        if cal.isDateInToday(date) { return "Today" }
        if cal.isDateInTomorrow(date) { return "Tomorrow" }
        let fmt = DateFormatter()
        fmt.dateFormat = "MMM d"
        return fmt.string(from: date)
    }
}

// ─── Priority badge ───────────────────────────────────────────────────────────

struct PriorityBadge: View {
    let priority: TaskPriority

    private var color: Color {
        switch priority {
        case .low:    return .gray
        case .medium: return .blue
        case .high:   return .orange
        case .urgent: return .red
        }
    }

    var body: some View {
        Text(priority.rawValue.capitalized)
            .font(.caption2.weight(.medium))
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(color.opacity(0.15))
            .foregroundStyle(color)
            .clipShape(Capsule())
    }
}

// ─── Filter chip ──────────────────────────────────────────────────────────────

struct FilterChip: View {
    let title: String
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(.subheadline.weight(isSelected ? .semibold : .regular))
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .background(isSelected ? Color.blue : Color(.systemGray6))
                .foregroundStyle(isSelected ? .white : .primary)
                .clipShape(Capsule())
        }
        .buttonStyle(.plain)
    }
}

// ─── Create task sheet (stub) ─────────────────────────────────────────────────

struct CreateTaskSheet: View {
    @EnvironmentObject var viewModel: TaskListViewModel
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Text("Create Task — coming soon")
                .navigationTitle("New Task")
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Cancel") { dismiss() }
                    }
                }
        }
    }
}

// ─── TaskListViewModel ────────────────────────────────────────────────────────

@MainActor
final class TaskListViewModel: ObservableObject {
    @Published var tasks: [Task] = []
    @Published var isLoading = false
    @Published var statusFilter: TaskStatus? = nil

    private let api = APIClient.shared

    func load(force: Bool = false) async {
        isLoading = true
        defer { isLoading = false }

        var path = "/tasks?limit=100&sortBy=dueDate&sortOrder=asc"
        if let status = statusFilter {
            path += "&status=\(status.rawValue)"
        }

        do {
            struct Response: Decodable { let tasks: [Task]; let total: Int }
            let response: Response = try await api.get(path: path)
            tasks = response.tasks
        } catch {
            print("Failed to load tasks:", error)
        }
    }

    func completeTask(_ task: Task) async {
        do {
            struct Response: Decodable { let task: Task }
            let response: Response = try await api.post(
                path: "/tasks/\(task.id)/complete",
                body: CompleteTaskRequest(celebrationShown: false)
            )
            if let idx = tasks.firstIndex(where: { $0.id == task.id }) {
                tasks[idx] = response.task
            }
        } catch {
            print("Failed to complete task:", error)
        }
    }

    func deleteTask(_ task: Task) async {
        do {
            try await api.delete(path: "/tasks/\(task.id)")
            tasks.removeAll { $0.id == task.id }
        } catch {
            print("Failed to delete task:", error)
        }
    }
}
