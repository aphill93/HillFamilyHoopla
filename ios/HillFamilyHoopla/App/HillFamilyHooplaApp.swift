import SwiftUI

@main
struct HillFamilyHooplaApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) var appDelegate
    @StateObject private var authViewModel = AuthViewModel()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(authViewModel)
                .onOpenURL { url in
                    handleDeepLink(url)
                }
        }
    }

    private func handleDeepLink(_ url: URL) {
        // Handle deep links such as:
        //   hillfamilyhoopla://reset-password?token=...
        //   hillfamilyhoopla://verify-email?token=...
        guard let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
              let host = components.host else { return }

        switch host {
        case "reset-password":
            if let token = components.queryItems?.first(where: { $0.name == "token" })?.value {
                NotificationCenter.default.post(
                    name: .passwordResetTokenReceived,
                    object: nil,
                    userInfo: ["token": token]
                )
            }
        case "verify-email":
            if let token = components.queryItems?.first(where: { $0.name == "token" })?.value {
                Task {
                    await authViewModel.verifyEmail(token: token)
                }
            }
        default:
            break
        }
    }
}

// ─── Root view ────────────────────────────────────────────────────────────────

struct ContentView: View {
    @EnvironmentObject var authViewModel: AuthViewModel

    var body: some View {
        Group {
            if authViewModel.isLoading {
                SplashView()
            } else if authViewModel.isAuthenticated {
                MainTabView()
            } else {
                LoginView()
            }
        }
        .animation(.easeInOut(duration: 0.25), value: authViewModel.isAuthenticated)
    }
}

struct SplashView: View {
    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: "calendar.circle.fill")
                .resizable()
                .frame(width: 80, height: 80)
                .foregroundColor(.blue)
            Text("HillFamilyHoopla")
                .font(.largeTitle.bold())
        }
    }
}

struct MainTabView: View {
    @EnvironmentObject var authViewModel: AuthViewModel

    var body: some View {
        TabView {
            CalendarView()
                .tabItem {
                    Label("Calendar", systemImage: "calendar")
                }

            TaskListView()
                .tabItem {
                    Label("Tasks", systemImage: "checklist")
                }

            ProfileView()
                .tabItem {
                    Label("Profile", systemImage: "person.circle")
                }
        }
    }
}

struct ProfileView: View {
    @EnvironmentObject var authViewModel: AuthViewModel

    var body: some View {
        NavigationStack {
            SettingsView()
        }
    }
}

// ─── Settings / Profile view ──────────────────────────────────────────────────

struct SettingsView: View {
    @EnvironmentObject var authViewModel: AuthViewModel

    // Profile edit state
    @State private var editName         = ""
    @State private var selectedColor    = ""
    @State private var isSavingProfile  = false
    @State private var profileSaved     = false

    // Change password sheet
    @State private var showChangePassword = false

    // Error / success
    @State private var alertMessage: String? = nil
    @State private var showAlert = false

    private let memberColors = [
        "#EF4444", "#F97316", "#EAB308", "#22C55E",
        "#3B82F6", "#8B5CF6", "#EC4899", "#14B8A6",
    ]

    var body: some View {
        List {
            // ── Avatar header ─────────────────────────────────────────────
            Section {
                HStack(spacing: 16) {
                    Circle()
                        .fill(Color(hex: selectedColor.isEmpty ? (authViewModel.currentUser?.profileColor ?? "#3B82F6") : selectedColor) ?? .blue)
                        .frame(width: 64, height: 64)
                        .overlay(
                            Text((editName.isEmpty ? authViewModel.currentUser?.name ?? "?" : editName)
                                .prefix(1).uppercased())
                                .font(.title.bold())
                                .foregroundStyle(.white)
                        )
                    VStack(alignment: .leading, spacing: 2) {
                        Text(authViewModel.currentUser?.name ?? "")
                            .font(.headline)
                        Text(authViewModel.currentUser?.email ?? "")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                        Text((authViewModel.currentUser?.role ?? "").capitalized)
                            .font(.caption)
                            .foregroundStyle(.tertiary)
                    }
                }
                .padding(.vertical, 6)
            }

            // ── Profile ───────────────────────────────────────────────────
            Section("Profile") {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Display name")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    TextField("Your name", text: $editName)
                }

                VStack(alignment: .leading, spacing: 10) {
                    Text("Profile color")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 8), spacing: 8) {
                        ForEach(memberColors, id: \.self) { hex in
                            let active = (selectedColor.isEmpty
                                ? authViewModel.currentUser?.profileColor
                                : selectedColor) == hex
                            Circle()
                                .fill(Color(hex: hex) ?? .blue)
                                .frame(width: 32, height: 32)
                                .overlay(
                                    Circle()
                                        .stroke(.white, lineWidth: active ? 3 : 0)
                                        .padding(2)
                                )
                                .overlay(
                                    Circle()
                                        .stroke(Color(hex: hex) ?? .blue, lineWidth: active ? 2 : 0)
                                )
                                .onTapGesture { selectedColor = hex }
                        }
                    }
                    .padding(.vertical, 4)
                }

