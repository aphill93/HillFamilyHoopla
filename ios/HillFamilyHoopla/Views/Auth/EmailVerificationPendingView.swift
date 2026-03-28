import SwiftUI

// ─── Email Verification Pending View ─────────────────────────────────────────
//
// Shown after registration when email_verified == false.
// Sits as an overlay/sheet until the user verifies or dismisses.

struct EmailVerificationPendingView: View {
    @EnvironmentObject var authViewModel: AuthViewModel
    @Environment(\.dismiss) private var dismiss

    let email: String

    @State private var resendState: ResendState = .idle
    @State private var resendCooldown: Int = 0
    private let cooldownSeconds = 60

    enum ResendState { case idle, sending, sent, error }

    // ── Body ──────────────────────────────────────────────────────────────────

    var body: some View {
        VStack(spacing: 32) {
            Spacer(minLength: 40)

            // Icon
            ZStack {
                Circle()
                    .fill(Color.blue.opacity(0.1))
                    .frame(width: 100, height: 100)
                Image(systemName: "envelope.badge")
                    .resizable()
                    .scaledToFit()
                    .frame(width: 48)
                    .foregroundStyle(.blue)
            }

            // Headline
            VStack(spacing: 8) {
                Text("Verify your email")
                    .font(.title2.bold())

                Text("We sent a verification link to\n**\(email)**")
                    .multilineTextAlignment(.center)
                    .foregroundStyle(.secondary)
            }

            // Resend button
            VStack(spacing: 12) {
                Button {
                    Task { await resend() }
                } label: {
                    Group {
                        if resendState == .sending {
                            ProgressView()
                        } else if resendCooldown > 0 {
                            Text("Resend in \(resendCooldown)s")
                        } else {
                            Text("Resend verification email")
                        }
                    }
                    .frame(maxWidth: .infinity)
                    .frame(height: 50)
                    .font(.body.weight(.semibold))
                }
                .buttonStyle(.borderedProminent)
                .disabled(resendState == .sending || resendCooldown > 0)
                .controlSize(.large)

                if resendState == .sent {
                    Label("Email sent! Check your inbox.", systemImage: "checkmark.circle.fill")
                        .font(.footnote)
                        .foregroundStyle(.green)
                }

                if resendState == .error {
                    Label("Couldn't send email. Please try again.", systemImage: "exclamationmark.circle")
                        .font(.footnote)
                        .foregroundStyle(.red)
                }
            }

            Divider()

            // Dismiss — user can continue and verify later
            VStack(spacing: 8) {
                Text("You can verify later from Settings.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)

                Button("Continue without verifying") { dismiss() }
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }

            Spacer()
        }
        .padding(.horizontal, 32)
    }

    // ── Resend action ─────────────────────────────────────────────────────────

    private func resend() async {
        resendState = .sending
        let ok = await authViewModel.forgotPassword(email: email)
        resendState = ok ? .sent : .error
        if ok { startCooldown() }
    }

    private func startCooldown() {
        resendCooldown = cooldownSeconds
        Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { timer in
            if resendCooldown > 0 {
                resendCooldown -= 1
            } else {
                timer.invalidate()
            }
        }
    }
}
