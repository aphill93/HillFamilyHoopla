import SwiftUI

// ─── Reset Password View ──────────────────────────────────────────────────────
//
// Opened via deep link: hillfamilyhoopla://reset-password?token=<token>
// The token is posted via NotificationCenter from the App's deep-link handler.

struct ResetPasswordView: View {
    @EnvironmentObject var authViewModel: AuthViewModel
    @Environment(\.dismiss) private var dismiss

    let token: String

    @State private var newPassword:     String = ""
    @State private var confirmPassword: String = ""
    @State private var showPassword:    Bool   = false
    @State private var success:         Bool   = false

    @FocusState private var focusedField: Field?
    enum Field: Hashable { case newPassword, confirmPassword }

    // ── Validation ────────────────────────────────────────────────────────────

    private var passwordMismatch: Bool {
        !confirmPassword.isEmpty && newPassword != confirmPassword
    }

    private var canSubmit: Bool {
        newPassword.count >= 8 &&
        newPassword == confirmPassword &&
        !authViewModel.isLoading
    }

    // ── Body ──────────────────────────────────────────────────────────────────

    var body: some View {
        NavigationStack {
            if success {
                successView
            } else {
                formView
            }
        }
    }

    // ── Success screen ────────────────────────────────────────────────────────

    private var successView: some View {
        VStack(spacing: 24) {
            Spacer()

            Image(systemName: "checkmark.shield.fill")
                .resizable()
                .scaledToFit()
                .frame(width: 72)
                .foregroundStyle(.green)

            Text("Password updated")
                .font(.title.bold())

            Text("Your password has been reset.\nYou can now sign in with your new password.")
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)

            Button("Sign in") { dismiss() }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)

            Spacer()
        }
        .padding()
        .navigationTitle("Password Reset")
        .navigationBarTitleDisplayMode(.inline)
    }

    // ── Form ──────────────────────────────────────────────────────────────────

    private var formView: some View {
        VStack(spacing: 20) {
            Text("Choose a new password for your account. It must be at least 8 characters.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.leading)
                .frame(maxWidth: .infinity, alignment: .leading)

            // Error banner
            if let error = authViewModel.errorMessage {
                HStack(spacing: 8) {
                    Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(.red)
                    Text(error).font(.footnote).foregroundStyle(.red)
                    Spacer()
                    Button { authViewModel.clearError() } label: {
                        Image(systemName: "xmark.circle.fill").foregroundStyle(.secondary)
                    }
                }
                .padding()
                .background(.red.opacity(0.08), in: RoundedRectangle(cornerRadius: 10))
            }

            // New password
            VStack(alignment: .leading, spacing: 6) {
                Text("New password").font(.subheadline.weight(.medium))
                ZStack(alignment: .trailing) {
                    Group {
                        if showPassword {
                            TextField("••••••••", text: $newPassword)
                        } else {
                            SecureField("••••••••", text: $newPassword)
                        }
                    }
                    .textContentType(.newPassword)
                    .focused($focusedField, equals: .newPassword)
                    .submitLabel(.next)
                    .onSubmit { focusedField = .confirmPassword }
                    .padding()
                    .background(Color(.systemGray6), in: RoundedRectangle(cornerRadius: 10))
                    .padding(.trailing, 40)

                    Button { showPassword.toggle() } label: {
                        Image(systemName: showPassword ? "eye.slash" : "eye")
                            .foregroundStyle(.secondary)
                    }
                    .padding(.trailing, 12)
                }
            }

            // Confirm password
            VStack(alignment: .leading, spacing: 6) {
                Text("Confirm new password").font(.subheadline.weight(.medium))
                SecureField("••••••••", text: $confirmPassword)
                    .textContentType(.newPassword)
                    .focused($focusedField, equals: .confirmPassword)
                    .submitLabel(.go)
                    .onSubmit { Task { await submit() } }
                    .padding()
                    .background(Color(.systemGray6), in: RoundedRectangle(cornerRadius: 10))

                if passwordMismatch {
                    Text("Passwords do not match")
                        .font(.caption)
                        .foregroundStyle(.red)
                }
            }

            // Submit
            Button {
                Task { await submit() }
            } label: {
                Group {
                    if authViewModel.isLoading {
                        ProgressView().tint(.white)
                    } else {
                        Text("Set new password").font(.body.weight(.semibold))
                    }
                }
                .frame(maxWidth: .infinity)
                .frame(height: 50)
            }
            .buttonStyle(.borderedProminent)
            .disabled(!canSubmit)
            .controlSize(.large)

            Spacer()
        }
        .padding()
        .background(Color(.systemGroupedBackground))
        .navigationTitle("Reset Password")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("Cancel") { dismiss() }
            }
        }
    }

    // ── Submit ────────────────────────────────────────────────────────────────

    private func submit() async {
        focusedField = nil
        let ok = await authViewModel.resetPassword(token: token, newPassword: newPassword)
        if ok { success = true }
    }
}
