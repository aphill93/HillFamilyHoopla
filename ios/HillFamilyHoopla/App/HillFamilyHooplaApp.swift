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
            List {
                Section {
                    if let user = authViewModel.currentUser {
                        HStack(spacing: 12) {
                            Circle()
                                .fill(Color(hex: user.profileColor) ?? .blue)
                                .frame(width: 50, height: 50)
                                .overlay(
                                    Text(user.name.prefix(1).uppercased())
                                        .font(.title2.bold())
                                        .foregroundColor(.white)
                                )
                            VStack(alignment: .leading) {
                                Text(user.name).font(.headline)
                                Text(user.email).font(.subheadline).foregroundColor(.secondary)
                            }
                        }
                        .padding(.vertical, 4)
                    }
                }

                Section {
                    Button(role: .destructive) {
                        Task { await authViewModel.logout() }
                    } label: {
                        Label("Sign Out", systemImage: "arrow.right.square")
                    }
                }
            }
            .navigationTitle("Profile")
        }
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
