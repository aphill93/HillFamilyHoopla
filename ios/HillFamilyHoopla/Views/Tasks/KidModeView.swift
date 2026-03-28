import SwiftUI

// ─── Kid Mode View ────────────────────────────────────────────────────────────

struct KidModeView: View {
    let userId: String
    let userName: String

    @StateObject private var viewModel = KidModeViewModel()
    @Environment(\.dismiss) private var dismiss
    @State private var showCelebration = false

    var body: some View {
        ZStack {
            // Background gradient
            LinearGradient(
                colors: [.blue.opacity(0.2), .purple.opacity(0.2)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .ignoresSafeArea()

            VStack(spacing: 24) {
                // Header
                VStack(spacing: 8) {
                    Text("👋")
                        .font(.system(size: 60))

                    Text("Hi, \(userName)!")
                        .font(.system(size: 38, weight: .black))
                        .foregroundStyle(.indigo)

                    Text("Your tasks for today")
                        .font(.title2.bold())
                        .foregroundStyle(.indigo.opacity(0.8))
                }
                .padding(.top, 32)

                if viewModel.isLoading {
                    ProgressView()
                        .scaleEffect(2)
                        .frame(maxHeight: .infinity)
                } else if viewModel.pendingTasks.isEmpty && viewModel.completedTasks.isEmpty {
                    noTasksView
                } else if viewModel.pendingTasks.isEmpty {
                    allDoneView
                } else {
                    taskGrid
                }

                Spacer()
            }
            .padding()

            // Celebration overlay
            if showCelebration {
                CelebrationView {
                    withAnimation { showCelebration = false }
                }
            }
        }
        .task { await viewModel.load(userId: userId) }
        .navigationBarBackButtonHidden()
        .toolbar {
            ToolbarItem(placement: .navigationBarLeading) {
                Button {
                    dismiss()
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.title2)
                        .foregroundStyle(.secondary)
                }
            }
        }
    }

    // ─── Task grid ────────────────────────────────────────────────────────────

    private var taskGrid: some View {
        ScrollView {
            LazyVGrid(
                columns: [GridItem(.flexible()), GridItem(.flexible())],
                spacing: 16
            ) {
                ForEach(viewModel.pendingTasks) { task in
                    KidTaskCard(task: task, isCompleting: viewModel.completingId == task.id) {
                        Task {
                            await viewModel.complete(task: task)
                            showCelebration = true
                        }
                    }
                }
            }

            // Completed tasks
            if !viewModel.completedTasks.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    Text("✅ Done (\(viewModel.completedTasks.count))")
                        .font(.headline)
                        .foregroundStyle(.green)
                        .padding(.top, 8)

                    LazyVGrid(
                        columns: [GridItem(.flexible()), GridItem(.flexible()), GridItem(.flexible())],
                        spacing: 8
                    ) {
                        ForEach(viewModel.completedTasks) { task in
                            VStack(spacing: 4) {
                                Text(task.emoji)
                                    .font(.system(size: 32))
                                Text(task.title)
                                    .font(.caption.bold())
                                    .foregroundStyle(.green)
                                    .strikethrough()
                                    .multilineTextAlignment(.center)
                                    .lineLimit(2)
                            }
                            .padding(8)
                            .frame(maxWidth: .infinity)
                            .background(.green.opacity(0.1), in: RoundedRectangle(cornerRadius: 12))
                        }
                    }
                }
            }
        }
    }

    private var noTasksView: some View {
        VStack(spacing: 12) {
            Text("🌈")
                .font(.system(size: 72))
            Text("No tasks right now!")
                .font(.title.bold())
                .foregroundStyle(.indigo)
            Text("Check back later")
                .font(.title3)
                .foregroundStyle(.secondary)
        }
        .frame(maxHeight: .infinity)
    }

    private var allDoneView: some View {
        VStack(spacing: 12) {
            Text("🏆")
                .font(.system(size: 72))
                .scaleEffect(showCelebration ? 1.2 : 1.0)
                .animation(.spring(response: 0.5, dampingFraction: 0.5), value: showCelebration)
            Text("All done!")
                .font(.system(size: 42, weight: .black))
                .foregroundStyle(.green)
            Text("You are amazing! 🌟")
                .font(.title2.bold())
                .foregroundStyle(.secondary)
        }
        .frame(maxHeight: .infinity)
    }
}

// ─── Kid Task Card ────────────────────────────────────────────────────────────

struct KidTaskCard: View {
    let task: KidModeTask
    let isCompleting: Bool
    let onComplete: () -> Void

    @State private var isPressed = false