                Button {
                    Task { await saveProfile() }
                } label: {
                    HStack {
                        Text(isSavingProfile ? "Saving…" : profileSaved ? "Saved ✓" : "Save profile")
                            .foregroundStyle(profileSaved ? .green : .blue)
                        if isSavingProfile { Spacer(); ProgressView().scaleEffect(0.8) }
                    }
                }
                .disabled(isSavingProfile || editName.trimmingCharacters(in: .whitespaces).isEmpty)
            }

            // ── Account / Security ────────────────────────────────────────
            Section("Security") {
                Button("Change password") {
                    showChangePassword = true
                }
            }

            // ── App info ──────────────────────────────────────────────────
            Section("About") {
                LabeledContent("Version") {
                    Text(Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "—")
                        .foregroundStyle(.secondary)
                }
                LabeledContent("Build") {
                    Text(Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "—")
                        .foregroundStyle(.secondary)
                }
            }

            // ── Sign out ──────────────────────────────────────────────────
            Section {
                Button(role: .destructive) {
                    Task { await authViewModel.logout() }
                } label: {
                    Label("Sign out", systemImage: "arrow.right.square")
                }
            }
        }
        .navigationTitle("Settings")
        .navigationBarTitleDisplayMode(.large)
        .onAppear {
            editName     = authViewModel.currentUser?.name ?? ""
            selectedColor = authViewModel.currentUser?.profileColor ?? ""
        }
        .sheet(isPresented: $showChangePassword) {
            ChangePasswordSheet()
                .environmentObject(authViewModel)
        }
        .alert("Error", isPresented: $showAlert, presenting: alertMessage) { _ in
            Button("OK", role: .cancel) {}
        } message: { msg in
            Text(msg)
        }
    }

    private func saveProfile() async {
        let name = editName.trimmingCharacters(in: .whitespaces)
        guard !name.isEmpty else { return }
        let color = selectedColor.isEmpty ? (authViewModel.currentUser?.profileColor ?? "#3B82F6") : selectedColor
        isSavingProfile = true
        defer { isSavingProfile = false }
        let ok = await authViewModel.updateProfile(name: name, profileColor: color)
        if ok {
            profileSaved = true
            DispatchQueue.main.asyncAfter(deadline: .now() + 2) { profileSaved = false }
        } else if let msg = authViewModel.errorMessage {
            alertMessage = msg
            showAlert = true
        }
    }
}

// ─── Change password sheet ────────────────────────────────────────────────────

struct ChangePasswordSheet: View {
    @EnvironmentObject var authViewModel: AuthViewModel
    @Environment(\.dismiss) private var dismiss

    @State private var currentPw = ""
    @State private var newPw     = ""
    @State private var confirmPw = ""
    @State private var isSubmitting = false
    @State private var errorMessage: String? = nil

    var body: some View {
        NavigationStack {
            Form {
                Section("Current password") {
                    SecureField("Current password", text: $currentPw)
                        .textContentType(.password)
                }
                Section("New password") {
                    SecureField("New password", text: $newPw)
                        .textContentType(.newPassword)
                    SecureField("Confirm new password", text: $confirmPw)
                        .textContentType(.newPassword)
                }
                if let errorMessage {
                    Section {
                        Text(errorMessage).foregroundStyle(.red).font(.callout)
                    }
                }
            }
            .navigationTitle("Change Password")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Update") { Task { await submit() } }
                        .disabled(currentPw.isEmpty || newPw.isEmpty || isSubmitting)
                }
            }
        }
    }

    private func submit() async {
        guard newPw == confirmPw else {
            errorMessage = "New passwords don't match."; return
        }
        guard newPw.count >= 8 else {
            errorMessage = "Password must be at least 8 characters."; return
        }
        isSubmitting = true
        errorMessage = nil
        defer { isSubmitting = false }
        let ok = await authViewModel.changePassword(current: currentPw, new: newPw)
        if ok { dismiss() }
        else { errorMessage = authViewModel.errorMessage ?? "Failed to update password." }
    }
}

// ─── Notification names ───────────────────────────────────────────────────────

extension Notification.Name {
    static let passwordResetTokenReceived = Notification.Name(
        "HillFamilyHoopla.passwordResetTokenReceived"
    )
}

// ─── Color extension ──────────────────────────────────────────────────────────

extension Color {
    init?(hex: String) {
        let h = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        guard Scanner(string: h).scanHexInt64(&int), h.count == 6 else { return nil }
        let r = Double((int >> 16) & 0xFF) / 255
        let g = Double((int >> 8)  & 0xFF) / 255
        let b = Double(int         & 0xFF) / 255
        self.init(red: r, green: g, blue: b)
    }
}
