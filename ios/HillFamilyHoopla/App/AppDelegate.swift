import UIKit
import UserNotifications

class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {

    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        // Configure push notifications
        UNUserNotificationCenter.current().delegate = self
        requestNotificationPermissions()
        return true
    }

    // ─── Push Notification Registration ──────────────────────────────────────

    private func requestNotificationPermissions() {
        UNUserNotificationCenter.current().requestAuthorization(
            options: [.alert, .badge, .sound]
        ) { granted, error in
            guard granted else {
                if let error { print("[APNs] Permission denied:", error) }
                return
            }
            DispatchQueue.main.async {
                UIApplication.shared.registerForRemoteNotifications()
            }
        }
    }

    func application(
        _ application: UIApplication,
        didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
    ) {
        let tokenString = deviceToken
            .map { String(format: "%02x", $0) }
            .joined()
        print("[APNs] Device token:", tokenString)

        // Send token to our API so we can send push notifications
        Task {
            await APNsService.shared.registerDeviceToken(tokenString)
        }
    }

    func application(
        _ application: UIApplication,
        didFailToRegisterForRemoteNotificationsWithError error: Error
    ) {
        print("[APNs] Failed to register:", error)
    }

    // ─── Foreground notifications ─────────────────────────────────────────────

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        // Show banner + sound even when app is in foreground
        completionHandler([.banner, .sound, .badge])
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        let userInfo = response.notification.request.content.userInfo

        // Route to the correct screen based on notification type
        if let type = userInfo["type"] as? String {
            switch type {
            case "event_reminder":
                if let eventId = userInfo["eventId"] as? String {
                    NotificationCenter.default.post(
                        name: .openEventDetail,
                        object: nil,
                        userInfo: ["eventId": eventId]
                    )
                }
            case "task_assigned":
                if let taskId = userInfo["taskId"] as? String {
                    NotificationCenter.default.post(
                        name: .openTaskDetail,
                        object: nil,
                        userInfo: ["taskId": taskId]
                    )
                }
            default:
                break
            }
        }

        completionHandler()
    }
}

// ─── APNs token upload service ────────────────────────────────────────────────

actor APNsService {
    static let shared = APNsService()
    private var lastUploadedToken: String?

    func registerDeviceToken(_ token: String) async {
        guard token != lastUploadedToken else { return }
        do {
            _ = try await APIClient.shared.patch(
                path: "/users/me/device-token",
                body: ["deviceToken": token, "platform": "ios"]
            )
            lastUploadedToken = token
        } catch {
            print("[APNs] Failed to upload device token:", error)
        }
    }
}

// ─── Notification names ───────────────────────────────────────────────────────

extension Notification.Name {
    static let openEventDetail = Notification.Name("HillFamilyHoopla.openEventDetail")
    static let openTaskDetail  = Notification.Name("HillFamilyHoopla.openTaskDetail")
}