    var body: some View {
        Button(action: onComplete) {
            VStack(spacing: 12) {
                Text(task.emoji)
                    .font(.system(size: 48))
                    .scaleEffect(isCompleting ? 0.8 : 1.0)
                    .animation(.spring(), value: isCompleting)

                Text(task.title)
                    .font(.headline.bold())
                    .multilineTextAlignment(.center)
                    .foregroundStyle(task.isCompleted ? .secondary : .primary)
                    .lineLimit(3)
                    .strikethrough(task.isCompleted)

                if isCompleting {
                    ProgressView()
                } else if !task.isCompleted {
                    Text("Tap to finish! 👆")
                        .font(.caption.bold())
                        .foregroundStyle(.indigo.opacity(0.7))
                }
            }
            .padding()
            .frame(maxWidth: .infinity)
            .frame(minHeight: 160)
            .background(
                task.isCompleted
                    ? AnyShapeStyle(.green.opacity(0.15))
                    : AnyShapeStyle(.background)
            )
            .clipShape(RoundedRectangle(cornerRadius: 20))
            .shadow(
                color: task.isCompleted ? .clear : .black.opacity(0.08),
                radius: 8,
                y: 4
            )
            .overlay(
                RoundedRectangle(cornerRadius: 20)
                    .stroke(
                        task.isCompleted ? Color.green : Color.indigo.opacity(0.3),
                        lineWidth: 2
                    )
            )
        }
        .buttonStyle(.plain)
        .disabled(task.isCompleted || isCompleting)
        .scaleEffect(isPressed ? 0.95 : 1.0)
        .animation(.spring(response: 0.3), value: isPressed)
        .simultaneousGesture(
            DragGesture(minimumDistance: 0)
                .onChanged { _ in isPressed = true }
                .onEnded { _ in isPressed = false }
        )
    }
}

// ─── Celebration overlay ──────────────────────────────────────────────────────

struct CelebrationView: View {
    let onDismiss: () -> Void
    @State private var scale: CGFloat = 0.3
    @State private var opacity: Double = 0

    private let emojis = ["⭐", "🎉", "✨", "🌟", "🎊", "💫", "🏆", "🎈"]

    var body: some View {
        ZStack {
            Color.yellow.opacity(0.9)
                .ignoresSafeArea()

            // Floating emojis
            ForEach(emojis.indices, id: \.self) { i in
                Text(emojis[i])
                    .font(.system(size: 40))
                    .position(
                        x: CGFloat.random(in: 20...UIScreen.main.bounds.width - 20),
                        y: CGFloat.random(in: 20...UIScreen.main.bounds.height - 20)
                    )
                    .opacity(opacity)
                    .animation(
                        .easeIn(duration: 0.5).delay(Double(i) * 0.1),
                        value: opacity
                    )
            }

            VStack(spacing: 20) {
                Text("⭐")
                    .font(.system(size: 80))
                    .scaleEffect(scale)
                    .animation(.spring(response: 0.5, dampingFraction: 0.4), value: scale)

                Text("Amazing!")
                    .font(.system(size: 52, weight: .black))
                    .foregroundStyle(.white)

                Text("Task complete!")
                    .font(.title.bold())
                    .foregroundStyle(.white.opacity(0.9))

                Button(action: onDismiss) {
                    Text("Yay! 🎉")
                        .font(.title2.bold())
                        .padding(.horizontal, 40)
                        .padding(.vertical, 16)
                        .background(.white)
                        .foregroundStyle(.yellow)
                        .clipShape(RoundedRectangle(cornerRadius: 20))
                        .shadow(radius: 8)
                }
            }
        }
        .onAppear {
            scale = 1.0
            opacity = 1.0
            // Auto-dismiss after 4 seconds
            DispatchQueue.main.asyncAfter(deadline: .now() + 4) {
                onDismiss()
            }
        }
    }
}

// ─── KidModeViewModel ─────────────────────────────────────────────────────────

@MainActor
final class KidModeViewModel: ObservableObject {
    @Published var tasks: [KidModeTask] = []
    @Published var isLoading = false
    @Published var completingId: String? = nil

    var pendingTasks: [KidModeTask] { tasks.filter { !$0.isCompleted } }
    var completedTasks: [KidModeTask] { tasks.filter(\.isCompleted) }

    private let api = APIClient.shared

    func load(userId: String) async {
        isLoading = true
        defer { isLoading = false }

        do {
            struct Response: Decodable { let tasks: [KidModeTask] }
            let response: Response = try await api.get(path: "/tasks/kid-mode/\(userId)")
            tasks = response.tasks
        } catch {
            print("Failed to load kid mode tasks:", error)
        }
    }

    func complete(task: KidModeTask) async {
        completingId = task.id
        defer { completingId = nil }

        do {
            struct Response: Decodable { let task: Task }
            _ = try await api.post(
                path: "/tasks/\(task.id)/complete",
                body: CompleteTaskRequest(celebrationShown: true)
            ) as Response
            if let idx = tasks.firstIndex(where: { $0.id == task.id }) {
                tasks[idx] = KidModeTask(
                    id: task.id,
                    title: task.title,
                    emoji: task.emoji,
                    isCompleted: true,
                    celebrationShown: true,
                    assigneeName: task.assigneeName,
                    assigneeColor: task.assigneeColor
                )
            }
        } catch {
            print("Failed to complete kid mode task:", error)
        }
    }
}
